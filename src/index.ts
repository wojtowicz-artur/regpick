import { Effect } from "effect";
import path from "node:path";
import { styleText } from "node:util";

import { CommandContextTag } from "@/core/context.js";
import { toAppError } from "@/core/errors.js";
import { JournalPort } from "@/execution/journal/port.js";
import { determineRecoveryAction, executeRecovery } from "@/execution/journal/recovery.js";
import { LockfilePort } from "@/execution/lockfile/port.js";
import { container } from "@/interfaces/bootstrap/container.js";
import { buildAddIntent } from "@/interfaces/cli/commands/addCli.js";
import { buildInitIntent } from "@/interfaces/cli/commands/initCli.js";
import { buildListIntent } from "@/interfaces/cli/commands/listCli.js";
import { buildPackIntent } from "@/interfaces/cli/commands/packCli.js";
import { parseCliArgs } from "@/interfaces/cli/parser.js";
import { FileSystemPort } from "@/interfaces/fs/port.js";
import { PromptPort } from "@/interfaces/prompt/port.js";
import { addWorkflow } from "@/workflows/add/workflow.js";
import { initWorkflow } from "@/workflows/init/workflow.js";
import { listWorkflow } from "@/workflows/list/workflow.js";
import { packWorkflow } from "@/workflows/pack/workflow.js";

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

function run() {
  return Effect.gen(function* () {
    const abortController = new AbortController();

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

    const context = {
      cwd: parsed.flags.cwd ? path.resolve(process.cwd(), String(parsed.flags.cwd)) : process.cwd(),
      args: parsed,
    };

    console.log(styleText("cyan", "regpick"));

    const executeCommand = Effect.gen(function* () {
      const journal = yield* JournalPort;
      const fs = yield* FileSystemPort;
      const lockfileOpts = yield* LockfilePort;
      const prompt = yield* PromptPort;

      const pendingEntry = yield* journal.read(context.cwd);
      if (pendingEntry) {
        const action = determineRecoveryAction(pendingEntry);
        if (action !== "none") {
          yield* prompt.error(
            styleText(
              "yellow",
              `Previous incomplete operation detected. Recovering (${action})...`,
            ),
          );

          const ports = {
            removeFile: (p: string) => fs.remove(p),
            restoreLockfile: (p: string, l: any) => lockfileOpts.write(context.cwd, l),
            deleteJournalEntry: (_id: string) => journal.clear(context.cwd),
          };

          const result = yield* Effect.either(executeRecovery(pendingEntry, ports));
          if (result._tag === "Left") {
            yield* prompt.error(styleText("red", `Recovery failed: ${result.left.message}`));
          } else {
            yield* prompt.outro(styleText("green", "Recovery completed."));
          }
        }
      }

      let commandEffect: Effect.Effect<any, any, any>;

      switch (command) {
        case "add": {
          const intent = buildAddIntent(parsed);
          commandEffect = addWorkflow(intent);
          break;
        }
        case "init": {
          const intent = buildInitIntent(parsed);
          commandEffect = initWorkflow(intent);
          break;
        }
        case "list": {
          const intent = buildListIntent(parsed);
          commandEffect = listWorkflow(intent);
          break;
        }
        case "pack": {
          const intent = buildPackIntent(parsed);
          commandEffect = packWorkflow(intent);
          break;
        }
        case "update":
          commandEffect = Effect.gen(function* () {
            yield* prompt.outro(styleText("yellow", `Mocked ${command} workflow...`));
            return { kind: "noop", message: `Mocked ${command} completed` };
          });
          break;
        default:
          yield* prompt.error(`Unknown command: ${command}`);
          printHelp();
          process.exitCode = 1;
          return yield* Effect.succeed(undefined as any);
      }

      const result = yield* commandEffect;

      if (result && result.kind === "noop") {
        yield* prompt.outro(styleText("yellow", result.message));
        return;
      }

      yield* prompt.outro(styleText("green", "Done."));
    }).pipe(
      Effect.catchAll((error) =>
        Effect.gen(function* () {
          const prompt = yield* PromptPort;
          handleAppError(error, console.error);
          prompt.outro(styleText("red", "Failed."));
          process.exitCode = 1;
        }),
      ),
      Effect.catchAllDefect((defect) =>
        Effect.gen(function* () {
          const prompt = yield* PromptPort;
          const appErr = toAppError(defect);
          handleAppError(appErr, console.error);
          prompt.outro(styleText("red", "Failed."));
          process.exitCode = 1;
        }),
      ),
    );

    yield* executeCommand.pipe(
      Effect.provide(container),
      Effect.provideService(CommandContextTag, context),
    );
  });
}

function handleAppError(error: any, write: (message: string) => void): void {
  if (error._tag === "UserCancelled") {
    write(error.message);
    return;
  }

  let msg = `[${error._tag || "Error"}] ${error.message}`;

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

Effect.runPromise(
  run().pipe(
    Effect.catchAll((err) => {
      console.error("UNCAUGHT:", err);
      process.exit(1);
      return Effect.succeed(undefined);
    }),
    Effect.catchAllDefect((d) => {
      console.error("DEFECT:", d);
      process.exit(1);
      return Effect.succeed(undefined);
    }),
  ) as any,
);
