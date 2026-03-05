import type { PluginContext, RegpickPlugin } from "@/types.js";
import { Effect } from "effect";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function isFileUrl(value: string): boolean {
  return /^file:\/\//i.test(value);
}

export function FilePlugin(): RegpickPlugin {
  return {
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
        return null; // Not enough context to resolve it as a file reliably, let other plugins try
      }

      // Convert back to file:// URL or just absolute path
      return pathToFileURL(resolvedPath).toString();
    },

    async load(id: string, ctx?: PluginContext) {
      if (!isFileUrl(id)) return null;
      if (!ctx?.runtime?.fs) return null;

      const fileSystemPath = fileURLToPath(new URL(id));

      const program = Effect.gen(function* () {
        const stats = yield* ctx.runtime.fs.stat(fileSystemPath);
        if (stats.isDirectory()) {
          return null;
        }

        const readValue = yield* ctx.runtime.fs.readFile(fileSystemPath, "utf8");
        try {
          return JSON.parse(readValue as string);
        } catch {
          return readValue;
        }
      }).pipe(Effect.catchAll(() => Effect.succeed(null)));

      return Effect.runPromise(program);
    },
  };
}
