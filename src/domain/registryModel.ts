import { appError, type AppError } from "@/core/errors.js";
import { Effect, Schema as S } from "effect";

export const RegistryFileSchema = S.Struct({
  path: S.optionalWith(S.String, { exact: true }),
  target: S.optionalWith(S.String, { exact: true }),
  type: S.optionalWith(S.String, {
    exact: true,
    default: () => "registry:file",
  }),
  content: S.optionalWith(S.String, { exact: true }),
  url: S.optionalWith(S.String, { exact: true }),
});

export const RegistryItemSchema = S.Struct({
  name: S.optionalWith(S.String, {
    exact: true,
    default: () => "unnamed-item",
  }),
  title: S.optionalWith(S.String, { exact: true }),
  description: S.optionalWith(S.String, { exact: true, default: () => "" }),
  type: S.optionalWith(S.String, {
    exact: true,
    default: () => "registry:file",
  }),
  dependencies: S.optionalWith(S.Array(S.String), {
    exact: true,
    default: () => [],
  }),
  devDependencies: S.optionalWith(S.Array(S.String), {
    exact: true,
    default: () => [],
  }),
  registryDependencies: S.optionalWith(S.Array(S.String), {
    exact: true,
    default: () => [],
  }),
  files: S.optionalWith(S.Array(RegistryFileSchema), {
    exact: true,
    default: () => [],
  }),
});

export const RegistrySourceMetaSchema = S.Struct({
  type: S.String,
  originalSource: S.optionalWith(S.String, { exact: true }),
  pluginState: S.optionalWith(S.Record({ key: S.String, value: S.Unknown }), {
    exact: true,
  }),
});

export type RegistryFile = S.Schema.Type<typeof RegistryFileSchema>;
export type RegistrySourceMeta = S.Schema.Type<typeof RegistrySourceMetaSchema>;
export type RegistryItem = S.Schema.Type<typeof RegistryItemSchema> & {
  sourceMeta: RegistrySourceMeta;
};

export function normalizeItem(
  rawItem: unknown,
  sourceMeta: RegistrySourceMeta,
): Effect.Effect<RegistryItem, AppError> {
  return Effect.gen(function* () {
    const parsed = yield* S.decodeUnknown(RegistryItemSchema)(rawItem).pipe(
      Effect.mapError((e) =>
        appError("ValidationError", `Manifest validation failed: ${e.message}`),
      ),
    );

    const name = parsed.name === "unnamed-item" && parsed.title ? parsed.title : parsed.name;
    const title = parsed.title ?? name;
    const files = parsed.files.map((file) => ({
      ...file,
      type:
        file.type === "registry:file" && parsed.type !== "registry:file" ? parsed.type : file.type,
    }));

    return {
      ...parsed,
      name,
      title,
      files,
      sourceMeta,
    };
  });
}

const ReferenceItemSchema = S.Struct({
  url: S.optionalWith(S.String, { exact: true }),
  href: S.optionalWith(S.String, { exact: true }),
  path: S.optionalWith(S.String, { exact: true }),
  files: S.optionalWith(S.Unknown, { exact: true }),
});

const ManifestItemsSchema = S.Struct({
  items: S.Array(S.Union(S.Record({ key: S.String, value: S.Unknown }), ReferenceItemSchema)),
});

export function extractItemReferences(payload: unknown): string[] {
  const result = S.decodeUnknownEither(ManifestItemsSchema)(payload);
  if (result._tag === "Left") {
    return [];
  }

  return result.right.items
    .map((entry) => {
      const safeEntry = entry as Record<string, unknown>;
      if ("files" in safeEntry && Array.isArray(safeEntry.files)) {
        return null; // inline item, not a reference
      }
      return typeof safeEntry.url === "string"
        ? safeEntry.url
        : typeof safeEntry.href === "string"
          ? safeEntry.href
          : typeof safeEntry.path === "string"
            ? safeEntry.path
            : null;
    })
    .filter((value): value is string => Boolean(value));
}

const SingleItemManifestSchema = S.Struct({
  files: S.Array(S.Unknown),
});

export function normalizeManifestInline(
  data: unknown,
  sourceMeta: RegistrySourceMeta,
): Effect.Effect<RegistryItem[], AppError> {
  return Effect.gen(function* () {
    if (Array.isArray(data)) {
      const entries = data.filter((entry) => Boolean(entry && typeof entry === "object"));
      return yield* Effect.all(entries.map((entry) => normalizeItem(entry, sourceMeta)));
    }

    const hasItemsRes = S.decodeUnknownEither(ManifestItemsSchema)(data);
    if (hasItemsRes._tag === "Right") {
      const entries = hasItemsRes.right.items.filter(
        (entry) =>
          "files" in (entry as Record<string, unknown>) &&
          Array.isArray((entry as Record<string, unknown>).files),
      );
      return yield* Effect.all(entries.map((entry) => normalizeItem(entry, sourceMeta)));
    }

    const hasFilesRes = S.decodeUnknownEither(SingleItemManifestSchema)(data);
    if (hasFilesRes._tag === "Right") {
      const item = yield* normalizeItem(data, sourceMeta);
      return [item];
    }

    return yield* appError("RegistryError", "Unsupported manifest structure.");
  });
}
