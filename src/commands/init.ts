import * as v from "valibot";
import { appError, type AppError } from "@/core/errors.ts";
import { err, ok, type Result } from "@/core/result.ts";
import { decideInitAfterOverwritePrompt } from "@/domain/initCore.ts";
import { getConfigPath, readConfig, RegpickConfigSchema, writeConfig } from "@/shell/config.ts";
import type { CommandContext, CommandOutcome } from "@/types.ts";

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
      await context.runtime.prompt.isCancel(shouldOverwrite),
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
  const assumeYes = Boolean(context.args.flags.yes);

  const packageManager = assumeYes
    ? "auto"
    : await context.runtime.prompt.select({
        message: "Jakiego menedżera pakietów używasz?",
        options: [
          { value: "auto", label: "Auto (wykrywanie)" },
          { value: "npm", label: "npm" },
          { value: "yarn", label: "yarn" },
          { value: "pnpm", label: "pnpm" },
        ],
      });

  const isPackageManagerCancel = await context.runtime.prompt.isCancel(packageManager);
  if (!assumeYes && isPackageManagerCancel) {
    return err(appError("UserCancelled", "Operation cancelled."));
  }

  const componentsFolder = assumeYes
    ? "src/components/ui"
    : await context.runtime.prompt.text({
        message: "W jakim folderze trzymasz komponenty UI?",
        placeholder: "src/components/ui",
      });

  const isComponentsFolderCancel = await context.runtime.prompt.isCancel(componentsFolder);
  if (!assumeYes && isComponentsFolderCancel) {
    return err(appError("UserCancelled", "Operation cancelled."));
  }

  const overwritePolicy = assumeYes
    ? "prompt"
    : await context.runtime.prompt.select({
        message: "Czy chcesz nadpisywać pliki automatycznie, czy wolisz być pytany?",
        options: [
          { value: "prompt", label: "Pytaj (prompt)" },
          { value: "overwrite", label: "Zawsze nadpisuj (overwrite)" },
          { value: "skip", label: "Pomijaj nadpisywanie (skip)" },
        ],
      });

  const isOverwritePolicyCancel = await context.runtime.prompt.isCancel(overwritePolicy);
  if (!assumeYes && isOverwritePolicyCancel) {
    return err(appError("UserCancelled", "Operation cancelled."));
  }

  const newConfigRaw = {
    ...existingConfig,
    packageManager: String(packageManager),
    overwritePolicy: String(overwritePolicy),
    targetsByType: {
      ...existingConfig.targetsByType,
      "registry:component": String(componentsFolder || "src/components/ui"),
      "registry:file": String(componentsFolder || "src/components/ui"),
      "registry:icon": `${String(componentsFolder || "src/components/ui")}/icons`,
    },
  };

  const newConfig = v.parse(RegpickConfigSchema, newConfigRaw);

  try {
    await writeConfig(context.cwd, newConfig, { overwrite: true });
  } catch (error) {
    const errorMsg = `Failed to write config file: ${error instanceof Error ? error.message : String(error)}`;
    context.runtime.prompt.error(errorMsg);
    return err(appError("RuntimeError", errorMsg));
  }

  context.runtime.prompt.success(`${existsRes.ok ? "Overwrote" : "Created"} ${outputPath}`);
  return ok({
    kind: "success",
    message: `${existsRes.ok ? "Overwrote" : "Created"} ${outputPath}`,
  });
}
