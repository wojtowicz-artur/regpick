import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { PluginContext, RegpickPlugin } from "@/types.js";

function isFileUrl(value: string): boolean {
  return /^file:\/\//i.test(value);
}

export function DirectoryPlugin(): RegpickPlugin {
  return {
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
      if (!ctx) return null;

      const fileSystemPath = fileURLToPath(new URL(id));

      const statsRes = ctx.runtime?.fs
        ? await ctx.runtime.fs.stat(fileSystemPath)
        : { ok: false, value: null };
      if (!statsRes || !statsRes.ok || !statsRes.value) {
        return null;
      }

      if (!statsRes.value.isDirectory()) {
        return null;
      }

      const dirRes = await ctx.runtime.fs.readdir(fileSystemPath);
      if (!dirRes.ok) throw new Error(dirRes.error.message);

      const jsonFiles = dirRes.value.filter((file) => file.endsWith(".json"));

      const items: any[] = [];

      for (const fileName of jsonFiles) {
        const fullPath = path.join(fileSystemPath, fileName);
        const readRes = await ctx.runtime.fs.readFile(fullPath, "utf8");
        if (!readRes.ok) continue;

        try {
          const parsed = JSON.parse(readRes.value);
          if (
            parsed &&
            typeof parsed === "object" &&
            "files" in parsed &&
            Array.isArray(parsed.files)
          ) {
            items.push(parsed);
          }
        } catch {
          // ignore invalid json in directory
        }
      }

      return { items, resolvedSource: id };
    },
  };
}
