import { appError, type AppError } from "@/core/errors.js";
import type { RuntimePorts } from "@/core/ports.js";
import {
  extractItemReferences,
  normalizeItem,
  normalizeManifestInline,
} from "@/domain/registryModel.js";
import type { RegistryFile, RegistryItem, RegistrySourceMeta, RegpickPlugin } from "@/types.js";
import { Effect, Either } from "effect";

// Helper 1: Resolve and load a single target with exactly 1 compatible plugin.
function resolveAndLoadWithPlugins(
  target: string,
  cwd: string,
  originalSource: string | undefined,
  runtime: RuntimePorts,
  plugins: RegpickPlugin[],
): Effect.Effect<{ plugin: RegpickPlugin; resolvedId: string; content: unknown }, AppError> {
  return Effect.gen(function* () {
    const pipelinePlugins = plugins.filter(
      (p): p is import("@/types.js").PipelinePlugin => p.type === "pipeline",
    );

    for (const plugin of pipelinePlugins) {
      if (!plugin.resolveId || !plugin.load) continue;

      const resolvedId = yield* Effect.tryPromise({
        try: async () =>
          plugin.resolveId!(target, originalSource || cwd, {
            cwd,
            runtime,
          }),
        catch: (e): AppError => {
          if (e && typeof e === "object" && "_tag" in e) return e as AppError;
          return appError(
            "RegistryError",
            `Failed to resolve ${target}: ${e instanceof Error ? e.message : String(e)}`,
            e,
          );
        },
      });

      if (!resolvedId) continue;

      const content = yield* Effect.tryPromise({
        try: async () => plugin.load!(resolvedId, { cwd, runtime }),
        catch: (e): AppError => {
          if (e && typeof e === "object" && "_tag" in e) return e as AppError;
          return appError(
            "RegistryError",
            `Failed to load ${resolvedId}: ${e instanceof Error ? e.message : String(e)}`,
            e,
          );
        },
      });

      if (content == null) continue;

      return { plugin, resolvedId, content };
    }

    return yield* Effect.fail(
      appError("RegistryError", `No suitable plugin found to resolve: ${target}`),
    );
  });
}

function resolveItemReference(
  itemRef: string,
  cwd: string,
  sourceMeta: RegistrySourceMeta,
  runtime: RuntimePorts,
  plugins: RegpickPlugin[],
): Effect.Effect<RegistryItem | null, AppError> {
  return Effect.gen(function* () {
    const loadOpt = yield* Effect.either(
      resolveAndLoadWithPlugins(itemRef, cwd, sourceMeta.originalSource, runtime, plugins),
    );

    if (Either.isLeft(loadOpt)) {
      const e = loadOpt.left;
      if (e._tag === "RegistryError" && e.message.includes("No suitable plugin")) {
        return yield* Effect.fail(
          appError("RegistryError", `Could not resolve reference: ${itemRef}`),
        );
      }
      return yield* Effect.fail(e);
    }

    const { resolvedId, content } = loadOpt.right;

    let itemData: unknown;
    if (typeof content === "string") {
      itemData = yield* Effect.try({
        try: () => JSON.parse(content),
        catch: () => appError("RegistryError", `Failed to parse JSON for ${resolvedId}`),
      });
    } else {
      itemData = content;
    }

    if (itemData && typeof itemData === "object") {
      return yield* normalizeItem(itemData, sourceMeta).pipe(
        Effect.mapError((e) =>
          appError("ValidationError", `Validation failed for item: ${e.message}`, e),
        ),
      );
    }

    return null;
  });
}

function normalizeManifest(
  data: unknown,
  cwd: string,
  sourceMeta: RegistrySourceMeta,
  runtime: RuntimePorts,
  plugins: RegpickPlugin[],
): Effect.Effect<RegistryItem[], AppError> {
  return Effect.gen(function* () {
    const inlineItemsRes = normalizeManifestInline(data, sourceMeta);

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return yield* inlineItemsRes;
    }

    const references = extractItemReferences(data);
    if (!references.length) {
      return yield* inlineItemsRes;
    }

    const inlineItems = yield* Effect.catchAll(inlineItemsRes, () => Effect.succeed([]));

    const resolvedItems = yield* Effect.all(
      references.map((ref) => resolveItemReference(ref, cwd, sourceMeta, runtime, plugins)),
      { concurrency: "unbounded" },
    ).pipe(Effect.map((items) => items.filter((item): item is RegistryItem => item !== null)));

    return [...inlineItems, ...resolvedItems];
  });
}

export function loadRegistry(
  source: string,
  cwd: string,
  runtime: RuntimePorts,
  plugins: RegpickPlugin[],
): Effect.Effect<{ items: RegistryItem[]; source: string }, AppError> {
  return Effect.gen(function* () {
    if (!source) {
      return yield* Effect.fail(appError("ValidationError", "Registry source is required."));
    }

    const loadOpt = yield* Effect.either(
      resolveAndLoadWithPlugins(source, cwd, undefined, runtime, plugins),
    );

    if (Either.isLeft(loadOpt)) {
      const e = loadOpt.left;
      if (e._tag === "RegistryError" && e.message.includes("No suitable plugin found")) {
        return yield* Effect.fail(
          appError("RegistryError", `No suitable plugin found for source: ${source}`),
        );
      }
      return yield* Effect.fail(e);
    }

    const { resolvedId, content: manifestRes } = loadOpt.right;

    if (
      manifestRes &&
      typeof manifestRes === "object" &&
      "ok" in manifestRes &&
      (manifestRes as { ok: boolean }).ok === false
    ) {
      return yield* Effect.fail((manifestRes as unknown as { error: AppError }).error);
    }

    const manifest =
      manifestRes && typeof manifestRes === "object" && "value" in manifestRes
        ? (manifestRes as { value: unknown }).value
        : manifestRes;

    let items: RegistryItem[] = [];
    if (
      manifest &&
      typeof manifest === "object" &&
      "items" in manifest &&
      Array.isArray(manifest.items)
    ) {
      items = manifest.items;
    } else if (manifest && typeof manifest === "object" && "rawData" in manifest) {
      items = yield* normalizeManifest(
        manifest.rawData,
        cwd,
        (manifest as unknown as { sourceMeta: RegistrySourceMeta }).sourceMeta,
        runtime,
        plugins,
      );
    } else if ((manifest && typeof manifest === "object") || Array.isArray(manifest)) {
      items = yield* normalizeManifest(
        manifest,
        cwd,
        { type: "system", originalSource: resolvedId },
        runtime,
        plugins,
      );
    }

    const finalSource: string =
      (manifest &&
      typeof manifest === "object" &&
      "resolvedSource" in manifest &&
      typeof (manifest as { resolvedSource: string }).resolvedSource === "string"
        ? (manifest as { resolvedSource: string }).resolvedSource
        : undefined) || source;

    const enhancedItems = items.map((item) => ({
      ...item,
      sourceMeta: {
        ...item.sourceMeta,
        originalSource: finalSource,
      },
    }));

    return {
      items: enhancedItems,
      source: finalSource,
    };
  });
}

export function resolveFileContent(
  file: RegistryFile,
  item: RegistryItem,
  cwd: string,
  runtime: RuntimePorts,
  plugins: RegpickPlugin[],
): Effect.Effect<string, AppError> {
  return Effect.gen(function* () {
    if (typeof file.content === "string") {
      return file.content;
    }

    const targetPathOrUrl = file.url || file.path;

    if (!targetPathOrUrl) {
      return yield* Effect.fail(
        appError(
          "ValidationError",
          `File entry in "${item.name}" is missing both content and path/url.`,
        ),
      );
    }

    const loadOpt = yield* Effect.either(
      resolveAndLoadWithPlugins(
        targetPathOrUrl,
        cwd,
        item.sourceMeta.originalSource || cwd,
        runtime,
        plugins,
      ),
    );

    if (Either.isLeft(loadOpt)) {
      const e = loadOpt.left;
      if (e._tag === "RegistryError" && e.message.includes("No suitable plugin found")) {
        return yield* Effect.fail(
          appError(
            "RegistryError",
            `No suitable plugin found to resolve file content for: ${targetPathOrUrl}`,
          ),
        );
      }
      return yield* Effect.fail(e);
    }

    const { content } = loadOpt.right;
    return typeof content === "string" ? content : JSON.stringify(content, null, 2);
  });
}
