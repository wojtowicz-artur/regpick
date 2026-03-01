import { appError, type AppError } from "@/core/errors.js";
import { err, ok, type Result } from "@/core/result.js";
import { runSaga, type TransactionStep } from "@/core/saga.js";
import { buildInstallPlan, resolveRegistryDependencies } from "@/domain/addPlan.js";
import { applyAliases } from "@/domain/aliasCore.js";
import { InstallDependenciesStep, UpdateLockfileStep, WriteFileStep } from "@/domain/saga/index.js";
import { selectItemsFromFlags } from "@/domain/selection.js";
import { readConfig, resolveRegistrySource } from "@/shell/config.js";
import { collectMissingDependencies } from "@/shell/installer.js";
import { resolvePackageManager } from "@/shell/packageManagers/resolver.js";
import { loadRegistry, resolveFileContent } from "@/shell/registry.js";
import type {
  CommandContext,
  CommandOutcome,
  PlannedWrite,
  RegistryItem,
  RegpickConfig,
} from "@/types.js";

type AddPlanInteractionState = {
  selectedItems: RegistryItem[];
  missingDependencies: string[];
  missingDevDependencies: string[];
  plannedWrites: PlannedWrite[];
  existingTargets: Set<string>;
};

type ApprovedAddPlan = {
  selectedItems: RegistryItem[];
  shouldInstallDeps: boolean;
  finalWrites: PlannedWrite[];
  dependencyPlan: { dependencies: string[]; devDependencies: string[] }; // Combination of normal & dev
};

type HydratedAddPlan = ApprovedAddPlan & {
  // Contains the literal file content fully prepared, downloaded, and aliases applied
  hydratedWrites: { absoluteTarget: string; finalContent: string; itemName: string }[];
};

/**
 * Loads the configuration required for the add command.
 * Pure query phase.
 *
 * @param context - Command context.
 * @returns Result with configuration and path.
 */
async function queryLoadConfiguration(
  context: CommandContext,
): Promise<Result<{ config: RegpickConfig; configPath: string }, AppError>> {
  const result = await readConfig(context.cwd);
  if (!result.configPath) {
    context.runtime.prompt.error("No regpick.json configuration found. Please run 'init' first.");
    return err(appError("ValidationError", "No config file found"));
  }
  return ok(result as { config: RegpickConfig; configPath: string });
}

/**
 * Resolves the target registry source URL, alias, or local path.
 *
 * @param context - Command context.
 * @param config - Application configuration.
 * @returns Result with the registry source string.
 */
async function queryResolveRegistrySource(
  context: CommandContext,
  config: RegpickConfig,
): Promise<Result<string | null, AppError>> {
  const sourcePosIdx = context.args.positionals[0] === "add" ? 1 : 0;
  const argValue = context.args.positionals[sourcePosIdx];

  if (argValue) {
    return ok(resolveRegistrySource(argValue, config));
  }

  const aliases = Object.entries(config.registries || {}).map(([alias, value]) => ({
    label: `${alias} -> ${value}`,
    value: alias,
  }));

  if (aliases.length) {
    const picked = await context.runtime.prompt.multiselect({
      message: "Pick registry alias (or cancel and provide URL/path manually)",
      options: aliases,
      maxItems: 1,
      required: false,
    });

    if (await context.runtime.prompt.isCancel(picked)) {
      return err(appError("UserCancelled", "Operation cancelled."));
    }

    if (Array.isArray(picked) && picked.length > 0) {
      return ok(resolveRegistrySource(String(picked[0]), config));
    }
  }

  const manual = await context.runtime.prompt.text({
    message: "Registry URL/path:",
    placeholder: "https://example.com/registry.json",
  });

  if (await context.runtime.prompt.isCancel(manual)) {
    return err(appError("UserCancelled", "Operation cancelled."));
  }

  return ok(String(manual));
}

interface QueryItemsResult {
  selectedItems: RegistryItem[];
  missingRegistryDeps: string[];
}

/**
 * Fetches the registry and identifies items selected for installation.
 *
 * @param context - Command context.
 * @param source - Registry HTTP URL or local path.
 * @returns Result containing selected items and missing dependencies.
 */
async function queryRegistryItemsToProcess(
  context: CommandContext,
  source: string,
): Promise<Result<QueryItemsResult, AppError>> {
  const sourcePosIdx = context.args.positionals[0] === "add" ? 1 : 0;
  const itemPosIdx = sourcePosIdx + 1;

  const registryResult = await loadRegistry(source, context.cwd, context.runtime);
  if (!registryResult.ok) return registryResult;

  const { items } = registryResult.value;
  if (!items.length) {
    context.runtime.prompt.warn("No installable items in registry.");
    return err(appError("ValidationError", "No installable items in registry."));
  }

  const itemName = context.args.positionals[itemPosIdx];
  if (itemName && !context.args.flags.select) {
    context.args.flags.select = itemName;
  }

  const preselected = selectItemsFromFlags(items, context);
  let selectedItems: RegistryItem[];

  if (preselected.ok && preselected.value) {
    selectedItems = preselected.value;
  } else if (!preselected.ok) {
    return err(preselected.error);
  } else {
    const selectedNames = await context.runtime.prompt.autocompleteMultiselect({
      message: "Select items to install",
      options: items.map((item) => ({
        value: item.name,
        label: `${item.name} (${item.type || "registry:file"})`,
        hint: item.description || `${item.files.length} file(s)`,
      })),
      maxItems: 10,
      required: true,
    });

    if (await context.runtime.prompt.isCancel(selectedNames)) {
      return err(appError("UserCancelled", "Operation cancelled."));
    }

    const selectedSet = new Set((Array.isArray(selectedNames) ? selectedNames : []).map(String));
    selectedItems = items.filter((item) => selectedSet.has(item.name));
  }

  if (!selectedItems.length) {
    context.runtime.prompt.warn("No items selected.");
    return err(appError("ValidationError", "No items selected."));
  }

  const { resolvedItems, missingDependencies: missingRegistryDeps } = resolveRegistryDependencies(
    selectedItems,
    items,
  );

  return ok({ selectedItems: resolvedItems, missingRegistryDeps });
}

/**
 * Constructs the initial installation plan including structural dependencies and conflicts.
 *
 * @param context - Command context.
 * @param config - Application configuration.
 * @param selectedItems - Registry items to install.
 * @returns Result with interaction state payload.
 */
async function queryInstallPlanState(
  context: CommandContext,
  config: RegpickConfig,
  selectedItems: RegistryItem[],
): Promise<Result<AddPlanInteractionState, AppError>> {
  const installPlanProbeRes = buildInstallPlan(selectedItems, context.cwd, config);
  if (!installPlanProbeRes.ok) return err(installPlanProbeRes.error);

  const existingTargets = new Set<string>();
  const probeWrites = installPlanProbeRes.value.plannedWrites;

  for (const write of probeWrites) {
    const exists = await context.runtime.fs.pathExists(write.absoluteTarget);
    if (exists) existingTargets.add(write.absoluteTarget);
  }

  const finalInstallPlanRes = buildInstallPlan(selectedItems, context.cwd, config, existingTargets);
  if (!finalInstallPlanRes.ok) return err(finalInstallPlanRes.error);

  const { missingDependencies, missingDevDependencies } = collectMissingDependencies(
    selectedItems,
    context.cwd,
    context.runtime,
  );

  return ok({
    selectedItems,
    missingDependencies,
    missingDevDependencies,
    plannedWrites: finalInstallPlanRes.value.plannedWrites,
    existingTargets,
  });
}

/**
 * Prompts the user to resolve overrides, permissions, and dependencies installation.
 * Pure UI interaction boundary.
 *
 * @param context - Command context.
 * @param config - Application configuration.
 * @param state - The current pre-calculated installation state.
 * @returns Result with an approved action plan.
 */
async function interactApprovalPhase(
  context: CommandContext,
  config: RegpickConfig,
  state: AddPlanInteractionState,
): Promise<Result<ApprovedAddPlan, AppError>> {
  const assumeYes = Boolean(context.args.flags.yes);

  // 1. Confirm overall installation
  if (!assumeYes) {
    const proceed = await context.runtime.prompt.confirm({
      message: `Install ${state.selectedItems.length} item(s)?`,
      initialValue: true,
    });
    if ((await context.runtime.prompt.isCancel(proceed)) || !proceed) {
      return err(appError("UserCancelled", "Operation cancelled."));
    }
  }

  // 2. Interaction: File Overwrites
  const finalWrites: PlannedWrite[] = [];
  for (const write of state.plannedWrites) {
    if (state.existingTargets.has(write.absoluteTarget)) {
      if (assumeYes || config.overwritePolicy === "overwrite") {
        finalWrites.push(write);
      } else if (config.overwritePolicy === "skip") {
        context.runtime.prompt.warn(`Skipped existing file: ${write.absoluteTarget}`);
      } else {
        const answer = await context.runtime.prompt.select({
          message: `File exists: ${write.absoluteTarget}`,
          options: [
            { value: "overwrite", label: "Overwrite this file" },
            { value: "skip", label: "Skip this file" },
            { value: "abort", label: "Abort installation" },
          ],
        });

        if ((await context.runtime.prompt.isCancel(answer)) || answer === "abort") {
          return err(appError("UserCancelled", "Installation aborted by user."));
        }
        if (answer === "overwrite") finalWrites.push(write);
      }
    } else {
      finalWrites.push(write);
    }
  }

  // 3. Interaction: Dependencies
  let shouldInstallDeps = false;
  if (state.missingDependencies.length || state.missingDevDependencies.length) {
    if (assumeYes) {
      shouldInstallDeps = true;
    } else {
      const pm = resolvePackageManager(context.cwd, config.packageManager, context.runtime);
      const msgParts: string[] = [];
      if (state.missingDependencies.length)
        msgParts.push(`dependencies: ${state.missingDependencies.join(", ")}`);
      if (state.missingDevDependencies.length)
        msgParts.push(`devDependencies: ${state.missingDevDependencies.join(", ")}`);

      const proceedDep = await context.runtime.prompt.confirm({
        message: `Install missing packages with ${pm}? (${msgParts.join(" | ")})`,
        initialValue: true,
      });

      if (await context.runtime.prompt.isCancel(proceedDep)) {
        return err(appError("UserCancelled", "Dependency installation cancelled by user."));
      }
      shouldInstallDeps = Boolean(proceedDep);
      if (!shouldInstallDeps) {
        context.runtime.prompt.warn("Skipped dependency installation.");
      }
    }
  }

  return ok({
    selectedItems: state.selectedItems,
    shouldInstallDeps,
    finalWrites,
    dependencyPlan: {
      dependencies: state.missingDependencies,
      devDependencies: state.missingDevDependencies,
    },
  });
}

/**
 * Resolves and fetches the targeted file contents over network or disk.
 * Pre-loads all required remote IO before executing Saga transactions.
 *
 * @param context - Command context.
 * @param config - Application configuration.
 * @param approved - The user-approved installation plan.
 * @returns Result with hydrated payload containing raw file texts.
 */
async function queryHydrateContents(
  context: CommandContext,
  config: RegpickConfig,
  approved: ApprovedAddPlan,
): Promise<Result<HydratedAddPlan, AppError>> {
  const hydratedWrites = [];

  for (const write of approved.finalWrites) {
    const item = approved.selectedItems.find((entry) => entry.name === write.itemName);
    if (!item) continue;

    const contentResult = await resolveFileContent(
      write.sourceFile,
      item,
      context.cwd,
      context.runtime,
    );
    if (!contentResult.ok) return err(contentResult.error);

    const finalContent = applyAliases(contentResult.value, config);

    hydratedWrites.push({
      absoluteTarget: write.absoluteTarget,
      finalContent,
      itemName: write.itemName,
    });
  }

  return ok({ ...approved, hydratedWrites });
}

/**
 * Translates the hydrated user plan into a list of atomic transaction steps.
 *
 * @param context - Command context.
 * @param hydrated - Hydrated installation plan.
 * @returns Array of Saga transaction steps.
 */
function buildTransactionsCommand(
  context: CommandContext,
  hydrated: HydratedAddPlan,
): TransactionStep<any>[] {
  const sagaSteps: TransactionStep<any>[] = [];
  const installedItemsInfo: RegistryItem[] = [];

  // Write files
  for (const write of hydrated.hydratedWrites) {
    sagaSteps.push(new WriteFileStep(write.absoluteTarget, write.finalContent, context.runtime));

    const originalItem = hydrated.selectedItems.find((i) => i.name === write.itemName);
    if (originalItem && !installedItemsInfo.some((i) => i.name === originalItem.name)) {
      installedItemsInfo.push(originalItem);
    }
  }

  // Save Lockfile
  if (installedItemsInfo.length > 0) {
    sagaSteps.push(new UpdateLockfileStep(installedItemsInfo, context.cwd, context.runtime));
  }

  // Install Dependencies
  if (
    hydrated.shouldInstallDeps &&
    (hydrated.dependencyPlan.dependencies.length > 0 ||
      hydrated.dependencyPlan.devDependencies.length > 0)
  ) {
    sagaSteps.push(
      new InstallDependenciesStep(hydrated.dependencyPlan, context.cwd, context.runtime),
    );
  }

  return sagaSteps;
}

/**
 * Main controller for the `add` command.
 * Orchestrates CQS flow: State -> Interaction -> Hydration -> Command Builder -> Execution.
 *
 * @param context - Command context.
 * @returns Result indicating command outcome.
 */
export async function runAddCommand(
  context: CommandContext,
): Promise<Result<CommandOutcome, AppError>> {
  // 1. Initial State
  const configQ = await queryLoadConfiguration(context);
  if (!configQ.ok) return err(configQ.error);

  // 2. Discover Source & Targets
  const sourceQ = await queryResolveRegistrySource(context, configQ.value.config);
  if (!sourceQ.ok) return err(sourceQ.error);
  if (!sourceQ.value) return ok({ kind: "noop", message: "No source provided." });

  const itemsQ = await queryRegistryItemsToProcess(context, sourceQ.value);
  if (!itemsQ.ok) return err(itemsQ.error);

  for (const depName of itemsQ.value.missingRegistryDeps) {
    context.runtime.prompt.warn(`Registry dependency "${depName}" not found in current registry.`);
  }

  // 3. Plan & Interaction State Computation
  const planStateQ = await queryInstallPlanState(
    context,
    configQ.value.config,
    itemsQ.value.selectedItems,
  );
  if (!planStateQ.ok) return err(planStateQ.error);

  // 4. Resolve conflicts / prompts via User Interactions
  const approvedPlan = await interactApprovalPhase(context, configQ.value.config, planStateQ.value);
  if (!approvedPlan.ok) return err(approvedPlan.error);

  // 5. Hydrate Plan (Fetch network contents dynamically to avoid interrupting Saga runtime)
  const hydratedPlan = await queryHydrateContents(
    context,
    configQ.value.config,
    approvedPlan.value,
  );
  if (!hydratedPlan.ok) return err(hydratedPlan.error);

  // 6. Assemble Transactions
  const sagaSteps = buildTransactionsCommand(context, hydratedPlan.value);

  // 7. Execute!
  const runRes = await runSaga(sagaSteps, (stepName, status) => {
    if (status === "executing") {
      // Option to print executing
    } else if (status === "completed") {
      context.runtime.prompt.success(`[Success] ${stepName}`);
    } else if (status === "failed") {
      context.runtime.prompt.error(`[Failed] ${stepName}`);
    } else if (status === "compensating") {
      context.runtime.prompt.warn(`[Rollback] ${stepName}`);
    } else if (status === "interrupted") {
      context.runtime.prompt.error(`[Interrupted] Rolling back ${stepName}`);
    }
  });

  if (!runRes.ok) return runRes;

  context.runtime.prompt.info(
    `Installed ${hydratedPlan.value.selectedItems.length} item(s), wrote ${hydratedPlan.value.hydratedWrites.length} file(s).`,
  );
  return ok({
    kind: "success",
    message: `Installed ${hydratedPlan.value.selectedItems.length} item(s), wrote ${hydratedPlan.value.hydratedWrites.length} file(s).`,
  });
}
