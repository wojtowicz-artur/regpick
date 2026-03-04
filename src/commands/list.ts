import { Effect } from "effect";

import { CommandContextTag } from "@/core/context.js";
import { appError, type AppError } from "@/core/errors.js";
import { resolveListSourceDecision } from "@/domain/listCore.js";
import { readConfig } from "@/shell/config.js";
import { DirectoryPlugin, FilePlugin, HttpPlugin, loadPlugins } from "@/shell/plugins/index.js";
import { loadRegistry } from "@/shell/registry.js";
import { Runtime } from "@/shell/runtime/ports.js";
import type { CommandOutcome, RegistryItem, RegpickPlugin } from "@/types.js";

type ListSourceState = {
  source: string | null;
  requiresPrompt: boolean;
  plugins: RegpickPlugin[];
};

/**
 * Resolves list source configuration states.
 */
function queryListSourceState(): Effect.Effect<ListSourceState, AppError, CommandContextTag> {
  return Effect.gen(function* () {
    const context = yield* CommandContextTag;
    const res = yield* readConfig(context.cwd).pipe(
      Effect.mapError((e) => appError("RuntimeError", String(e))),
    );

    const sourceDecision = resolveListSourceDecision(
      context.args.positionals[1],
      res.config.registry?.sources || {},
    );

    const customPlugins = yield* loadPlugins(res.config.plugins || [], context.cwd).pipe(
      Effect.mapError((e) => appError("RuntimeError", String(e))),
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
function interactSourcePhase(
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
function queryRegistryItems(
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
 * Formats a generic registry item node into a presentable string.
 */
function formatItemLabel(item: RegistryItem): string {
  const type = item.type || "registry:file";
  const fileCount = Array.isArray(item.files) ? item.files.length : 0;
  return `${item.name} (${type}, files: ${fileCount})`;
}

/**
 * Renders elements into the STD provider view.
 */
function presentItems(
  items: RegistryItem[],
): Effect.Effect<void, never, Runtime | CommandContextTag> {
  return Effect.gen(function* () {
    const runtime = yield* Runtime;
    yield* runtime.prompt.info(`Found ${items.length} items.`);
    yield* Effect.forEach(
      items,
      (item) =>
        Effect.sync(() => {
          console.log(`- ${formatItemLabel(item)}`);
        }),
      { concurrency: 1 },
    );
  });
}

/**
 * Main controller for the `list` command.
 */
export function runListCommand(): Effect.Effect<
  CommandOutcome,
  AppError,
  Runtime | CommandContextTag
> {
  return Effect.gen(function* () {
    const runtime = yield* Runtime;
    const state = yield* queryListSourceState();
    const source = yield* interactSourcePhase(state);

    if (!source) {
      return {
        kind: "noop",
        message: "No registry source provided.",
      } as CommandOutcome;
    }

    const items = yield* queryRegistryItems(source, state.plugins);

    if (!items.length) {
      yield* runtime.prompt.warn("No items found in registry.");
      return {
        kind: "noop",
        message: "No items found in registry.",
      } as CommandOutcome;
    }

    yield* presentItems(items);

    return {
      kind: "success",
      message: `Listed ${items.length} item(s).`,
    } as CommandOutcome;
  });
}
