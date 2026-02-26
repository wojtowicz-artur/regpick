import { appError, type AppError } from "../core/errors.js";
import { err, ok, type Result } from "../core/result.js";
import type { CommandContext, CommandOutcome } from "../types.js";
import {
  decideInitAfterFirstWrite,
  decideInitAfterOverwritePrompt,
} from "../domain/initCore.js";
import { getConfigPath, writeConfig, readConfig } from "../shell/config.js";

export async function runInitCommand(
  context: CommandContext,
): Promise<Result<CommandOutcome, AppError>> {
  const outputPath = getConfigPath(context.cwd);
  const existsRes = await context.runtime.fs.stat(outputPath);
  
  if (existsRes.ok) {
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
  }

  const { config: existingConfig } = await readConfig(context.cwd);

  const packageManager = await context.runtime.prompt.select({
    message: "Jakiego menedżera pakietów używasz?",
    options: [
      { value: "auto", label: "Auto (wykrywanie)" },
      { value: "npm", label: "npm" },
      { value: "yarn", label: "yarn" },
      { value: "pnpm", label: "pnpm" }
    ],
  });

  if (context.runtime.prompt.isCancel(packageManager)) {
    return err(appError("UserCancelled", "Operation cancelled."));
  }

  const componentsFolder = await context.runtime.prompt.text({
    message: "W jakim folderze trzymasz komponenty UI?",
    placeholder: "src/components/ui",
  });

  if (context.runtime.prompt.isCancel(componentsFolder)) {
    return err(appError("UserCancelled", "Operation cancelled."));
  }

  const overwritePolicy = await context.runtime.prompt.select({
    message: "Czy chcesz nadpisywać pliki automatycznie, czy wolisz być pytany?",
    options: [
      { value: "prompt", label: "Pytaj (prompt)" },
      { value: "overwrite", label: "Zawsze nadpisuj (overwrite)" },
      { value: "skip", label: "Pomijaj nadpisywanie (skip)" }
    ],
  });

  if (context.runtime.prompt.isCancel(overwritePolicy)) {
    return err(appError("UserCancelled", "Operation cancelled."));
  }

  const newConfig = {
    ...existingConfig,
    packageManager: String(packageManager) as any,
    overwritePolicy: String(overwritePolicy) as any,
    targetsByType: {
      ...existingConfig.targetsByType,
      "registry:component": String(componentsFolder || "src/components/ui"),
      "registry:file": String(componentsFolder || "src/components/ui"),
      "registry:icon": `${String(componentsFolder || "src/components/ui")}/icons`,
    }
  };

  await writeConfig(context.cwd, newConfig, { overwrite: true });
  context.runtime.prompt.success(`${existsRes.ok ? "Overwrote" : "Created"} ${outputPath}`);
  return ok({ kind: "success", message: `${existsRes.ok ? "Overwrote" : "Created"} ${outputPath}` });
}
