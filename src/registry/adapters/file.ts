import { RegistryError } from "@/core/errors.js";
import { Registry, RegistryFile } from "@/domain/models/registry.js";
import { Effect } from "effect";
import fs from "fs/promises";
import path from "path";
import { normalizeShadcnRegistry } from "./shadcn.js";

export function readLocalRegistry(filePath: string): Effect.Effect<Registry, RegistryError> {
  return Effect.gen(function* () {
    const raw = yield* Effect.tryPromise({
      try: () => fs.readFile(filePath, "utf-8"),
      catch: (e) =>
        new RegistryError({
          message: `Failed to read local registry from ${filePath}`,
          cause: e as Error,
        }),
    });

    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      return yield* Effect.fail(
        new RegistryError({
          message: `Invalid JSON in ${filePath}`,
          cause: e as Error,
        }),
      );
    }

    return yield* normalizeShadcnRegistry(data, filePath);
  });
}

export function readLocalFileContent(
  basePath: string,
  file: RegistryFile,
): Effect.Effect<string, RegistryError> {
  if (!file.path) {
    return Effect.fail(new RegistryError({ message: "File path is missing" }));
  }

  const fullPath = path.resolve(path.dirname(basePath), file.path);
  return Effect.tryPromise({
    try: () => fs.readFile(fullPath, "utf-8"),
    catch: (e) =>
      new RegistryError({
        message: `Failed to read local file ${fullPath}`,
        cause: e as Error,
      }),
  });
}
