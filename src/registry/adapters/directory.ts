import { RegistryError } from "@/core/errors.js";
import { Registry } from "@/domain/models/registry.js";
import { Effect } from "effect";
import fs from "fs/promises";
import path from "path";
import { readLocalRegistry } from "./file.js";

// Sometimes users might point to a directory instead of a specific registry.json file.
export function readDirectoryRegistry(dirPath: string): Effect.Effect<Registry, RegistryError> {
  return Effect.gen(function* () {
    // Basic approach: look for a registry.json inside the directory
    // A more advanced approach could scan for subdirectories.
    const registryPath = path.join(dirPath, "registry.json");

    const exists = yield* Effect.tryPromise({
      try: () =>
        fs
          .stat(registryPath)
          .then(() => true)
          .catch(() => false),
      catch: (e) =>
        new RegistryError({
          message: `Failed to check stat for ${registryPath}`,
          cause: e as Error,
        }),
    });

    if (!exists) {
      return yield* Effect.fail(
        new RegistryError({
          message: `No registry.json found in directory: ${dirPath}`,
        }),
      );
    }

    return yield* readLocalRegistry(registryPath);
  });
}
