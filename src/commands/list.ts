import { appError, type AppError } from "../core/errors.js";
import { err, ok, type Result } from "../core/result.js";
import { resolveListSourceDecision } from "../domain/listCore.js";
import { readConfig } from "../shell/config.js";
import { loadRegistry } from "../shell/registry.js";
import type { CommandContext, CommandOutcome, RegistryItem } from "../types.js";

function formatItemLabel(item: RegistryItem): string {
  const type = item.type || "registry:file";
  const fileCount = Array.isArray(item.files) ? item.files.length : 0;
  return `${item.name} (${type}, files: ${fileCount})`;
}

export async function runListCommand(
  context: CommandContext,
): Promise<Result<CommandOutcome, AppError>> {
  const { config } = await readConfig(context.cwd);
  const sourceDecision = resolveListSourceDecision(
    context.args.positionals[1],
    config.registries,
  );

  let source = sourceDecision.source;
  if (sourceDecision.requiresPrompt) {
    const response = await context.runtime.prompt.text({
      message: "Registry URL/path:",
      placeholder: "https://example.com/registry.json",
    });

    const isCancel = await context.runtime.prompt.isCancel(response);
    if (isCancel) {
      return err(appError("UserCancelled", "Operation cancelled."));
    }

    source = String(response);
  }

  if (!source) {
    return ok({ kind: "noop", message: "No registry source provided." });
  }

  const registryResult = await loadRegistry(
    source,
    context.cwd,
    context.runtime,
  );
  if (!registryResult.ok) {
    return registryResult;
  }

  const { items } = registryResult.value;
  if (!items.length) {
    context.runtime.prompt.warn("No items found in registry.");
    return ok({ kind: "noop", message: "No items found in registry." });
  }

  context.runtime.prompt.info(`Found ${items.length} items.`);
  for (const item of items) {
    console.log(`- ${formatItemLabel(item)}`);
  }
  return ok({ kind: "success", message: `Listed ${items.length} item(s).` });
}
