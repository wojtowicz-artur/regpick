import path from "node:path";
import pc from "picocolors";

import type { CommandContext, CommandOutcome } from "./types.js";
import { type AppError, toAppError } from "./core/errors.js";
import type { Result } from "./core/result.js";
import { runAddCommand } from "./commands/add.js";
import { runInitCommand } from "./commands/init.js";
import { runListCommand } from "./commands/list.js";
import { parseCliArgs } from "./shell/cli/args.js";
import { defaultRuntimePorts } from "./shell/runtime/ports.js";

function printHelp(): void {
  console.log(`
Usage:
  regpick init
  regpick list [registry-name-or-url]
  regpick add [registry-name-or-url]

Options:
  --cwd=<path>           Working directory (default: current directory)
  --all                  Select all items in add flow
  --select=a,b,c         Select explicit item names in add flow
  --yes                  Skip confirmation prompts where safe
  --help                 Show this help
`);
}

async function run(): Promise<void> {
  const runtime = defaultRuntimePorts;
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
