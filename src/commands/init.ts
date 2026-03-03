import { appError, type AppError } from "@/core/errors.js";
import { err, ok, type Result } from "@/core/result.js";
import { decideInitAfterOverwritePrompt } from "@/domain/initCore.js";
import {
  generateConfigCode,
  readConfig,
  RegpickConfigSchema,
  resolveTargetConfigPath,
} from "@/shell/config.js";
import type { CommandContext, CommandOutcome, RegpickConfig } from "@/types.js";
import path from "node:path";
import * as v from "valibot";

type InitQueryState = {
  configPath: string;
  exists: boolean;
  existingConfig: Partial<RegpickConfig>;
};

type ApprovedInitPlan = {
  newConfig: RegpickConfig;
  configPath: string;
  isOverwrite: boolean;
};

/**
 * Queries the current environment state for regpick initialization.
 *
 * @param context - Command context.
 * @returns Result with existing configuration states.
 */
async function queryInitState(context: CommandContext): Promise<Result<InitQueryState, AppError>> {
  const configPath = await resolveTargetConfigPath(context.cwd);
  const existsRes = await context.runtime.fs.stat(configPath);
  const exists = existsRes.ok;

  const { config: existingConfig } = await readConfig(context.cwd);

  return ok({
    configPath,
    exists,
    existingConfig,
  });
}

/**
 * Interacts with the user to determine framework and project specifications.
 *
 * @param context - Command context.
 * @param state - Evaluated environment initial query state.
 * @returns Approved plan, or null to indicate skipping config creation.
 */
async function interactInitPhase(
  context: CommandContext,
  state: InitQueryState,
): Promise<Result<ApprovedInitPlan | null, AppError>> {
  if (state.exists) {
    const shouldOverwrite = await context.runtime.prompt.confirm({
      message: `${state.configPath} already exists. Overwrite?`,
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
      return ok(null); // Explicit noop signal
    }
  }

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
    ...state.existingConfig,
    install: {
      packageManager: String(packageManager),
      overwritePolicy: String(overwritePolicy),
    },
    resolve: {
      targets: {
        ...state.existingConfig.resolve?.targets,
        "registry:component": String(componentsFolder || "src/components/ui"),
        "registry:file": String(componentsFolder || "src/components/ui"),
        "registry:icon": `${String(componentsFolder || "src/components/ui")}/icons`,
      },
    },
  };

  const newConfig = v.parse(RegpickConfigSchema, newConfigRaw);

  return ok({
    newConfig,
    configPath: state.configPath,
    isOverwrite: state.exists,
  });
}

/**
 * Main controller for the `init` command.
 * Orchestrates CQS flow: State Query -> Interaction -> Execution.
 *
 * @param context - Command context.
 * @returns Result indicating outcome.
 */
export async function runInitCommand(
  context: CommandContext,
): Promise<Result<CommandOutcome, AppError>> {
  const stateQ = await queryInitState(context);
  if (!stateQ.ok) return err(stateQ.error);

  const planQ = await interactInitPhase(context, stateQ.value);
  if (!planQ.ok) return err(planQ.error);
  if (!planQ.value) return ok({ kind: "noop", message: "Keeping existing configuration." });

  const ext = path.extname(planQ.value.configPath).slice(1);
  const format = ["ts", "mjs", "cjs", "js", "json"].includes(ext) ? (ext as any) : "json";

  const content = generateConfigCode(planQ.value.newConfig, format);
  const writeRes = await context.runtime.fs.writeFile(planQ.value.configPath, content, "utf8");

  if (!writeRes.ok) {
    context.runtime.prompt.error(`Failed to write config file: ${planQ.value.configPath}`);
    return err(writeRes.error);
  }

  context.runtime.prompt.success(
    `${planQ.value.isOverwrite ? "Overwrote" : "Created"} ${planQ.value.configPath}`,
  );

  return ok({
    kind: "success",
    message: `${planQ.value.isOverwrite ? "Overwrote" : "Created"} ${planQ.value.configPath}`,
  });
}
