import type { RuntimePorts } from "@/shell/runtime/ports.js";
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
    for (const plugin of plugins) {
      const isDetected = yield* Effect.promise(() => Promise.resolve(plugin.detect(cwd, runtime)));
      if (isDetected) {
        return plugin.name;
      }
    }

    return "npm";
  });
}
