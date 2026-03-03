import type { RegpickPlugin } from "@/types.js";
import path from "node:path";
import * as v from "valibot";
import { PluginSchema } from "../config.js";

export async function loadPlugins(
  configuredPlugins: (string | unknown)[],
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
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[regpick] Failed to load plugin module: ${plugin} - ${msg}`);
      }
    } else {
      try {
        const validPlugin = v.parse(PluginSchema, plugin);
        plugins.push(validPlugin as unknown as RegpickPlugin);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[regpick] Invalid plugin provided: ${msg}`);
      }
    }
  }

  return plugins;
}
