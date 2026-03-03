import { Effect, Either } from "effect";

import { appError, type AppError } from "@/core/errors.js";
import { resolveListSourceDecision } from "@/domain/listCore.js";
import { readConfig } from "@/shell/config.js";
import { DirectoryPlugin, FilePlugin, HttpPlugin, loadPlugins } from "@/shell/plugins/index.js";
import { loadRegistry } from "@/shell/registry.js";
import type { CommandContext, CommandOutcome, RegistryItem, RegpickPlugin } from "@/types.js";

type ListSourceState = {
  source: string | null;
  requiresPrompt: boolean;
  plugins: RegpickPlugin[];
};

/**
 * Resolves list source configuration states.
 */
function queryListSourceState(context: CommandContext): Effect.Effect<ListSourceState, AppError> {
  return Effect.gen(function* () {
    const res = yield* Effect.tryPromise({
      try: () => readConfig(context.cwd),
      catch: (e): AppError => appError("RuntimeError", String(e)),
    });

    const sourceDecision = resolveListSourceDecision(
      context.args.positionals[1],
      res.config.registry?.sources || {},
    );

    const customPlugins = yield* Effect.tryPromise({
      try: () => loadPlugins(res.config.plugins || [], context.cwd),
      catch: (e): AppError => appError("RuntimeError", String(e)),
    });

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
  context: CommandContext,
  state: ListSourceState,
): Effect.Effect<string | null, AppError> {
  return Effect.gen(function* () {
    if (!state.requiresPrompt) {
      return state.source;
    }

    const response = yield* context.runtime.prompt.text({
      message: "Registry URL/path:",
      placeholder: "https://example.com/registry.json",
    });

    const isCancel = yield* context.runtime.prompt.isCancel(response);

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
  context: CommandContext,
  source: string,
  plugins: RegpickPlugin[],
): Effect.Effect<RegistryItem[], AppError> {
  return Effect.gen(function* () {
    const { items } = yield* loadRegistry(source, context.cwd, context.runtime, plugins);
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
function presentItems(context: CommandContext, items: RegistryItem[]): Effect.Effect<void, never> {
  return Effect.gen(function* () {
    yield* context.runtime.prompt.info(`Found ${items.length} items.`);
    for (const item of items) {
      console.log(`- ${formatItemLabel(item)}`);
    }
  });
}

/**
 * Main controller for the `list` command.
 */
function runListCommandEff(context: CommandContext): Effect.Effect<CommandOutcome, AppError> {
  return Effect.gen(function* () {
    const state = yield* queryListSourceState(context);
    const source = yield* interactSourcePhase(context, state);

    if (!source) {
      return {
        kind: "noop",
        message: "No registry source provided.",
      } as CommandOutcome;
    }

    const items = yield* queryRegistryItems(context, source, state.plugins);

    if (!items.length) {
      yield* context.runtime.prompt.warn("No items found in registry.");
      return {
        kind: "noop",
        message: "No items found in registry.",
      } as CommandOutcome;
    }

    yield* presentItems(context, items);

    return {
      kind: "success",
      message: `Listed ${items.length} item(s).`,
    } as CommandOutcome;
  });
}

export async function runListCommand(
  context: CommandContext,
): Promise<Either.Either<CommandOutcome, AppError>> {
  return await Effect.runPromise(Effect.either(runListCommandEff(context)));
}
