import { appError, type AppError } from "@/core/errors.js";
import { err, ok, type Result } from "@/core/result.js";
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
 * @returns Result containing list source state.
 */
async function queryListSourceState(
  context: CommandContext,
): Promise<Result<ListSourceState, AppError>> {
  const { config } = await readConfig(context.cwd);
  const sourceDecision = resolveListSourceDecision(
    context.args.positionals[1],
    config.registry?.sources || {},
  );

  const customPlugins = await loadPlugins(config.plugins || [], context.cwd);
  const plugins = [...customPlugins, HttpPlugin(), FilePlugin(), DirectoryPlugin()];

  return ok({
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
 * @returns Result containing the final registry URL.
 */
async function interactSourcePhase(
  context: CommandContext,
  state: ListSourceState,
): Promise<Result<string | null, AppError>> {
  if (!state.requiresPrompt) {
    return ok(state.source);
  }

  const response = await context.runtime.prompt.text({
    message: "Registry URL/path:",
    placeholder: "https://example.com/registry.json",
  });

  if (await context.runtime.prompt.isCancel(response)) {
    return err(appError("UserCancelled", "Operation cancelled."));
  }

  return ok(String(response));
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
): Promise<Result<RegistryItem[], AppError>> {
  const registryResult = await loadRegistry(source, context.cwd, context.runtime, plugins);

  if (!registryResult.ok) {
    return registryResult as unknown as Result<RegistryItem[], AppError>;
  }

  return ok(registryResult.value.items);
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
 * @returns Result command status execution payload.
 */
export async function runListCommand(
  context: CommandContext,
): Promise<Result<CommandOutcome, AppError>> {
  const stateQ = await queryListSourceState(context);
  if (!stateQ.ok) return err(stateQ.error);

  const sourceQ = await interactSourcePhase(context, stateQ.value);
  if (!sourceQ.ok) return err(sourceQ.error);

  if (!sourceQ.value) {
    return ok({ kind: "noop", message: "No registry source provided." });
  }

  const itemsQ = await queryRegistryItems(context, sourceQ.value, stateQ.value.plugins);
  if (!itemsQ.ok) return err(itemsQ.error);

  const items = itemsQ.value;

  if (!items.length) {
    context.runtime.prompt.warn("No items found in registry.");
    return ok({ kind: "noop", message: "No items found in registry." });
  }

  presentItems(context, items);

  return ok({ kind: "success", message: `Listed ${items.length} item(s).` });
}
