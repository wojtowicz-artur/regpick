import { Effect, Layer } from "effect";
import path from "node:path";
import { styleText } from "node:util";

import { CommandContextTag } from "@/core/context.js";
import { type AppError, toAppError } from "@/core/errors.js";
import { JournalService, JournalServiceImpl } from "@/core/journal.js";
import { parseCliArgs } from "@/shell/cli/args.js";
import type { CommandContext, CommandOutcome } from "@/types.js";

function printHelp(): void {
  console.log(`
Usage:
  regpick init
  regpick list [registry-name-or-url]
  regpick add [registry-name-or-url]
  regpick update
  regpick pack [directory]

Options:
  --cwd=<path>           Working directory (default: current directory)
  --all                  Select all items in add flow
  --select=a,b,c         Select explicit item names in add flow
  --yes                  Skip confirmation prompts where safe
  --help                 Show this help
`);
}

function run(): Effect.Effect<void, never> {
  return Effect.gen(function* () {
    const abortController = new AbortController();

    // Abort prompts on background errors or process termination
    const handleTerminate = (err?: Error) => {
      if (!abortController.signal.aborted) {
        abortController.abort(err);
      }
      if (err instanceof Error) {
        console.error(styleText("red", `\n[Fatal Error] ${err.message}`));
      }
      process.exit(1);
    };

    process.on("SIGINT", () => handleTerminate());
    process.on("SIGTERM", () => handleTerminate());
    process.on("uncaughtException", handleTerminate);
    process.on("unhandledRejection", (reason) =>
      handleTerminate(reason instanceof Error ? reason : new Error(String(reason))),
    );

    const parsed = parseCliArgs(process.argv.slice(2));
    const command = parsed.positionals[0];

    if (!command || parsed.flags.help) {
      printHelp();
      return;
    }

    const { createRuntimePorts, Runtime } = yield* Effect.promise(
      () => import("@/shell/runtime/ports.js"),
    );
    const runtime = createRuntimePorts({ signal: abortController.signal });

    const context: CommandContext = {
      cwd: parsed.flags.cwd ? path.resolve(process.cwd(), String(parsed.flags.cwd)) : process.cwd(),
      args: parsed,
    };

    runtime.prompt.intro(styleText("cyan", "regpick"));

    const executeCommand = Effect.gen(function* () {
      const journal = yield* JournalService;
      const rolledBack = yield* journal.rollbackIntent(context.cwd);
      if (rolledBack) {
        yield* runtime.prompt.error(
          styleText("yellow", "Previous incomplete operation detected and rolled back."),
        );
      }

      let commandEffect: Effect.Effect<
        CommandOutcome,
        AppError,
        import("@/shell/runtime/ports.js").Runtime | CommandContextTag | JournalService
      >;

      switch (command) {
        case "init":
          commandEffect = yield* Effect.promise(() =>
            import("@/commands/init.js").then((mod) => mod.runInitCommand()),
          );
          break;
        case "list":
          commandEffect = yield* Effect.promise(() =>
            import("@/commands/list.js").then((mod) => mod.runListCommand()),
          );
          break;
        case "add":
          commandEffect = yield* Effect.promise(() =>
            import("@/commands/add.js").then((mod) => mod.runAddCommand()),
          );
          break;
        case "update":
          commandEffect = yield* Effect.promise(() =>
            import("@/commands/update.js").then((mod) => mod.runUpdateCommand()),
          );
          break;
        case "pack":
          commandEffect = yield* Effect.promise(() =>
            import("@/commands/pack.js").then((mod) => mod.runPackCommand()),
          );
          break;
        default:
          runtime.prompt.error(`Unknown command: ${command}`);
          printHelp();
          process.exitCode = 1;
          return yield* Effect.succeed(undefined as any);
      }

      const result = yield* commandEffect;

      if (result.kind === "noop") {
        runtime.prompt.outro(styleText("yellow", result.message));
        return;
      }

      runtime.prompt.outro(styleText("green", "Done."));
    }).pipe(
      Effect.catchAll((error) =>
        Effect.sync(() => {
          handleAppError(error, runtime.prompt.error);
          runtime.prompt.outro(styleText("red", "Failed."));
          process.exitCode = 1;
        }),
      ),
      Effect.catchAllDefect((defect) =>
        Effect.sync(() => {
          const appErr = toAppError(defect);
          handleAppError(appErr, runtime.prompt.error);
          runtime.prompt.outro(styleText("red", "Failed."));
          process.exitCode = 1;
        }),
      ),
    );

    const layer = Layer.mergeAll(
      Layer.succeed(Runtime, runtime),
      Layer.succeed(CommandContextTag, context),
      Layer.succeed(JournalService, JournalServiceImpl),
    );
    yield* executeCommand.pipe(Effect.provide(layer));
  });
}

function handleAppError(error: AppError, write: (message: string) => void): void {
  if (error._tag === "UserCancelled") {
    write(error.message);
    return;
  }

  let msg = `[${error._tag}] ${error.message}`;

  if (error.cause) {
    if (error.cause instanceof Error) {
      msg += `\n\nCause:\n${error.cause.stack || error.cause.message}`;
    } else if (typeof error.cause === "object") {
      try {
        msg += `\n\nCause:\n${JSON.stringify(error.cause, null, 2)}`;
      } catch {
        msg += `\n\nCause: ${String(error.cause)}`;
      }
    } else {
      msg += `\n\nCause: ${String(error.cause)}`;
    }
  }

  console.error(msg);
}

Effect.runPromise(run());
