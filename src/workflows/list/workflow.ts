import { ConfigTag } from "@/core/context.js";
import { type AppError } from "@/core/errors.js";
import { resolveListSourceDecision } from "@/domain/listCore.js";
import { type ListIntent } from "@/domain/models/intent.js";
import { PromptPort } from "@/interfaces/prompt/port.js";
import { RegistryPort } from "@/registry/port.js";
import { Effect } from "effect";

export const listWorkflow = (
  intent: ListIntent,
): Effect.Effect<void, AppError, RegistryPort | PromptPort | ConfigTag> =>
  Effect.gen(function* () {
    const registry = yield* RegistryPort;
    const prompt = yield* PromptPort;
    const config = yield* ConfigTag;

    const dummyRegistries = config.registry?.sources || {};

    const { source, requiresPrompt } = resolveListSourceDecision(intent.source, dummyRegistries);

    let finalSource = source;

    if (requiresPrompt || !finalSource) {
      finalSource = yield* prompt.text({
        message: "Enter registry URL to list components from:",
        defaultValue: Object.keys(dummyRegistries)[0] || "",
      });
    }

    if (!finalSource) {
      return;
    }

    yield* prompt.info(`Translating registry from ${finalSource}...`);
    const manifest = yield* registry.loadManifest(finalSource);

    yield* prompt.success(`Registry loaded (${manifest.items.length} items)`);
    for (const item of manifest.items) {
      // Just log them simply
      yield* prompt.info(`- ${item.name} [${item.type}]`);
    }
  });
