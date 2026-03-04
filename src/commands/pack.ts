import { CommandContextTag } from "@/core/context.js";
import { type AppError } from "@/core/errors.js";
import { Runtime } from "@/core/ports.js";
import { generateRegistryItems, queryPackState } from "@/shell/cli/packOrchestrator.js";
import type { CommandOutcome } from "@/types.js";
import { Effect } from "effect";

/**
 * Main controller for the `pack` command.
 * Manages mapping file sources to custom targeted JSON schemas dynamically.
 *
 * @returns Completion confirmation schema wrapper.
 */
export function runPackCommand(): Effect.Effect<
  CommandOutcome,
  AppError,
  Runtime | CommandContextTag
> {
  return Effect.gen(function* () {
    const runtime = yield* Runtime;
    const state = yield* queryPackState();

    if (state.files.length === 0) {
      yield* runtime.prompt.warn("No .ts or .tsx files found.");
      return { kind: "noop", message: "No files found." } as CommandOutcome;
    }

    const registry = yield* generateRegistryItems(state);

    const content = JSON.stringify(
      {
        name: "my-registry",
        items: registry.items,
      },
      null,
      2,
    );

    yield* Effect.catchAll(runtime.fs.writeFile(registry.outPath, content, "utf8"), (e) =>
      Effect.gen(function* () {
        yield* runtime.prompt.error(`Failed to write registry file: ${registry.outPath}`);
        return yield* Effect.fail(e);
      }),
    );

    yield* runtime.prompt.success(`Packed ${registry.items.length} components into registry.json`);

    return {
      kind: "success",
      message: `Generated registry.json`,
    } as CommandOutcome;
  });
}
