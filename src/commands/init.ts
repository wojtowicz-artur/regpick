import { appError, type AppError } from "../core/errors.js";
import { err, ok, type Result } from "../core/result.js";
import type { CommandContext, CommandOutcome } from "../types.js";
import {
  decideInitAfterFirstWrite,
  decideInitAfterOverwritePrompt,
} from "../domain/initCore.js";
import { getConfigPath, writeDefaultConfig } from "../shell/config.js";

export async function runInitCommand(
  context: CommandContext,
): Promise<Result<CommandOutcome, AppError>> {
  const outputPath = getConfigPath(context.cwd);
  const initialWrite = await writeDefaultConfig(context.cwd, { overwrite: false });

  const firstDecision = decideInitAfterFirstWrite(initialWrite.written);
  if (firstDecision === "created") {
    context.runtime.prompt.success(`Created ${outputPath}`);
    return ok({ kind: "success", message: `Created ${outputPath}` });
  }

  const shouldOverwrite = await context.runtime.prompt.confirm({
    message: `${outputPath} already exists. Overwrite?`,
    initialValue: false,
  });

  const secondDecision = decideInitAfterOverwritePrompt(
    context.runtime.prompt.isCancel(shouldOverwrite),
    Boolean(shouldOverwrite),
  );
  if (secondDecision === "cancelled") {
    return err(appError("UserCancelled", "Operation cancelled."));
  }

  if (secondDecision === "keep") {
    context.runtime.prompt.info("Keeping existing configuration.");
    return ok({ kind: "noop", message: "Keeping existing configuration." });
  }

  await writeDefaultConfig(context.cwd, { overwrite: true });
  context.runtime.prompt.success(`Overwrote ${outputPath}`);
  return ok({ kind: "success", message: `Overwrote ${outputPath}` });
}
