import { appError, type AppError } from "@/core/errors.js";
import { PipelineRenderer } from "@/core/pipeline.js";
import { err, ok, type Result } from "@/core/result.js";
import { MemoryVFS } from "@/core/vfs.js";
import { buildInstallPlan, resolveRegistryDependencies } from "@/domain/addPlan.js";
import { applyAliases } from "@/domain/aliasCore.js";
import { selectItemsFromFlags } from "@/domain/selection.js";
import { coreAddPlugin } from "@/plugins/coreAddPlugin.js";
import { readConfig, resolveRegistrySource } from "@/shell/config.js";
import { collectMissingDependencies } from "@/shell/installer.js";
import { resolvePackageManager } from "@/shell/packageManagers/resolver.js";
import { loadRegistry, resolveFileContent } from "@/shell/registry.js";
import { DirectoryPlugin, FilePlugin, HttpPlugin, loadPlugins } from "@/shell/plugins/index.js";
import type {
  CommandContext,
  CommandOutcome,
  PlannedWrite,
  RegistryItem,
  RegpickConfig,
  RegpickPlugin,
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
  hydratedWrites: {
    absoluteTarget: string;
    finalContent: string;
    itemName: string;
  }[];
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

  const aliases = Object.entries(config.registry?.sources || {} || {}).map(([alias, value]) => ({
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
  plugins: RegpickPlugin[],
): Promise<Result<QueryItemsResult, AppError>> {
  const sourcePosIdx = context.args.positionals[0] === "add" ? 1 : 0;
  const itemPosIdx = sourcePosIdx + 1;

  const registryResult = await loadRegistry(source, context.cwd, context.runtime, plugins);
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
      if (assumeYes || (config.install?.overwritePolicy || "prompt") === "overwrite") {
        finalWrites.push(write);
      } else if ((config.install?.overwritePolicy || "prompt") === "skip") {
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
      const pm = resolvePackageManager(
        context.cwd,
        config.install?.packageManager || "auto",
        context.runtime,
      );
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
 * Pre-loads all required remote IO before executing pipeline runtime.
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
  plugins: RegpickPlugin[],
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
      plugins,
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

export async function runAddCommand(
  context: CommandContext,
): Promise<Result<CommandOutcome, AppError>> {
  const configQ = await queryLoadConfiguration(context);
  if (!configQ.ok) return err(configQ.error);

  const sourceQ = await queryResolveRegistrySource(context, configQ.value.config);
  if (!sourceQ.ok) return err(sourceQ.error);
  if (!sourceQ.value) return ok({ kind: "noop", message: "No source provided." });

  const customPlugins = await loadPlugins(configQ.value.config.plugins || [], context.cwd);
  const plugins = [...customPlugins, HttpPlugin(), FilePlugin(), DirectoryPlugin()];

  const itemsQ = await queryRegistryItemsToProcess(context, sourceQ.value, plugins);
  if (!itemsQ.ok) return err(itemsQ.error);

  for (const depName of itemsQ.value.missingRegistryDeps) {
    context.runtime.prompt.warn(`Registry dependency "${depName}" not found in current registry.`);
  }

  const planStateQ = await queryInstallPlanState(
    context,
    configQ.value.config,
    itemsQ.value.selectedItems,
  );
  if (!planStateQ.ok) return err(planStateQ.error);

  const approvedPlan = await interactApprovalPhase(context, configQ.value.config, planStateQ.value);
  if (!approvedPlan.ok) return err(approvedPlan.error);

  const hydratedPlan = await queryHydrateContents(
    context,
    configQ.value.config,
    approvedPlan.value,
    plugins,
  );
  if (!hydratedPlan.ok) return err(hydratedPlan.error);

  const vfsFiles = hydratedPlan.value.hydratedWrites.map((write) => ({
    id: write.absoluteTarget,
    code: write.finalContent,
  }));

  const installedItemsInfo: RegistryItem[] = [];
  for (const write of hydratedPlan.value.hydratedWrites) {
    const originalItem = hydratedPlan.value.selectedItems.find((i) => i.name === write.itemName);
    if (originalItem && !installedItemsInfo.some((i) => i.name === originalItem.name)) {
      installedItemsInfo.push(originalItem);
    }
  }

  const vfs = new MemoryVFS();

  const userPlugins = configQ.value.config.plugins || [];

  const pipeline = new PipelineRenderer([
    ...userPlugins,
    coreAddPlugin(
      hydratedPlan.value.dependencyPlan,
      configQ.value.config,
      context.runtime,
      installedItemsInfo,
    ),
  ]);

  try {
    await pipeline.run({ vfs, cwd: context.cwd }, vfsFiles);
  } catch (error) {
    vfs.rollback();
    context.runtime.prompt.error(`[Failed] Installation aborted: ${error}`);
    return err(appError("RuntimeError", String(error)));
  }

  context.runtime.prompt.info(
    `Installed ${hydratedPlan.value.selectedItems.length} item(s), wrote ${hydratedPlan.value.hydratedWrites.length} file(s).`,
  );
  return ok({
    kind: "success",
    message: `Installed ${hydratedPlan.value.selectedItems.length} item(s), wrote ${hydratedPlan.value.hydratedWrites.length} file(s).`,
  });
}
