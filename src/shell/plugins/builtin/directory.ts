import type { PluginContext, RegpickPlugin } from "@/types.js";
import { Effect } from "effect";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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

      if (!ctx.runtime?.fs) return null;
      let statsRes;
      try {
        statsRes = await Effect.runPromise(ctx.runtime.fs.stat(fileSystemPath));
      } catch {
        return null;
      }

      if (!statsRes.isDirectory()) {
        return null;
      }

      const dirRes = await Effect.runPromise(ctx.runtime.fs.readdir(fileSystemPath));
      const jsonFiles = dirRes.filter((file: string) => file.endsWith(".json"));

      const items: unknown[] = [];

      for (const fileName of jsonFiles) {
        const fullPath = path.join(fileSystemPath, fileName);

        try {
          const readRes = await Effect.runPromise(ctx.runtime.fs.readFile(fullPath, "utf8"));
          const parsed = JSON.parse(readRes);
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
