import type { PluginContext, RegpickPlugin } from "@/types.js";

export function HttpPlugin(): RegpickPlugin {
  return {
    type: "pipeline",
    name: "http",
    async resolveId(source: string, importer?: string, _ctx?: PluginContext) {
      if (source.includes("github.com") && source.includes("/blob/")) {
        source = source.replace("github.com", "raw.githubusercontent.com").replace("/blob/", "/");
      }

      if (source.startsWith("http://") || source.startsWith("https://")) {
        return source;
      }
      if (importer && (importer.startsWith("http://") || importer.startsWith("https://"))) {
        return new URL(source, importer).toString();
      }
      return null;
    },
    async load(id: string, ctx?: PluginContext) {
      if (!id.startsWith("http://") && !id.startsWith("https://")) return null;
      if (!ctx) return null;

      try {
        const res = await ctx.runtime.http.getText(id);
        try {
          return JSON.parse(res);
        } catch {
          return res;
        }
      } catch (error) {
        throw new Error(
          `Failed to load ${id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  };
}
