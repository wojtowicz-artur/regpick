import type { RuntimePorts } from "@/shell/runtime/ports.js";
import type { PackageManager, RegpickConfig } from "@/types.js";
import { getAllPackageManagerPlugins } from "./strategy.js";

export async function resolvePackageManager(
  cwd: string,
  configured: PackageManager,
  runtime: RuntimePorts,
  config?: RegpickConfig,
): Promise<string> {
  if (configured && configured !== "auto") {
    return configured;
  }

  const plugins = getAllPackageManagerPlugins(config);
  for (const plugin of plugins) {
    if (await plugin.detect(cwd, runtime)) {
      return plugin.name;
    }
  }

  return "npm";
}
