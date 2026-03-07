import type { RegpickConfig } from "@/domain/models/index.js";
import { Effect } from "effect";
import { getAllPackageManagerPlugins } from "./strategy.js";

type MinimalRuntime = {
  fs: { existsSync(path: string): boolean };
};

export function resolvePackageManager(
  cwd: string,
  configured: string | undefined,
  runtime: MinimalRuntime,
  config?: RegpickConfig,
): Effect.Effect<string, never, never> {
  return Effect.gen(function* () {
    if (configured && configured !== "auto") {
      return configured;
    }

    const plugins = getAllPackageManagerPlugins(config);

    for (const plugin of plugins) {
      const isDetected = yield* Effect.tryPromise({
        try: () => Promise.resolve(plugin.detect(cwd, runtime.fs)),
        catch: () => false,
      }).pipe(Effect.catchAll(() => Effect.succeed(false)));

      if (isDetected) {
        return plugin.name;
      }
    }

    return "npm";
  });
}
