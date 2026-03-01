import { appError, type AppError } from "@/core/errors.js";
import { err, ok, type Result } from "@/core/result.js";
import type {
  RegistryFile,
  RegistryItem,
  RegistrySourceMeta,
} from "@/types.js";

type JsonRecord = Record<string, unknown>;

function asStringArray(value: unknown): string[] {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }
  if (typeof value === "string") {
    return [value];
  }
  return [];
}

function asObjectArray<T extends JsonRecord>(value: unknown): T[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is T =>
    Boolean(entry && typeof entry === "object"),
  );
}

export function normalizeItem(
  rawItem: JsonRecord,
  sourceMeta: RegistrySourceMeta,
): RegistryItem {
  const rawFiles = asObjectArray<JsonRecord>(rawItem.files);
  const files: RegistryFile[] = rawFiles.map((file) => ({
    path: typeof file.path === "string" ? file.path : undefined,
    target: typeof file.target === "string" ? file.target : undefined,
    type:
      typeof file.type === "string"
        ? file.type
        : typeof rawItem.type === "string"
          ? rawItem.type
          : "registry:file",
    content: typeof file.content === "string" ? file.content : undefined,
    url: typeof file.url === "string" ? file.url : undefined,
  }));

  const name =
    typeof rawItem.name === "string"
      ? rawItem.name
      : typeof rawItem.title === "string"
        ? rawItem.title
        : "unnamed-item";

  return {
    name,
    title: typeof rawItem.title === "string" ? rawItem.title : name,
    description:
      typeof rawItem.description === "string" ? rawItem.description : "",
    type: typeof rawItem.type === "string" ? rawItem.type : "registry:file",
    dependencies: asStringArray(rawItem.dependencies),
    devDependencies: asStringArray(rawItem.devDependencies),
    registryDependencies: asStringArray(rawItem.registryDependencies),
    files,
    sourceMeta,
  };
}

export function extractItemReferences(payload: JsonRecord): string[] {
  const items = asObjectArray<JsonRecord>(payload.items);
  return items
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
    const entries = asObjectArray<JsonRecord>(
      (data as JsonRecord).items,
    ).filter((entry) => Array.isArray(entry.files));
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
}
