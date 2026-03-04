import { CommandContextTag } from "@/core/context.js";
import { appError } from "@/core/errors.js";
import { decideInitAfterOverwritePrompt } from "@/domain/initCore.js";
import {
  generateConfigCode,
  readConfig,
  RegpickConfigSchema,
  resolveTargetConfigPath,
} from "@/shell/config.js";
import { Runtime } from "@/shell/runtime/ports.js";
import type { CommandOutcome, RegpickConfig } from "@/types.js";
import { Effect, Schema as S } from "effect";
import path from "node:path";

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

const queryInitState = () =>
  Effect.gen(function* () {
    const runtime = yield* Runtime;
    const context = yield* CommandContextTag;
    const configPath = yield* resolveTargetConfigPath(context.cwd).pipe(
      Effect.mapError((err) => appError("RuntimeError", String(err))),
    );

    const statEff = yield* Effect.either(runtime.fs.stat(configPath));
    const exists = statEff._tag === "Right";

    const { config: existingConfig } = yield* readConfig(context.cwd).pipe(
      Effect.mapError((err) => appError("RuntimeError", String(err))),
    );

    return {
      configPath,
      exists,
      existingConfig,
    } satisfies InitQueryState;
  });

const interactInitPhase = (state: InitQueryState) =>
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
          message: "Jakiego menedżera pakietów używasz?",
          options: [
            { value: "auto", label: "Auto (wykrywanie)" },
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
          message: "W jakim folderze trzymasz komponenty UI?",
          placeholder: "src/components/ui",
        });

    const isComponentsFolderCancel = yield* runtime.prompt.isCancel(componentsFolder);
    if (!assumeYes && isComponentsFolderCancel) {
      return yield* Effect.fail(appError("UserCancelled", "Operation cancelled."));
    }

    const overwritePolicy = assumeYes
      ? "prompt"
      : yield* runtime.prompt.select({
          message: "Czy chcesz nadpisywać pliki automatycznie, czy wolisz być pytany?",
          options: [
            { value: "prompt", label: "Pytaj (prompt)" },
            { value: "overwrite", label: "Zawsze nadpisuj (overwrite)" },
            { value: "skip", label: "Pomijaj nadpisywanie (skip)" },
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
      newConfig: newConfig as import("../types.js").RegpickConfig,
      configPath: state.configPath,
      isOverwrite: state.exists,
    } satisfies ApprovedInitPlan;
  });

export const runInitCommand = () =>
  Effect.gen(function* () {
    const runtime = yield* Runtime;
    const state = yield* queryInitState();
    const plan = yield* interactInitPhase(state);

    if (!plan)
      return {
        kind: "noop",
        message: "Keeping existing configuration.",
      } as CommandOutcome;

    const ext = path.extname(plan.configPath).slice(1);
    const format = ["ts", "mjs", "cjs", "js", "json"].includes(ext)
      ? (ext as import("../shell/config.js").ConfigFormat)
      : "json";

    const content = generateConfigCode(plan.newConfig, format);

    yield* Effect.catchAll(runtime.fs.writeFile(plan.configPath, content, "utf8"), (e) =>
      Effect.gen(function* () {
        yield* runtime.prompt.error(`Failed to write config file: ${plan.configPath}`);
        return yield* Effect.fail(e);
      }),
    );

    yield* runtime.prompt.success(
      `${plan.isOverwrite ? "Overwrote" : "Created"} ${plan.configPath}`,
    );

    return {
      kind: "success",
      message: `${plan.isOverwrite ? "Overwrote" : "Created"} ${plan.configPath}`,
    } as CommandOutcome;
  });
