import path from "node:path";
import pc from "picocolors";

import type { CommandContext, CommandOutcome } from "./types.js";
import { type AppError, toAppError } from "./core/errors.js";
import type { Result } from "./core/result.js";
import { runAddCommand } from "./commands/add.js";
import { runInitCommand } from "./commands/init.js";
import { runListCommand } from "./commands/list.js";
import { runUpdateCommand } from "./commands/update.js";
import { runPackCommand } from "./commands/pack.js";
import { parseCliArgs } from "./shell/cli/args.js";
import { createRuntimePorts } from "./shell/runtime/ports.js";

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
      console.error(pc.red(`\n[Fatal Error] ${err.message}`));
    }
    process.exit(1);
  };
  
  process.on("SIGINT", () => handleTerminate());
  process.on("SIGTERM", () => handleTerminate());
  process.on("uncaughtException", handleTerminate);
  process.on("unhandledRejection", (reason) => handleTerminate(reason instanceof Error ? reason : new Error(String(reason))));

  const runtime = createRuntimePorts({ signal: abortController.signal });
  const parsed = parseCliArgs(process.argv.slice(2));
  const command = parsed.positionals[0];

  if (!command || parsed.flags.help) {
    printHelp();
    return;
  }

  const context: CommandContext = {
    cwd: parsed.flags.cwd ? path.resolve(process.cwd(), String(parsed.flags.cwd)) : process.cwd(),
    args: parsed,
    runtime,
  };

  runtime.prompt.intro(pc.cyan("regpick"));

  try {
    let result: Result<CommandOutcome, AppError>;
    if (command === "init") {
      result = await runInitCommand(context);
    } else if (command === "list") {
      result = await runListCommand(context);
    } else if (command === "add") {
      result = await runAddCommand(context);
    } else if (command === "update") {
      result = await runUpdateCommand(context);
    } else if (command === "pack") {
      result = await runPackCommand(context);
    } else {
      runtime.prompt.error(`Unknown command: ${command}`);
      printHelp();
      process.exitCode = 1;
      return;
    }

    if (!result.ok) {
      handleAppError(result.error, runtime.prompt.error);
      runtime.prompt.outro(pc.red("Failed."));
      process.exitCode = 1;
      return;
    }

    if (result.value.kind === "noop") {
      runtime.prompt.outro(pc.yellow(result.value.message));
      return;
    }

    runtime.prompt.outro(pc.green("Done."));
  } catch (error) {
    const appErr = toAppError(error);
    handleAppError(appErr, runtime.prompt.error);
    runtime.prompt.outro(pc.red("Failed."));
    process.exitCode = 1;
  }
}

function handleAppError(error: AppError, write: (message: string) => void): void {
  if (error.kind === "UserCancelled") {
    write(error.message);
    return;
  }
  write(`[${error.kind}] ${error.message}`);
}

void run();
