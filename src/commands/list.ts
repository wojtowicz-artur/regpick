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
 *
 * @param context - Command context.
 * @returns Either containing list source state.
 */
async function queryListSourceState(
  context: CommandContext,
): Promise<Either.Either<ListSourceState, AppError>> {
  const { config } = await readConfig(context.cwd);
  const sourceDecision = resolveListSourceDecision(
    context.args.positionals[1],
    config.registry?.sources || {},
  );

  const customPlugins = await loadPlugins(config.plugins || [], context.cwd);
  const plugins = [...customPlugins, HttpPlugin(), FilePlugin(), DirectoryPlugin()];

  return Either.right({
    source: sourceDecision.source,
    requiresPrompt: sourceDecision.requiresPrompt,
    plugins,
  });
}

/**
 * Prompts user for a registry source, if one was not passed as an argument.
 *
 * @param context - Command context.
 * @param state - Current list query state.
 * @returns Either containing the final registry URL.
 */
async function interactSourcePhase(
  context: CommandContext,
  state: ListSourceState,
): Promise<Either.Either<string | null, AppError>> {
  if (!state.requiresPrompt) {
    return Either.right(state.source);
  }

  const response = await Effect.runPromise(
    context.runtime.prompt.text({
      message: "Registry URL/path:",
      placeholder: "https://example.com/registry.json",
    }),
  );

  if (await Effect.runPromise(context.runtime.prompt.isCancel(response))) {
    return Either.left(appError("UserCancelled", "Operation cancelled."));
  }

  return Either.right(String(response));
}

/**
 * Fetches the registry payloads for displaying available elements.
 *
 * @param context - Command context.
 * @param source - Registry source endpoint.
 * @returns Unwrapped remote registry items.
 */
async function queryRegistryItems(
  context: CommandContext,
  source: string,
  plugins: RegpickPlugin[],
): Promise<Either.Either<RegistryItem[], AppError>> {
  const registryResult = await loadRegistry(source, context.cwd, context.runtime, plugins);

  if (Either.isLeft(registryResult)) {
    return registryResult as unknown as Either.Either<RegistryItem[], AppError>;
  }

  return Either.right(registryResult.right.items);
}

/**
 * Formats a generic registry item node into a presentable string.
 *
 * @param item - Target registry item.
 * @returns Human readable label string.
 */
function formatItemLabel(item: RegistryItem): string {
  const type = item.type || "registry:file";
  const fileCount = Array.isArray(item.files) ? item.files.length : 0;
  return `${item.name} (${type}, files: ${fileCount})`;
}

/**
 * Renders elements into the STD provider view.
 * Handles final presentation layer logic.
 *
 * @param context - Command context.
 * @param items - Collection of filtered item entries.
 */
function presentItems(context: CommandContext, items: RegistryItem[]): void {
  context.runtime.prompt.info(`Found ${items.length} items.`);
  for (const item of items) {
    console.log(`- ${formatItemLabel(item)}`);
  }
}

/**
 * Main controller for the `list` command.
 * Evaluates CQS flow: State Query -> Interaction -> Fetch Items -> Presentation.
 *
 * @param context - Command context.
 * @returns Either command status execution payload.
 */
export async function runListCommand(
  context: CommandContext,
): Promise<Either.Either<CommandOutcome, AppError>> {
  const stateQ = await queryListSourceState(context);
  if (Either.isLeft(stateQ)) return Either.left(stateQ.left);

  const sourceQ = await interactSourcePhase(context, stateQ.right);
  if (Either.isLeft(sourceQ)) return Either.left(sourceQ.left);

  if (!sourceQ.right) {
    return Either.right({
      kind: "noop",
      message: "No registry source provided.",
    });
  }

  const itemsQ = await queryRegistryItems(context, sourceQ.right, stateQ.right.plugins);
  if (Either.isLeft(itemsQ)) return Either.left(itemsQ.left);

  const items = itemsQ.right;

  if (!items.length) {
    context.runtime.prompt.warn("No items found in registry.");
    return Either.right({
      kind: "noop",
      message: "No items found in registry.",
    });
  }

  presentItems(context, items);

  return Either.right({
    kind: "success",
    message: `Listed ${items.length} item(s).`,
  });
}
