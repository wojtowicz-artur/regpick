import { appError, type AppError } from "@/core/errors.js";
import { err, ok, type Result } from "@/core/result.js";
import type { RegistryItem, RegistrySourceMeta } from "@/types.js";
import * as v from "valibot";

type JsonRecord = Record<string, unknown>;

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

export function normalizeItem(
  rawItem: JsonRecord,
  sourceMeta: RegistrySourceMeta,
): RegistryItem {
  const parsed = v.parse(RegistryItemSchema, rawItem);

  const name =
    parsed.name === "unnamed-item" && parsed.title ? parsed.title : parsed.name;
  const title = parsed.title ?? name;
  const files = parsed.files.map((file) => ({
    ...file,
    type:
      file.type === "registry:file" && parsed.type !== "registry:file"
        ? parsed.type
        : file.type,
  }));

  return {
    ...parsed,
    name,
    title,
    files,
    sourceMeta,
  };
}

export function extractItemReferences(payload: JsonRecord): string[] {
  if (!payload || !Array.isArray(payload.items)) return [];

  return payload.items
    .filter((entry): entry is JsonRecord =>
      Boolean(entry && typeof entry === "object"),
    )
    .map((entry) => {
      if (Array.isArray(entry.files)) {
        return null;
      }
      return typeof entry.url === "string"
        ? entry.url
        : typeof entry.href === "string"
          ? entry.href
          : typeof entry.path === "string"
            ? entry.path
            : null;
    })
    .filter((value): value is string => Boolean(value));
}

export function normalizeManifestInline(
  data: unknown,
  sourceMeta: RegistrySourceMeta,
): Result<RegistryItem[], AppError> {
  try {
    if (Array.isArray(data)) {
      const items = data
        .filter((entry): entry is JsonRecord =>
          Boolean(entry && typeof entry === "object"),
        )
        .map((entry) => normalizeItem(entry, sourceMeta));
      return ok(items);
    }

    if (
      data &&
      typeof data === "object" &&
      Array.isArray((data as JsonRecord).items)
    ) {
      const entries = ((data as JsonRecord).items as JsonRecord[]).filter(
        (entry) =>
          entry && typeof entry === "object" && Array.isArray(entry.files),
      );
      return ok(entries.map((entry) => normalizeItem(entry, sourceMeta)));
    }

    if (
      data &&
      typeof data === "object" &&
      Array.isArray((data as JsonRecord).files)
    ) {
      return ok([normalizeItem(data as JsonRecord, sourceMeta)]);
    }

    return err(appError("RegistryError", "Unsupported manifest structure."));
  } catch (e) {
    if (v.isValiError(e)) {
      return err(
        appError("ValidationError", `Manifest validation failed: ${e.message}`),
      );
    }
    return err(appError("RegistryError", "Failed to parse manifest"));
  }
}
