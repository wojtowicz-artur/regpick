import { RegistryError } from "../core/errors.js";
import type { RegistryFile, RegistryItem } from "../domain/models/registry.js";
import { normalizeManifestInline } from "../domain/registryModel.js";
import type { RegistryAdapter, AdapterContext } from "../sdk/RegistryAdapter.js";
import { Context, Effect } from "effect";
import { RegistryPort } from "./port.js";

export const createRegistryService = (
  adapters: RegistryAdapter[],
  adapterCtx: AdapterContext,
): Context.Tag.Service<RegistryPort> => {
  const findAdapter = (source: string): RegistryAdapter | undefined =>
    adapters.find((a) => a.canHandle(source));

  return RegistryPort.of({
    loadManifest: (source: string) =>
      Effect.gen(function* () {
        const adapter = findAdapter(source);
        if (!adapter) {
          return yield* Effect.fail(
            new RegistryError({
              message: `No registry adapter found for: ${source}`,
            }),
          );
        }

        const raw = yield* Effect.tryPromise({
          try: () => adapter.load(source, adapterCtx),
          catch: (e) =>
            new RegistryError({
              message: `[${adapter.name}] load failed for '${source}': ${String(e)}`,
            }),
        });

        const items = yield* normalizeManifestInline(raw.items, {
          type: adapter.name,
          originalSource: raw.source,
        }).pipe(
          Effect.mapError(
            (e) =>
              new RegistryError({
                message: `Failed to normalize manifest from ${source}: ${e.message}`,
              }),
          ),
        );

        return { items, source: raw.source };
      }),

    loadFileContent: (file: RegistryFile, item: RegistryItem) =>
      Effect.gen(function* () {
        if (typeof file.content === "string") {
          return file.content;
        }

        const source = item.sourceMeta?.originalSource ?? "";
        const adapter = findAdapter(source);

        if (!adapter) {
          return yield* Effect.fail(
            new RegistryError({
              message: `No adapter for file: ${file.path ?? file.url}`,
            }),
          );
        }

        return yield* Effect.tryPromise({
          try: () => adapter.loadFileContent(file, item, adapterCtx),
          catch: (e) =>
            new RegistryError({
              message: `[${adapter.name}] loadFileContent failed: ${String(e)}`,
            }),
        });
      }),
  });
};
