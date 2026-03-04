import { Runtime } from "@/core/ports.js";
import { interactInitPhase, queryInitState } from "@/shell/cli/initOrchestrator.js";
import { generateConfigCode } from "@/shell/config/index.js";
import type { CommandOutcome } from "@/types.js";
import { Effect } from "effect";
import path from "node:path";

export const runInitCommand = () =>
  Effect.gen(function* () {
    const runtime = yield* Runtime;
    const state = yield* queryInitState();
    const plan = yield* interactInitPhase(state);

    if (!plan) {
      return {
        kind: "noop",
        message: "Keeping existing configuration.",
      } as CommandOutcome;
    }

    const ext = path.extname(plan.configPath).slice(1);
    const format = ["ts", "mjs", "cjs", "js", "json"].includes(ext)
      ? (ext as import("@/shell/config/index.js").ConfigFormat)
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
