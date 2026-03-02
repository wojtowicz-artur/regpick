import { appError, type AppError } from "@/core/errors.js";
import { err, ok, type Result } from "@/core/result.js";
import * as v from "valibot";

export const RegistryFileSchema = v.object({
  path: v.optional(v.string()),
  target: v.optional(v.string()),
  type: v.optional(v.string(), "registry:file"),
  content: v.optional(v.string()),
  url: v.optional(v.string()),
});

export const RegistryItemSchema = v.object({
  name: v.optional(v.string(), "unnamed-item"),
  title: v.optional(v.string()),
  description: v.optional(v.string(), ""),
  type: v.optional(v.string(), "registry:file"),
  dependencies: v.optional(v.array(v.string()), []),
  devDependencies: v.optional(v.array(v.string()), []),
  registryDependencies: v.optional(v.array(v.string()), []),
  files: v.optional(v.array(RegistryFileSchema), []),
});

export const RegistrySourceMetaSchema = v.object({
  type: v.string(),
  originalSource: v.optional(v.string()),
  adapterState: v.optional(v.record(v.string(), v.unknown())),
});

export type RegistryFile = v.InferOutput<typeof RegistryFileSchema>;
export type RegistrySourceMeta = v.InferOutput<typeof RegistrySourceMetaSchema>;
export type RegistryItem = v.InferOutput<typeof RegistryItemSchema> & {
  sourceMeta: RegistrySourceMeta;
};

export function normalizeItem(rawItem: unknown, sourceMeta: RegistrySourceMeta): RegistryItem {
  const parsed = v.parse(RegistryItemSchema, rawItem);

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
}

const ReferenceItemSchema = v.object({
  url: v.optional(v.string()),
  href: v.optional(v.string()),
  path: v.optional(v.string()),
  files: v.optional(v.unknown()),
});

const ManifestItemsSchema = v.object({
  items: v.array(v.union([v.record(v.string(), v.unknown()), ReferenceItemSchema])),
});

export function extractItemReferences(payload: unknown): string[] {
  const result = v.safeParse(ManifestItemsSchema, payload);
  if (!result.success) {
    return [];
  }

  return result.output.items
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

const SingleItemManifestSchema = v.object({
  files: v.array(v.unknown()),
});

export function normalizeManifestInline(
  data: unknown,
  sourceMeta: RegistrySourceMeta,
): Result<RegistryItem[], AppError> {
  try {
    if (Array.isArray(data)) {
      const items = data
        .filter((entry) => Boolean(entry && typeof entry === "object"))
        .map((entry) => normalizeItem(entry, sourceMeta));
      return ok(items);
    }

    const hasItemsRes = v.safeParse(ManifestItemsSchema, data);
    if (hasItemsRes.success) {
      const entries = hasItemsRes.output.items.filter(
        (entry) =>
          "files" in (entry as Record<string, unknown>) &&
          Array.isArray((entry as Record<string, unknown>).files),
      );
      return ok(entries.map((entry) => normalizeItem(entry, sourceMeta)));
    }

    const hasFilesRes = v.safeParse(SingleItemManifestSchema, data);
    if (hasFilesRes.success) {
      return ok([normalizeItem(data, sourceMeta)]);
    }

    return err(appError("RegistryError", "Unsupported manifest structure."));
  } catch (e) {
    if (v.isValiError(e)) {
      return err(appError("ValidationError", `Manifest validation failed: ${e.message}`));
    }
    return err(appError("RegistryError", "Failed to parse manifest"));
  }
}
