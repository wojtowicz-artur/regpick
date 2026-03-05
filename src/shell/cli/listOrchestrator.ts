import { CommandContextTag } from "@/core/context.js";
import { appError, toAppError, type AppError } from "@/core/errors.js";
import { Runtime } from "@/core/ports.js";
import { resolveListSourceDecision } from "@/domain/listCore.js";
import { readConfig } from "@/shell/config/index.js";
import { DirectoryPlugin, FilePlugin, HttpPlugin, loadPlugins } from "@/shell/plugins/index.js";
import { loadRegistry } from "@/shell/services/registry.js";
import type { RegistryItem, RegpickLockfile, RegpickPlugin } from "@/types.js";
import { Effect } from "effect";

type ListSourceState = {
  source: string | null;
  requiresPrompt: boolean;
  plugins: RegpickPlugin[];
};

/**
 * Resolves list source configuration states.
 */
export function queryListSourceState(): Effect.Effect<
  ListSourceState,
  AppError,
  CommandContextTag
> {
  return Effect.gen(function* () {
    const context = yield* CommandContextTag;
    const res = yield* readConfig(context.cwd).pipe(Effect.mapError(toAppError));

    const sourceDecision = resolveListSourceDecision(
      context.args.positionals[1],
      res.config.registry?.sources || {},
    );

    const customPlugins = yield* loadPlugins(res.config.plugins || [], context.cwd).pipe(
      Effect.mapError(toAppError),
    );

    const plugins = [...customPlugins, HttpPlugin(), FilePlugin(), DirectoryPlugin()];

    return {
      source: sourceDecision.source,
      requiresPrompt: sourceDecision.requiresPrompt,
      plugins,
    };
  });
}

/**
 * Prompts user for a registry source, if one was not passed as an argument.
 */
export function interactSourcePhase(
  state: ListSourceState,
): Effect.Effect<string | null, AppError, Runtime | CommandContextTag> {
  return Effect.gen(function* () {
    const runtime = yield* Runtime;
    if (!state.requiresPrompt) {
      return state.source;
    }

    const response = yield* runtime.prompt.text({
      message: "Registry URL/path:",
      placeholder: "https://example.com/registry.json",
    });

    const isCancel = yield* runtime.prompt.isCancel(response);

    if (isCancel) {
      return yield* Effect.fail(appError("UserCancelled", "Operation cancelled."));
    }

    return String(response);
  });
}

/**
 * Fetches the registry payloads for displaying available elements.
 */
export function queryRegistryItems(
  source: string,
  plugins: RegpickPlugin[],
): Effect.Effect<RegistryItem[], AppError, Runtime | CommandContextTag> {
  return Effect.gen(function* () {
    const runtime = yield* Runtime;
    const context = yield* CommandContextTag;
    const { items } = yield* loadRegistry(source, context.cwd, runtime, plugins);
    return items;
  });
}

/**
 * Formats a generic registry item node into a presentable string,
 * taking lockfile install state into account.
 */
export function formatItemLabel(item: RegistryItem, lockfile?: RegpickLockfile): string {
  const type = item.type || "registry:file";
  const fileCount = Array.isArray(item.files) ? item.files.length : 0;

  let lockStatus = "";
  if (lockfile && lockfile.components && lockfile.components[item.name]) {
    const lInfo = lockfile.components[item.name];
    const dateStr = lInfo.installedAt
      ? new Date(lInfo.installedAt).toLocaleString()
      : "Unknown date";
    const vStr = lInfo.version ? `v${lInfo.version}, ` : "";
    lockStatus = ` \x1b[32m[Installed: ${vStr}${dateStr}]\x1b[0m`;
  }

  return `${item.name} (${type}, files: ${fileCount})${lockStatus}`;
}

/**
 * Renders elements into the STD provider view.
 */
export function presentItems(
  items: RegistryItem[],
  lockfile?: RegpickLockfile,
): Effect.Effect<void, never, Runtime | CommandContextTag> {
  return Effect.gen(function* () {
    const runtime = yield* Runtime;
    yield* runtime.prompt.info(`Found ${items.length} items.`);
    yield* Effect.forEach(
      items,
      (item) =>
        Effect.sync(() => {
          console.log(`- ${formatItemLabel(item, lockfile)}`);
        }),
      { concurrency: 1 },
    );
  });
}
