import { RegistryError } from "@/core/errors.js";
import { RegistryFile, RegistryItem } from "@/domain/models/registry.js";
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
  return "file"; // Default fallback, we'll refine if it's a dir inside the logic
}

export const RegistryService = RegistryPort.of({
  loadManifest: (source: string) => {
    return Effect.gen(function* () {
      const strategy = determineStrategy(source);

      if (strategy === "http") {
        return yield* fetchHttpRegistry(source);
      } else {
        // Check if it's a directory or a file
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
    // If the file explicitly has a URL, fetch it via HTTP
    if (file.url && (file.url.startsWith("http://") || file.url.startsWith("https://"))) {
      return fetchHttpFileContent(file);
    }

    // Otherwise it must be a local file structure (relying on originalSource from the item)
    const source = item.sourceMeta?.originalSource;
    if (!source) {
      return Effect.fail(
        new RegistryError({
          message: `Cannot determine source for file content of ${item.name}`,
        }),
      );
    }

    const strategy = determineStrategy(source);
    if (strategy === "http") {
      return fetchHttpFileContent(file);
    } else {
      return readLocalFileContent(source, file);
    }
  },
});

// A layer you can use to provide RegistryPort
export const RegistryServiceLayer = Effect.succeed(RegistryService);
