import type { PluginContext, RegpickPlugin } from "@/types.js";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function isFileUrl(value: string): boolean {
  return /^file:\/\//i.test(value);
}

export function FilePlugin(): RegpickPlugin {
  return {
    type: "pipeline",
    name: "file",
    async resolveId(source: string, importer?: string, ctx?: PluginContext) {
      if (isFileUrl(source)) return source;

      let resolvedPath: string;
      if (importer && isFileUrl(importer)) {
        const importDir = path.dirname(fileURLToPath(new URL(importer)));
        resolvedPath = path.resolve(importDir, source);
      } else if (importer && path.isAbsolute(importer)) {
        const importDir = path.dirname(importer);
        resolvedPath = path.resolve(importDir, source);
      } else if (path.isAbsolute(source)) {
        resolvedPath = source;
      } else if (ctx && source.endsWith(".json")) {
        resolvedPath = path.resolve(ctx.cwd, source);
      } else {
        return null;
      }

      return pathToFileURL(resolvedPath).toString();
    },

    async load(id: string, ctx?: PluginContext) {
      if (!isFileUrl(id)) return null;
      if (!ctx?.runtime?.fs) return null;

      const fileSystemPath = fileURLToPath(new URL(id));

      try {
        const stats = await ctx.runtime.fs.stat(fileSystemPath);
        if (stats.isDirectory()) {
          return null;
        }

        const readValue = await ctx.runtime.fs.readFile(fileSystemPath, "utf8");
        try {
          return JSON.parse(readValue as string);
        } catch {
          return readValue;
        }
      } catch {
        return null;
      }
    },
  };
}
