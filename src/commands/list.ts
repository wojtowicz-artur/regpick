import { CommandContextTag } from "@/core/context.js";
import { type AppError } from "@/core/errors.js";
import { Runtime } from "@/core/ports.js";
import {
  interactSourcePhase,
  presentItems,
  queryListSourceState,
  queryRegistryItems,
} from "@/shell/cli/listOrchestrator.js";
import { readLockfile } from "@/shell/services/lockfile.js";
import type { CommandOutcome } from "@/types.js";
import { Effect } from "effect";

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

    const context = yield* CommandContextTag;
    const lockfile = yield* readLockfile(context.cwd, runtime);

    yield* presentItems(items, lockfile);

    return {
      kind: "success",
      message: `Listed ${items.length} item(s).`,
    } as CommandOutcome;
  });
}
