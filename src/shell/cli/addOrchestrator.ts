import { CommandContextTag, ConfigTag } from "@/core/context.js";
import { appError, toAppError, type AppError } from "@/core/errors.js";
import { Runtime } from "@/core/ports.js";
import {
  buildInstallPlan,
  computeFinalWrites,
  resolveRegistryDependencies,
  type ApprovedAddPlan,
  type InteractiveAddState,
  type OverwriteResolution,
} from "@/domain/addPlan.js";
import { applyAliases } from "@/domain/aliasCore.js";
import { selectItemsFromFlags } from "@/domain/selection.js";
import { readConfig, resolveRegistrySource } from "@/shell/config/index.js";
import { resolvePackageManager } from "@/shell/packageManagers/resolver.js";
import { collectMissingDependencies } from "@/shell/services/installer.js";
import { loadRegistry, resolveFileContent } from "@/shell/services/registry.js";
import type {
  PlannedWrite,
  RegistryFile,
  RegistryItem,
  RegpickConfig,
  RegpickPlugin,
} from "@/types.js";
import { Effect } from "effect";

export type HydratedWrite = {
  itemName: string;
  absoluteTarget: string;
  relativeTarget: string;
  sourceFile: RegistryFile;
  originalContent: string;
  finalContent: string;
};

export interface CustomQueryItemsResult {
  selectedItems: RegistryItem[];
  missingRegistryDeps: string[];
}

export function queryConfiguration(): Effect.Effect<
  { config: RegpickConfig; configPath: string },
  AppError,
  Runtime | CommandContextTag
> {
  return Effect.gen(function* () {
    const runtime = yield* Runtime;
    const context = yield* CommandContextTag;
    const res = yield* readConfig(context.cwd).pipe(
      Effect.mapError(toAppError),
    );

    if (!res.configPath) {
      yield* runtime.prompt.error(
        "No regpick.json configuration found. Please run 'init' first.",
      );
      return yield* Effect.fail(
        appError("ValidationError", "No config file found"),
      );
    }

    return { config: res.config, configPath: res.configPath };
  });
}

export function queryRegistrySource(): Effect.Effect<
  string | null,
  AppError,
  Runtime | CommandContextTag | ConfigTag
> {
  return Effect.gen(function* () {
    const config = yield* ConfigTag;
    const runtime = yield* Runtime;
    const context = yield* CommandContextTag;
    const sourcePosIdx = context.args.positionals[0] === "add" ? 1 : 0;
    const argValue = context.args.positionals[sourcePosIdx];

    if (argValue) {
      return resolveRegistrySource(argValue, config);
    }

    const aliases = Object.entries(config.registry?.sources || {}).map(
      ([alias, value]) => ({
        label: `${alias} -> ${value}`,
        value: alias,
      }),
    );

    if (aliases.length > 0) {
      const picked = yield* runtime.prompt.multiselect({
        message:
          "Pick registry alias (or cancel and provide URL/path manually)",
        options: aliases,
        maxItems: 1,
        required: false,
      });

      const isCancel = yield* runtime.prompt.isCancel(picked);

      if (isCancel)
        return yield* Effect.fail(
          appError(
            "UserCancelled",
            "Dependency installation cancelled by user.",
          ),
        );

      if (Array.isArray(picked) && picked.length > 0) {
        return resolveRegistrySource(String(picked[0]), config);
      }
    }

    const manual = yield* runtime.prompt.text({
      message: "Registry URL/path:",
      placeholder: "https://example.com/registry.json",
    });

    const isManualCancel = yield* runtime.prompt.isCancel(manual);

    if (isManualCancel)
      return yield* Effect.fail(
        appError("UserCancelled", "Dependency installation cancelled by user."),
      );

    return String(manual);
  });
}

export function querySelectedItems(
  source: string,
  plugins: RegpickPlugin[],
): Effect.Effect<
  CustomQueryItemsResult,
  AppError,
  Runtime | CommandContextTag | ConfigTag
> {
  return Effect.gen(function* () {
    const runtime = yield* Runtime;
    const context = yield* CommandContextTag;
    const sourcePosIdx = context.args.positionals[0] === "add" ? 1 : 0;
    const itemPosIdx = sourcePosIdx + 1;

    const { items } = yield* loadRegistry(
      source,
      context.cwd,
      runtime,
      plugins,
    );

    if (!items.length) {
      yield* runtime.prompt.warn("No installable items in registry.");
      return yield* Effect.fail(
        appError("ValidationError", "No installable items in registry."),
      );
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
      const selectedNames = yield* runtime.prompt.autocompleteMultiselect({
        message: "Select items to install",
        options: items.map((item) => ({
          value: item.name,
          label: `${item.name} (${item.type || "registry:file"})`,
          hint: item.description || `${item.files.length} file(s)`,
        })),
        maxItems: 10,
        required: true,
      });

      const isCancel = yield* runtime.prompt.isCancel(selectedNames);

      if (isCancel)
        return yield* Effect.fail(
          appError(
            "UserCancelled",
            "Dependency installation cancelled by user.",
          ),
        );

      const setNames = new Set(
        (Array.isArray(selectedNames) ? selectedNames : []).map(String),
      );
      selectedItems = items.filter((item) => setNames.has(item.name));
    }

    if (!selectedItems.length) {
      yield* runtime.prompt.warn("No items selected.");
      return yield* Effect.fail(
        appError("ValidationError", "No items selected."),
      );
    }

    const { resolvedItems, missingDependencies: regDeps } =
      resolveRegistryDependencies(selectedItems, items);

    return { selectedItems: resolvedItems, missingRegistryDeps: regDeps };
  });
}

export function queryInstallationState(
  selectedItems: RegistryItem[],
): Effect.Effect<
  InteractiveAddState,
  AppError,
  Runtime | CommandContextTag | ConfigTag
> {
  return Effect.gen(function* () {
    const config = yield* ConfigTag;
    const runtime = yield* Runtime;
    const context = yield* CommandContextTag;
    const probeRes = yield* buildInstallPlan(
      selectedItems,
      context.cwd,
      config,
    );

    const existingTargets = new Set<string>();
    yield* Effect.forEach(
      probeRes.plannedWrites,
      (write) =>
        Effect.gen(function* () {
          const exists = yield* runtime.fs.pathExists(write.absoluteTarget);
          if (exists) existingTargets.add(write.absoluteTarget);
        }),
      { concurrency: "unbounded" },
    );

    const finalRes = yield* buildInstallPlan(
      selectedItems,
      context.cwd,
      config,
      existingTargets,
    );

    const deps = yield* collectMissingDependencies(
      selectedItems,
      context.cwd,
      runtime,
    );

    return {
      selectedItems,
      plannedWrites: finalRes.plannedWrites,
      existingTargets,
      missingDependencies: deps.missingDependencies,
      missingDevDependencies: deps.missingDevDependencies,
    };
  });
}

export function queryUserApproval(
  state: InteractiveAddState,
): Effect.Effect<
  ApprovedAddPlan,
  AppError,
  Runtime | CommandContextTag | ConfigTag
> {
  return Effect.gen(function* () {
    const config = yield* ConfigTag;
    const runtime = yield* Runtime;
    const context = yield* CommandContextTag;
    const assumeYes = Boolean(context.args.flags.yes);

    if (!assumeYes) {
      const proceed = yield* runtime.prompt.confirm({
        message: `Install ${state.selectedItems.length} item(s)?`,
        initialValue: true,
      });

      const isCancel = yield* runtime.prompt.isCancel(proceed);

      if (isCancel || !proceed) {
        return yield* Effect.fail(
          appError(
            "UserCancelled",
            "Dependency installation cancelled by user.",
          ),
        );
      }
    }

    const overwritePolicy = config.install?.overwritePolicy || "prompt";
    const resolutions = new Map<string, OverwriteResolution>();

    if (!assumeYes && overwritePolicy === "prompt") {
      for (const write of state.plannedWrites) {
        if (state.existingTargets.has(write.absoluteTarget)) {
          const ans = yield* runtime.prompt.select({
            message: `File exists: ${write.absoluteTarget}`,
            options: [
              { value: "overwrite", label: "Overwrite this file" },
              { value: "skip", label: "Skip this file" },
              { value: "abort", label: "Abort installation" },
            ],
          });

          const isCancel = yield* runtime.prompt.isCancel(ans);
          if (isCancel || ans === "abort") {
            return yield* Effect.fail(
              appError("UserCancelled", "Installation aborted by user."),
            );
          }
          resolutions.set(write.absoluteTarget, ans as OverwriteResolution);
        }
      }
    }

    const finalWrites = computeFinalWrites(
      state.plannedWrites,
      state.existingTargets,
      resolutions,
      assumeYes,
      overwritePolicy,
    );

    let shouldInstallDeps = false;
    const hasDeps =
      state.missingDependencies.length > 0 ||
      state.missingDevDependencies.length > 0;

    if (hasDeps) {
      if (assumeYes) {
        shouldInstallDeps = true;
      } else {
        const pm = resolvePackageManager(
          context.cwd,
          config.install?.packageManager || "auto",
          runtime,
        );
        const msgParts: string[] = [];
        if (state.missingDependencies.length)
          msgParts.push(
            `dependencies: ${state.missingDependencies.join(", ")}`,
          );
        if (state.missingDevDependencies.length)
          msgParts.push(
            `devDependencies: ${state.missingDevDependencies.join(", ")}`,
          );

        const ans = yield* runtime.prompt.confirm({
          message: `Install missing packages with ${pm}? (${msgParts.join(" | ")})`,
          initialValue: true,
        });

        const isCancel = yield* runtime.prompt.isCancel(ans);

        if (isCancel)
          return yield* Effect.fail(
            appError(
              "UserCancelled",
              "Dependency installation cancelled by user.",
            ),
          );

        shouldInstallDeps = Boolean(ans);
        if (!shouldInstallDeps) {
          yield* runtime.prompt.warn("Skipped dependency installation.");
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

export function queryFileContents(
  finalWrites: PlannedWrite[],
  selectedItems: RegistryItem[],
  plugins: RegpickPlugin[],
): Effect.Effect<
  HydratedWrite[],
  AppError,
  Runtime | CommandContextTag | ConfigTag
> {
  return Effect.gen(function* () {
    const config = yield* ConfigTag;
    const runtime = yield* Runtime;
    const context = yield* CommandContextTag;
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
            runtime,
            plugins,
          );

          const finalContent = applyAliases(content, config);
          writes.push({
            itemName: write.itemName,
            absoluteTarget: write.absoluteTarget,
            relativeTarget: write.relativeTarget,
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
