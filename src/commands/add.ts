import { appError, type AppError } from "@/core/errors.js";
import { PipelineRenderer } from "@/core/pipeline.js";
import { MemoryVFS } from "@/core/vfs.js";
import { buildInstallPlan, resolveRegistryDependencies } from "@/domain/addPlan.js";
import { applyAliases } from "@/domain/aliasCore.js";
import { selectItemsFromFlags } from "@/domain/selection.js";
import { coreAddPlugin } from "@/plugins/coreAddPlugin.js";
import { readConfig, resolveRegistrySource } from "@/shell/config.js";
import { collectMissingDependencies } from "@/shell/installer.js";
import { resolvePackageManager } from "@/shell/packageManagers/resolver.js";
import { DirectoryPlugin, FilePlugin, HttpPlugin, loadPlugins } from "@/shell/plugins/index.js";
import { loadRegistry, resolveFileContent } from "@/shell/registry.js";
import type {
  CommandContext,
  CommandOutcome,
  PlannedWrite,
  RegistryItem,
  RegpickConfig,
  RegpickPlugin,
} from "@/types.js";
import { Effect, Either } from "effect";

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
 * @returns Either with configuration and path.
 */
async function queryLoadConfiguration(
  context: CommandContext,
): Promise<Either.Either<{ config: RegpickConfig; configPath: string }, AppError>> {
  const result = await readConfig(context.cwd);
  if (!result.configPath) {
    context.runtime.prompt.error("No regpick.json configuration found. Please run 'init' first.");
    return Either.left(appError("ValidationError", "No config file found"));
  }
  return Either.right(result as { config: RegpickConfig; configPath: string });
}

/**
 * Resolves the target registry source URL, alias, or local path.
 *
 * @param context - Command context.
 * @param config - Application configuration.
 * @returns Either with the registry source string.
 */
async function queryResolveRegistrySource(
  context: CommandContext,
  config: RegpickConfig,
): Promise<Either.Either<string | null, AppError>> {
  const sourcePosIdx = context.args.positionals[0] === "add" ? 1 : 0;
  const argValue = context.args.positionals[sourcePosIdx];

  if (argValue) {
    return Either.right(resolveRegistrySource(argValue, config));
  }

  const aliases = Object.entries(config.registry?.sources || {} || {}).map(([alias, value]) => ({
    label: `${alias} -> ${value}`,
    value: alias,
  }));

  if (aliases.length) {
    const picked = await Effect.runPromise(
      context.runtime.prompt.multiselect({
        message: "Pick registry alias (or cancel and provide URL/path manually)",
        options: aliases,
        maxItems: 1,
        required: false,
      }),
    );

    if (await Effect.runPromise(context.runtime.prompt.isCancel(picked))) {
      return Either.left(appError("UserCancelled", "Operation cancelled."));
    }

    if (Array.isArray(picked) && picked.length > 0) {
      return Either.right(resolveRegistrySource(String(picked[0]), config));
    }
  }

  const manual = await Effect.runPromise(
    context.runtime.prompt.text({
      message: "Registry URL/path:",
      placeholder: "https://example.com/registry.json",
    }),
  );

  if (await Effect.runPromise(context.runtime.prompt.isCancel(manual))) {
    return Either.left(appError("UserCancelled", "Operation cancelled."));
  }

  return Either.right(String(manual));
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
 * @returns Either containing selected items and missing dependencies.
 */
async function queryRegistryItemsToProcess(
  context: CommandContext,
  source: string,
  plugins: RegpickPlugin[],
): Promise<Either.Either<QueryItemsResult, AppError>> {
  const sourcePosIdx = context.args.positionals[0] === "add" ? 1 : 0;
  const itemPosIdx = sourcePosIdx + 1;

  const registryResult = await loadRegistry(source, context.cwd, context.runtime, plugins);
  if (Either.isLeft(registryResult)) return Either.left(registryResult.left);

  const { items } = registryResult.right;
  if (!items.length) {
    context.runtime.prompt.warn("No installable items in registry.");
    return Either.left(appError("ValidationError", "No installable items in registry."));
  }

  const itemName = context.args.positionals[itemPosIdx];
  if (itemName && !context.args.flags.select) {
    context.args.flags.select = itemName;
  }

  const preselected = selectItemsFromFlags(items, context);
  let selectedItems: RegistryItem[];

  if (Either.isRight(preselected) && preselected.right) {
    selectedItems = preselected.right;
  } else if (Either.isLeft(preselected)) {
    return Either.left(preselected.left);
  } else {
    const selectedNames = await Effect.runPromise(
      context.runtime.prompt.autocompleteMultiselect({
        message: "Select items to install",
        options: items.map((item) => ({
          value: item.name,
          label: `${item.name} (${item.type || "registry:file"})`,
          hint: item.description || `${item.files.length} file(s)`,
        })),
        maxItems: 10,
        required: true,
      }),
    );

    if (await Effect.runPromise(context.runtime.prompt.isCancel(selectedNames))) {
      return Either.left(appError("UserCancelled", "Operation cancelled."));
    }

    const selectedSet = new Set((Array.isArray(selectedNames) ? selectedNames : []).map(String));
    selectedItems = items.filter((item) => selectedSet.has(item.name));
  }

  if (!selectedItems.length) {
    context.runtime.prompt.warn("No items selected.");
    return Either.left(appError("ValidationError", "No items selected."));
  }

  const { resolvedItems, missingDependencies: missingRegistryDeps } = resolveRegistryDependencies(
    selectedItems,
    items,
  );

  return Either.right({ selectedItems: resolvedItems, missingRegistryDeps });
}

/**
 * Constructs the initial installation plan including structural dependencies and conflicts.
 *
 * @param context - Command context.
 * @param config - Application configuration.
 * @param selectedItems - Registry items to install.
 * @returns Either with interaction state payload.
 */
async function queryInstallPlanState(
  context: CommandContext,
  config: RegpickConfig,
  selectedItems: RegistryItem[],
): Promise<Either.Either<AddPlanInteractionState, AppError>> {
  const installPlanProbeRes = buildInstallPlan(selectedItems, context.cwd, config);
  if (Either.isLeft(installPlanProbeRes)) return Either.left(installPlanProbeRes.left);

  const existingTargets = new Set<string>();
  const probeWrites = installPlanProbeRes.right.plannedWrites;

  for (const write of probeWrites) {
    const exists = await Effect.runPromise(context.runtime.fs.pathExists(write.absoluteTarget));
    if (exists) existingTargets.add(write.absoluteTarget);
  }

  const finalInstallPlanRes = buildInstallPlan(selectedItems, context.cwd, config, existingTargets);
  if (Either.isLeft(finalInstallPlanRes)) return Either.left(finalInstallPlanRes.left);

  const { missingDependencies, missingDevDependencies } = collectMissingDependencies(
    selectedItems,
    context.cwd,
    context.runtime,
  );

  return Either.right({
    selectedItems,
    missingDependencies,
    missingDevDependencies,
    plannedWrites: finalInstallPlanRes.right.plannedWrites,
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
 * @returns Either with an approved action plan.
 */
async function interactApprovalPhase(
  context: CommandContext,
  config: RegpickConfig,
  state: AddPlanInteractionState,
): Promise<Either.Either<ApprovedAddPlan, AppError>> {
  const assumeYes = Boolean(context.args.flags.yes);

  // 1. Confirm overall installation
  if (!assumeYes) {
    const proceed = await Effect.runPromise(
      context.runtime.prompt.confirm({
        message: `Install ${state.selectedItems.length} item(s)?`,
        initialValue: true,
      }),
    );
    if ((await Effect.runPromise(context.runtime.prompt.isCancel(proceed))) || !proceed) {
      return Either.left(appError("UserCancelled", "Operation cancelled."));
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
        const answer = await Effect.runPromise(
          context.runtime.prompt.select({
            message: `File exists: ${write.absoluteTarget}`,
            options: [
              { value: "overwrite", label: "Overwrite this file" },
              { value: "skip", label: "Skip this file" },
              { value: "abort", label: "Abort installation" },
            ],
          }),
        );

        if (
          (await Effect.runPromise(context.runtime.prompt.isCancel(answer))) ||
          answer === "abort"
        ) {
          return Either.left(appError("UserCancelled", "Installation aborted by user."));
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

      const proceedDep = await Effect.runPromise(
        context.runtime.prompt.confirm({
          message: `Install missing packages with ${pm}? (${msgParts.join(" | ")})`,
          initialValue: true,
        }),
      );

      if (await Effect.runPromise(context.runtime.prompt.isCancel(proceedDep))) {
        return Either.left(appError("UserCancelled", "Dependency installation cancelled by user."));
      }
      shouldInstallDeps = Boolean(proceedDep);
      if (!shouldInstallDeps) {
        context.runtime.prompt.warn("Skipped dependency installation.");
      }
    }
  }

  return Either.right({
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
 * @returns Either with hydrated payload containing raw file texts.
 */
async function queryHydrateContents(
  context: CommandContext,
  config: RegpickConfig,
  approved: ApprovedAddPlan,
  plugins: RegpickPlugin[],
): Promise<Either.Either<HydratedAddPlan, AppError>> {
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
    if (Either.isLeft(contentResult)) return Either.left(contentResult.left);

    const finalContent = applyAliases(contentResult.right, config);

    hydratedWrites.push({
      absoluteTarget: write.absoluteTarget,
      finalContent,
      itemName: write.itemName,
    });
  }

  return Either.right({ ...approved, hydratedWrites });
}

export async function runAddCommand(
  context: CommandContext,
): Promise<Either.Either<CommandOutcome, AppError>> {
  const configQ = await queryLoadConfiguration(context);
  if (Either.isLeft(configQ)) return Either.left(configQ.left);

  const sourceQ = await queryResolveRegistrySource(context, configQ.right.config);
  if (Either.isLeft(sourceQ)) return Either.left(sourceQ.left);
  if (!sourceQ.right) return Either.right({ kind: "noop", message: "No source provided." });

  const customPlugins = await loadPlugins(configQ.right.config.plugins || [], context.cwd);
  const plugins = [...customPlugins, HttpPlugin(), FilePlugin(), DirectoryPlugin()];

  const itemsQ = await queryRegistryItemsToProcess(context, sourceQ.right, plugins);
  if (Either.isLeft(itemsQ)) return Either.left(itemsQ.left);

  for (const depName of itemsQ.right.missingRegistryDeps) {
    context.runtime.prompt.warn(`Registry dependency "${depName}" not found in current registry.`);
  }

  const planStateQ = await queryInstallPlanState(
    context,
    configQ.right.config,
    itemsQ.right.selectedItems,
  );
  if (Either.isLeft(planStateQ)) return Either.left(planStateQ.left);

  const approvedPlan = await interactApprovalPhase(context, configQ.right.config, planStateQ.right);
  if (Either.isLeft(approvedPlan)) return Either.left(approvedPlan.left);

  const hydratedPlan = await queryHydrateContents(
    context,
    configQ.right.config,
    approvedPlan.right,
    plugins,
  );
  if (Either.isLeft(hydratedPlan)) return Either.left(hydratedPlan.left);

  const vfsFiles = hydratedPlan.right.hydratedWrites.map((write) => ({
    id: write.absoluteTarget,
    code: write.finalContent,
  }));

  const installedItemsInfo: RegistryItem[] = [];
  for (const write of hydratedPlan.right.hydratedWrites) {
    const originalItem = hydratedPlan.right.selectedItems.find((i) => i.name === write.itemName);
    if (originalItem && !installedItemsInfo.some((i) => i.name === originalItem.name)) {
      installedItemsInfo.push(originalItem);
    }
  }

  const vfs = new MemoryVFS();

  const userPlugins = configQ.right.config.plugins?.filter((p) => typeof p === "object") || [];

  const pipeline = new PipelineRenderer([
    ...(userPlugins as import("../core/pipeline.js").Plugin[]),
    coreAddPlugin(
      hydratedPlan.right.dependencyPlan,
      configQ.right.config,
      context.runtime,
      installedItemsInfo,
    ) as import("../core/pipeline.js").Plugin,
  ]);

  try {
    await pipeline.run({ vfs, cwd: context.cwd, runtime: context.runtime }, vfsFiles);
  } catch (error) {
    vfs.rollback();
    context.runtime.prompt.error(`[Failed] Installation aborted: ${error}`);
    return Either.left(appError("RuntimeError", String(error)));
  }

  context.runtime.prompt.info(
    `Installed ${hydratedPlan.right.selectedItems.length} item(s), wrote ${hydratedPlan.right.hydratedWrites.length} file(s).`,
  );
  return Either.right({
    kind: "success",
    message: `Installed ${hydratedPlan.right.selectedItems.length} item(s), wrote ${hydratedPlan.right.hydratedWrites.length} file(s).`,
  });
}
