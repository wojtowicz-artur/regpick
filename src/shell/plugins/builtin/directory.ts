import type { PluginContext, RegpickPlugin } from "@/types.js";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function isFileUrl(value: string): boolean {
  return /^file:\/\//i.test(value);
}

export function DirectoryPlugin(): RegpickPlugin {
  return {
    type: "pipeline",
    name: "directory",
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
      } else if (ctx) {
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
        const statsRes = await ctx.runtime.fs.stat(fileSystemPath);
        if (!statsRes.isDirectory()) return null;

        const dirRes = await ctx.runtime.fs.readdir(fileSystemPath);
        const jsonFiles = dirRes.filter((file: string) => file.endsWith(".json"));

        const parsedItems = await Promise.all(
          jsonFiles.map(async (fileName) => {
            const fullPath = path.join(fileSystemPath, fileName);
            try {
              const readRes = await ctx.runtime.fs.readFile(fullPath, "utf8");
              const parsed = JSON.parse(readRes as string);
              if (
                parsed &&
                typeof parsed === "object" &&
                "files" in parsed &&
                Array.isArray(parsed.files)
              ) {
                return parsed;
              }
              return null;
            } catch {
              return null;
            }
          }),
        );

        const items = parsedItems.filter((i) => i !== null);
        return { items, resolvedSource: id };
      } catch {
        return null;
      }
    },
  };
}
