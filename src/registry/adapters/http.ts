import { RegistryError } from "@/core/errors.js";
import { Registry, RegistryFile } from "@/domain/models/registry.js";
import { Effect } from "effect";
import { normalizeShadcnRegistry } from "./shadcn.js";

export function fetchHttpRegistry(url: string): Effect.Effect<Registry, RegistryError> {
  return Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () => fetch(url),
      catch: (e) =>
        new RegistryError({
          message: `Failed to fetch registry from ${url}`,
          cause: e as Error,
        }),
    });

    if (!response.ok) {
      return yield* Effect.fail(new RegistryError({ message: `HTTP Error: ${response.status}` }));
    }

    const data = yield* Effect.tryPromise({
      try: () => response.json(),
      catch: (e) =>
        new RegistryError({
          message: `Failed to parse JSON from ${url}`,
          cause: e as Error,
        }),
    });

    return yield* normalizeShadcnRegistry(data, url);
  });
}

export function fetchHttpFileContent(file: RegistryFile): Effect.Effect<string, RegistryError> {
  if (!file.url) {
    return Effect.fail(new RegistryError({ message: "File URL is missing" }));
  }

  return Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () => fetch(file.url!),
      catch: (e) =>
        new RegistryError({
          message: `Failed to fetch file content from ${file.url}`,
          cause: e as Error,
        }),
    });

    if (!response.ok) {
      return yield* Effect.fail(
        new RegistryError({
          message: `HTTP Error fetching file: ${response.status}`,
        }),
      );
    }

    return yield* Effect.tryPromise({
      try: () => response.text(),
      catch: (e) =>
        new RegistryError({
          message: `Failed to read text from ${file.url}`,
          cause: e as Error,
        }),
    });
  });
}
