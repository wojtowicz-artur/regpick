import { RegistryError } from "@/core/errors.js";
import { RegistryFile, RegistryItem } from "@/domain/models/registry.js";
import type { RegpickPlugin } from "@/sdk/index.js";
import { Effect } from "effect";
import { RegistryPort } from "./port.js";

import { readDirectoryRegistry } from "./adapters/directory.js";
import { readLocalFileContent, readLocalRegistry } from "./adapters/file.js";
import { fetchHttpFileContent, fetchHttpRegistry } from "./adapters/http.js";

import fs from "fs/promises";

function determineStrategy(source: string): "http" | "file" | "directory" {
  if (source.startsWith("http://") || source.startsWith("https://")) {
    return "http";
  }
  return "file";
}

export const createRegistryService = (
  plugins: RegpickPlugin[] = [],
): typeof RegistryPort.Service => {
  return RegistryPort.of({
    loadManifest: (sourceRaw: string) => {
      return Effect.gen(function* () {
        const source = sourceRaw.startsWith("file://")
          ? sourceRaw.slice("file://".length)
          : sourceRaw;

        for (const plugin of plugins) {
          if ((plugin as any).resolveId) {
            const resolved = yield* Effect.promise(() =>
              Promise.resolve(
                (plugin as any).resolveId!(source, undefined, {
                  isEntry: true,
                }),
              ),
            );
            if (resolved) {
              if ((plugin as any).load) {
                const loaded = yield* Effect.promise(() =>
                  Promise.resolve((plugin as any).load!(resolved)),
                );
                if (loaded) {
                  const manifest = typeof loaded === "string" ? JSON.parse(loaded) : loaded;
                  if (typeof manifest === "object" && manifest !== null && !manifest.source) {
                    manifest.source = sourceRaw;
                  }
                  return manifest;
                }
              }
            }
          }
        }

        const strategy = determineStrategy(source);

        if (strategy === "http") {
          return yield* fetchHttpRegistry(source);
        } else {
          const stat = yield* Effect.tryPromise({
            try: () => fs.stat(source),
            catch: (e) =>
              new RegistryError({
                message: `Cannot resolve local source: ${source}`,
                cause: e as Error,
              }),
          });

          if (stat.isDirectory()) {
            return yield* readDirectoryRegistry(source);
          } else {
            return yield* readLocalRegistry(source);
          }
        }
      });
    },

    loadFileContent: (file: RegistryFile, item: RegistryItem) => {
      return Effect.gen(function* () {
        if (file.content !== undefined) {
          return file.content;
        }

        for (const plugin of plugins) {
          if ((plugin as any).resolveId && file.path) {
            const resolved = yield* Effect.promise(() =>
              Promise.resolve(
                (plugin as any).resolveId!(file.path, item.sourceMeta?.originalSource, {
                  isEntry: false,
                }),
              ),
            );
            if (resolved) {
              if ((plugin as any).load) {
                const loaded = yield* Effect.promise(() =>
                  Promise.resolve((plugin as any).load!(resolved)),
                );
                if (loaded) {
                  return typeof loaded === "string" ? loaded : JSON.stringify(loaded);
                }
              }
            }
          }
        }

        if (file.url && (file.url.startsWith("http://") || file.url.startsWith("https://"))) {
          return yield* fetchHttpFileContent(file);
        }

        const source = item.sourceMeta?.originalSource;
        if (!source) {
          return yield* Effect.fail(
            new RegistryError({
              message: `Cannot determine source for file content of ${item.name}`,
            }),
          );
        }

        const strategy = determineStrategy(source);
        if (strategy === "http") {
          return yield* fetchHttpFileContent(file);
        } else {
          return yield* readLocalFileContent(source, file);
        }
      });
    },
  });
};

export const RegistryService = createRegistryService([]);
export const RegistryServiceLayer = Effect.succeed(RegistryService);
