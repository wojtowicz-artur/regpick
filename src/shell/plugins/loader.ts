import type { RegpickPlugin } from "@/types.js";
import path from "node:path";
import * as v from "valibot";
import { PluginSchema } from "../config.js";

export async function loadPlugins(
  configuredPlugins: (string | any)[],
  cwd: string,
): Promise<RegpickPlugin[]> {
  const plugins: RegpickPlugin[] = [];

  for (const plugin of configuredPlugins) {
    if (typeof plugin === "string") {
      try {
        let importPath = plugin;
        if (plugin.startsWith(".") || plugin.startsWith("/")) {
          importPath = path.resolve(cwd, plugin);
        }

        const imported = await import(importPath);
        const resolved = imported.default || imported.plugin || imported;

        const validPlugin = v.parse(PluginSchema, resolved);
        plugins.push(validPlugin as unknown as RegpickPlugin);
      } catch (err: any) {
        console.warn(`[regpick] Failed to load plugin module: ${plugin} - ${err.message}`);
      }
    } else {
      try {
        const validPlugin = v.parse(PluginSchema, plugin);
        plugins.push(validPlugin as unknown as RegpickPlugin);
      } catch (err: any) {
        console.warn(`[regpick] Invalid plugin provided: ${err.message}`);
      }
    }
  }

  return plugins;
}
