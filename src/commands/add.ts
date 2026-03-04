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
  RegistryFile,
  RegistryItem,
  RegpickConfig,
  RegpickPlugin,
} from "@/types.js";
import { Effect } from "effect";

type HydratedWrite = {
  itemName: string;
  absoluteTarget: string;
  sourceFile: RegistryFile;
  originalContent: string;
  finalContent: string;
};

type ApprovedAddPlan = {
  selectedItems: RegistryItem[];
  shouldInstallDeps: boolean;
  finalWrites: PlannedWrite[];
  dependencyPlan: { dependencies: string[]; devDependencies: string[] };
};

type InteractiveAddState = {
  selectedItems: RegistryItem[];
  plannedWrites: PlannedWrite[];
  existingTargets: Set<string>;
  missingDependencies: string[];
  missingDevDependencies: string[];
};

interface CustomQueryItemsResult {
  selectedItems: RegistryItem[];
  missingRegistryDeps: string[];
}

/**
 * Loads the core Regpick Configuration for the workspace.
 */
function queryLoadConfiguration(
  context: CommandContext,
): Effect.Effect<{ config: RegpickConfig; configPath: string }, AppError> {
  return Effect.gen(function* () {
    const res = yield* readConfig(context.cwd).pipe(
      Effect.mapError((e) => appError("RuntimeError", String(e))),
    );

    if (!res.configPath) {
      yield* context.runtime.prompt.error(
        "No regpick.json configuration found. Please run 'init' first.",
      );
      return yield* Effect.fail(appError("ValidationError", "No config file found"));
    }

    return { config: res.config, configPath: res.configPath };
  });
}

/**
 * Identify Registry Source URL based on user input, flags, or interactive prompt.
 */
function queryResolveRegistrySource(
  context: CommandContext,
  config: RegpickConfig,
): Effect.Effect<string | null, AppError> {
  return Effect.gen(function* () {
    const sourcePosIdx = context.args.positionals[0] === "add" ? 1 : 0;
    const argValue = context.args.positionals[sourcePosIdx];

    if (argValue) {
      return resolveRegistrySource(argValue, config);
    }

    const aliases = Object.entries(config.registry?.sources || {}).map(([alias, value]) => ({
      label: `${alias} -> ${value}`,
      value: alias,
    }));

    if (aliases.length > 0) {
      const picked = yield* context.runtime.prompt.multiselect({
        message: "Pick registry alias (or cancel and provide URL/path manually)",
        options: aliases,
        maxItems: 1,
        required: false,
      });

      const isCancel = yield* context.runtime.prompt.isCancel(picked);

      if (isCancel)
        return yield* Effect.fail(
          appError("UserCancelled", "Dependency installation cancelled by user."),
        );

      if (Array.isArray(picked) && picked.length > 0) {
        return resolveRegistrySource(String(picked[0]), config);
      }
    }

    const manual = yield* context.runtime.prompt.text({
      message: "Registry URL/path:",
      placeholder: "https://example.com/registry.json",
    });

    const isManualCancel = yield* context.runtime.prompt.isCancel(manual);

    if (isManualCancel)
      return yield* Effect.fail(
        appError("UserCancelled", "Dependency installation cancelled by user."),
      );

    return String(manual);
  });
}

/**
 * Loads registry, selects items, and resolves structural dependencies via query boundary.
 */
function queryRegistryItemsToProcess(
  context: CommandContext,
  source: string,
  plugins: RegpickPlugin[],
): Effect.Effect<CustomQueryItemsResult, AppError> {
  return Effect.gen(function* () {
    const sourcePosIdx = context.args.positionals[0] === "add" ? 1 : 0;
    const itemPosIdx = sourcePosIdx + 1;

    const { items } = yield* loadRegistry(source, context.cwd, context.runtime, plugins);

    if (!items.length) {
      yield* context.runtime.prompt.warn("No installable items in registry.");
      return yield* Effect.fail(appError("ValidationError", "No installable items in registry."));
    }

    const itemName = context.args.positionals[itemPosIdx];
    if (itemName && !context.args.flags.select) {
      context.args.flags.select = itemName;
    }

    const preselected = yield* selectItemsFromFlags(items, context);
    let selectedItems: RegistryItem[];

    if (preselected) {
      selectedItems = preselected;
    } else {
      const selectedNames = yield* context.runtime.prompt.autocompleteMultiselect({
        message: "Select items to install",
        options: items.map((item) => ({
          value: item.name,
          label: `${item.name} (${item.type || "registry:file"})`,
          hint: item.description || `${item.files.length} file(s)`,
        })),
        maxItems: 10,
        required: true,
      });

      const isCancel = yield* context.runtime.prompt.isCancel(selectedNames);

      if (isCancel)
        return yield* Effect.fail(
          appError("UserCancelled", "Dependency installation cancelled by user."),
        );

      const setNames = new Set((Array.isArray(selectedNames) ? selectedNames : []).map(String));
      selectedItems = items.filter((item) => setNames.has(item.name));
    }

    if (!selectedItems.length) {
      yield* context.runtime.prompt.warn("No items selected.");
      return yield* Effect.fail(appError("ValidationError", "No items selected."));
    }

    const { resolvedItems, missingDependencies: regDeps } = resolveRegistryDependencies(
      selectedItems,
      items,
    );

    return { selectedItems: resolvedItems, missingRegistryDeps: regDeps };
  });
}

function queryPlanState(
  context: CommandContext,
  config: RegpickConfig,
  selectedItems: RegistryItem[],
): Effect.Effect<InteractiveAddState, AppError> {
  return Effect.gen(function* () {
    const probeRes = yield* buildInstallPlan(selectedItems, context.cwd, config);

    const existingTargets = new Set<string>();
    yield* Effect.forEach(
      probeRes.plannedWrites,
      (write) =>
        Effect.gen(function* () {
          const exists = yield* context.runtime.fs.pathExists(write.absoluteTarget);
          if (exists) existingTargets.add(write.absoluteTarget);
        }),
      { concurrency: "unbounded" },
    );

    const finalRes = yield* buildInstallPlan(selectedItems, context.cwd, config, existingTargets);

    const deps = yield* collectMissingDependencies(selectedItems, context.cwd, context.runtime);

    return {
      selectedItems,
      plannedWrites: finalRes.plannedWrites,
      existingTargets,
      missingDependencies: deps.missingDependencies,
      missingDevDependencies: deps.missingDevDependencies,
    };
  });
}

function processInteractionApproval(
  context: CommandContext,
  config: RegpickConfig,
  state: InteractiveAddState,
): Effect.Effect<ApprovedAddPlan, AppError> {
  return Effect.gen(function* () {
    const assumeYes = Boolean(context.args.flags.yes);

    if (!assumeYes) {
      const proceed = yield* context.runtime.prompt.confirm({
        message: `Install ${state.selectedItems.length} item(s)?`,
        initialValue: true,
      });

      const isCancel = yield* context.runtime.prompt.isCancel(proceed);

      if (isCancel || !proceed) {
        return yield* Effect.fail(
          appError("UserCancelled", "Dependency installation cancelled by user."),
        );
      }
    }

    const finalWrites: PlannedWrite[] = [];
    const overwritePolicy = config.install?.overwritePolicy || "prompt";

    yield* Effect.forEach(
      state.plannedWrites,
      (write) =>
        Effect.gen(function* () {
          if (state.existingTargets.has(write.absoluteTarget)) {
            if (assumeYes || overwritePolicy === "overwrite") {
              finalWrites.push(write);
            } else if (overwritePolicy === "skip") {
              yield* context.runtime.prompt.warn(`Skipped existing file: ${write.absoluteTarget}`);
            } else {
              const ans = yield* context.runtime.prompt.select({
                message: `File exists: ${write.absoluteTarget}`,
                options: [
                  { value: "overwrite", label: "Overwrite this file" },
                  { value: "skip", label: "Skip this file" },
                  { value: "abort", label: "Abort installation" },
                ],
              });

              const isCancel = yield* context.runtime.prompt.isCancel(ans);

              if (isCancel || ans === "abort") {
                return yield* Effect.fail(
                  appError("UserCancelled", "Installation aborted by user."),
                );
              }

              if (ans === "overwrite") finalWrites.push(write);
            }
          } else {
            finalWrites.push(write);
          }
        }),
      { concurrency: 1 }, // Sequential is required because of prompt
    );

    let shouldInstallDeps = false;
    const hasDeps = state.missingDependencies.length > 0 || state.missingDevDependencies.length > 0;

    if (hasDeps) {
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

        const ans = yield* context.runtime.prompt.confirm({
          message: `Install missing packages with ${pm}? (${msgParts.join(" | ")})`,
          initialValue: true,
        });

        const isCancel = yield* context.runtime.prompt.isCancel(ans);

        if (isCancel)
          return yield* Effect.fail(
            appError("UserCancelled", "Dependency installation cancelled by user."),
          );

        shouldInstallDeps = Boolean(ans);
        if (!shouldInstallDeps) {
          yield* context.runtime.prompt.warn("Skipped dependency installation.");
        }
      }
    }

    return {
      selectedItems: state.selectedItems,
      finalWrites,
      shouldInstallDeps,
      dependencyPlan: {
        dependencies: state.missingDependencies,
        devDependencies: state.missingDevDependencies,
      },
    };
  });
}

function resolveContents(
  context: CommandContext,
  config: RegpickConfig,
  finalWrites: PlannedWrite[],
  selectedItems: RegistryItem[],
  plugins: RegpickPlugin[],
): Effect.Effect<HydratedWrite[], AppError> {
  return Effect.gen(function* () {
    const writes: HydratedWrite[] = [];

    yield* Effect.forEach(
      finalWrites,
      (write) =>
        Effect.gen(function* () {
          const item = selectedItems.find((i) => i.name === write.itemName);
          if (!item) return;

          const content = yield* resolveFileContent(
            write.sourceFile,
            item,
            context.cwd,
            context.runtime,
            plugins,
          );

          const finalContent = applyAliases(content, config);
          writes.push({
            itemName: write.itemName,
            absoluteTarget: write.absoluteTarget,
            sourceFile: write.sourceFile,
            originalContent: content,
            finalContent,
          });
        }),
      { concurrency: "unbounded" },
    );

    return writes;
  });
}

export function runAddCommand(context: CommandContext): Effect.Effect<CommandOutcome, AppError> {
  return Effect.gen(function* () {
    const { config } = yield* queryLoadConfiguration(context);
    const source = yield* queryResolveRegistrySource(context, config);

    if (!source) {
      return { kind: "noop", message: "No source provided" } as CommandOutcome;
    }

    const customPlugins = yield* loadPlugins(config.plugins || [], context.cwd);

    const plugins = [...customPlugins, HttpPlugin(), FilePlugin(), DirectoryPlugin()];

    const itemsToProc = yield* queryRegistryItemsToProcess(context, source, plugins);

    for (const d of itemsToProc.missingRegistryDeps || []) {
      yield* context.runtime.prompt.warn(
        `Registry dependency "${d}" not found in current registry.`,
      );
    }

    const state = yield* queryPlanState(context, config, itemsToProc.selectedItems);
    const approved = yield* processInteractionApproval(context, config, state);
    const hydratedWrites = yield* resolveContents(
      context,
      config,
      approved.finalWrites,
      approved.selectedItems,
      plugins,
    );

    const vfs = new MemoryVFS();
    const vfsFiles = hydratedWrites.map((w) => ({
      id: w.absoluteTarget,
      code: w.finalContent,
    }));

    const installedItemsInfo: RegistryItem[] = [];
    for (const write of hydratedWrites) {
      const originalItem = approved.selectedItems.find((i) => i.name === write.itemName);
      if (originalItem && !installedItemsInfo.some((i) => i.name === originalItem.name)) {
        installedItemsInfo.push(originalItem);
      }
    }

    const userPlugins = (config.plugins?.filter((p) => typeof p === "object") ||
      []) as import("../core/pipeline.js").Plugin[];

    const depPlan = approved.shouldInstallDeps
      ? approved.dependencyPlan
      : { dependencies: [], devDependencies: [] };

    const pipeline = new PipelineRenderer([
      ...userPlugins,
      coreAddPlugin(
        depPlan,
        config,
        context.runtime,
        installedItemsInfo,
      ) as import("../core/pipeline.js").Plugin,
    ]);

    yield* pipeline.run({ vfs, cwd: context.cwd, runtime: context.runtime }, vfsFiles).pipe(
      Effect.catchAll((error) => {
        vfs.rollback();
        return Effect.gen(function* () {
          yield* context.runtime.prompt.error(`[Failed] Installation aborted: ${error.message}`);
          return yield* Effect.fail(error);
        });
      }),
    );

    yield* context.runtime.prompt.info(
      `Installed ${approved.selectedItems.length} item(s), wrote ${hydratedWrites.length} file(s).`,
    );

    return {
      kind: "success",
      message: `Installed ${approved.selectedItems.length} item(s), wrote ${hydratedWrites.length} file(s).`,
      details: {
        writesCount: hydratedWrites.length,
        itemsCount: approved.selectedItems.length,
      },
    } as CommandOutcome;
  });
}
