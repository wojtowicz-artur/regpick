import path from "node:path";
import { styleText } from "node:util";

import { type AppError, toAppError } from "@/core/errors.js";
import type { Result } from "@/core/result.js";
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

async function run(): Promise<void> {
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
    handleTerminate(
      reason instanceof Error ? reason : new Error(String(reason)),
    ),
  );

  const parsed = parseCliArgs(process.argv.slice(2));
  const command = parsed.positionals[0];

  if (!command || parsed.flags.help) {
    printHelp();
    return;
  }

  const { createRuntimePorts } = await import("@/shell/runtime/ports.js");
  const runtime = createRuntimePorts({ signal: abortController.signal });

  if (!command || parsed.flags.help) {
    printHelp();
    return;
  }

  const context: CommandContext = {
    cwd: parsed.flags.cwd
      ? path.resolve(process.cwd(), String(parsed.flags.cwd))
      : process.cwd(),
    args: parsed,
    runtime,
  };

  runtime.prompt.intro(styleText("cyan", "regpick"));

  try {
    let result: Result<CommandOutcome, AppError>;
    if (command === "init") {
      result = await import("@/commands/init.js").then((mod) =>
        mod.runInitCommand(context),
      );
    } else if (command === "list") {
      result = await import("@/commands/list.js").then((mod) =>
        mod.runListCommand(context),
      );
    } else if (command === "add") {
      result = await import("@/commands/add.js").then((mod) =>
        mod.runAddCommand(context),
      );
    } else if (command === "update") {
      result = await import("@/commands/update.js").then((mod) =>
        mod.runUpdateCommand(context),
      );
    } else if (command === "pack") {
      result = await import("@/commands/pack.js").then((mod) =>
        mod.runPackCommand(context),
      );
    } else {
      runtime.prompt.error(`Unknown command: ${command}`);
      printHelp();
      process.exitCode = 1;
      return;
    }

    if (!result.ok) {
      handleAppError(result.error, runtime.prompt.error);
      runtime.prompt.outro(styleText("red", "Failed."));
      process.exitCode = 1;
      return;
    }

    if (result.value.kind === "noop") {
      runtime.prompt.outro(styleText("yellow", result.value.message));
      return;
    }

    runtime.prompt.outro(styleText("green", "Done."));
  } catch (error) {
    const appErr = toAppError(error);
    handleAppError(appErr, runtime.prompt.error);
    runtime.prompt.outro(styleText("red", "Failed."));
    process.exitCode = 1;
  }
}

function handleAppError(
  error: AppError,
  write: (message: string) => void,
): void {
  if (error.kind === "UserCancelled") {
    write(error.message);
    return;
  }
  write(`[${error.kind}] ${error.message}`);
}

void run();
