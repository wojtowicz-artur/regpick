import { CommandContextTag } from "@/core/context.js";
import { appError, toAppError } from "@/core/errors.js";
import { Runtime } from "@/core/ports.js";
import { decideInitAfterOverwritePrompt } from "@/domain/initCore.js";
import { readConfig, RegpickConfigSchema, resolveTargetConfigPath } from "@/shell/config/index.js";
import type { RegpickConfig } from "@/types.js";
import { Effect, Schema as S } from "effect";

export type InitQueryState = {
  configPath: string;
  exists: boolean;
  existingConfig: Partial<RegpickConfig>;
};

export type ApprovedInitPlan = {
  newConfig: RegpickConfig;
  configPath: string;
  isOverwrite: boolean;
};

export const queryInitState = () =>
  Effect.gen(function* () {
    const runtime = yield* Runtime;
    const context = yield* CommandContextTag;
    const configPath = yield* resolveTargetConfigPath(context.cwd).pipe(
      Effect.mapError(toAppError),
    );

    const statEff = yield* Effect.either(runtime.fs.stat(configPath));
    const exists = statEff._tag === "Right";

    const { config: existingConfig } = yield* readConfig(context.cwd).pipe(
      Effect.mapError(toAppError),
    );

    return {
      configPath,
      exists,
      existingConfig,
    } satisfies InitQueryState;
  });

export const interactInitPhase = (state: InitQueryState) =>
  Effect.gen(function* () {
    const runtime = yield* Runtime;
    const context = yield* CommandContextTag;

    if (state.exists) {
      const shouldOverwriteOrCancel = yield* runtime.prompt.confirm({
        message: `${state.configPath} already exists. Overwrite?`,
        initialValue: false,
      });

      const isCancel = yield* runtime.prompt.isCancel(shouldOverwriteOrCancel);

      const secondDecision = decideInitAfterOverwritePrompt(
        isCancel,
        shouldOverwriteOrCancel === true,
      );

      if (secondDecision === "cancelled") {
        return yield* Effect.fail(appError("UserCancelled", "Operation cancelled."));
      }

      if (secondDecision === "keep") {
        yield* runtime.prompt.info("Keeping existing configuration.");
        return null;
      }
    }

    const assumeYes = Boolean(context.args.flags.yes);

    const packageManager = assumeYes
      ? "auto"
      : yield* runtime.prompt.select({
          message: "What package manager do you use?",
          options: [
            { value: "auto", label: "Auto (detection)" },
            { value: "npm", label: "npm" },
            { value: "yarn", label: "yarn" },
            { value: "pnpm", label: "pnpm" },
          ],
        });

    const isPackageManagerCancel = yield* runtime.prompt.isCancel(packageManager);
    if (!assumeYes && isPackageManagerCancel) {
      return yield* Effect.fail(appError("UserCancelled", "Operation cancelled."));
    }

    const componentsFolder = assumeYes
      ? "src/components/ui"
      : yield* runtime.prompt.text({
          message: "What folder do you keep your UI components in?",
          placeholder: "src/components/ui",
        });

    const isComponentsFolderCancel = yield* runtime.prompt.isCancel(componentsFolder);
    if (!assumeYes && isComponentsFolderCancel) {
      return yield* Effect.fail(appError("UserCancelled", "Operation cancelled."));
    }

    const overwritePolicy = assumeYes
      ? "prompt"
      : yield* runtime.prompt.select({
          message: "Do you want to overwrite files automatically, or do you prefer to be asked?",
          options: [
            { value: "prompt", label: "Ask (prompt)" },
            { value: "overwrite", label: "Always overwrite (overwrite)" },
            { value: "skip", label: "Skip overwriting (skip)" },
          ],
        });

    const isOverwritePolicyCancel = yield* runtime.prompt.isCancel(overwritePolicy);
    if (!assumeYes && isOverwritePolicyCancel) {
      return yield* Effect.fail(appError("UserCancelled", "Operation cancelled."));
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

    const newConfig = S.decodeUnknownSync(RegpickConfigSchema)(newConfigRaw);

    return {
      newConfig: newConfig as import("@/types.js").RegpickConfig,
      configPath: state.configPath,
      isOverwrite: state.exists,
    } satisfies ApprovedInitPlan;
  });
