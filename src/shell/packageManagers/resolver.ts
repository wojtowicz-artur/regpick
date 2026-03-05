import type { RuntimePorts } from "@/core/ports.js";
import { createStandardRuntime } from "@/shell/plugins/adapter.js";
import type { PackageManager, RegpickConfig } from "@/types.js";
import { Effect } from "effect";
import { getAllPackageManagerPlugins } from "./strategy.js";

export function resolvePackageManager(
  cwd: string,
  configured: PackageManager,
  runtime: RuntimePorts,
  config?: RegpickConfig,
): Effect.Effect<string, never, never> {
  return Effect.gen(function* () {
    if (configured && configured !== "auto") {
      return configured;
    }

    const plugins = getAllPackageManagerPlugins(config);
    const stdRuntime = createStandardRuntime(runtime);

    for (const plugin of plugins) {
      const isDetected = yield* Effect.tryPromise({
        try: () => Promise.resolve(plugin.detect(cwd, stdRuntime)),
        catch: () => false,
      }).pipe(Effect.catchAll(() => Effect.succeed(false)));

      if (isDetected) {
        return plugin.name;
      }
    }

    return "npm";
  });
}
