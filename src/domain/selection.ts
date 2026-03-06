import { Effect } from "effect";
import { appError, type AppError } from "@/core/errors.js";
import type { RegistryItem } from "@/domain/models/index.js";

export function parseSelectedNames(rawSelectFlag: string | boolean | undefined): string[] {
  if (!rawSelectFlag) {
    return [];
  }

  return String(rawSelectFlag)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function filterItemsByQuery(items: RegistryItem[], query: string): RegistryItem[] {
  if (!query) {
    return items;
  }

  const lowered = query.toLowerCase();
  return items.filter((item) => {
    return (
      item.name.toLowerCase().includes(lowered) ||
      (item.title || "").toLowerCase().includes(lowered) ||
      (item.description || "").toLowerCase().includes(lowered)
    );
  });
}

export function selectItemsFromFlags(
  items: RegistryItem[],
  contextOrIntent: any,
): Effect.Effect<RegistryItem[] | null, AppError> {
  const flags = contextOrIntent.args?.flags || contextOrIntent.flags || {};
  let explicit = parseSelectedNames(flags.select);
  if (explicit.length === 0 && Array.isArray(flags.components)) {
    explicit = flags.components;
  }

  if (flags.all) {
    return Effect.succeed(items);
  }

  if (explicit.length) {
    const selected = items.filter((item) => explicit.includes(item.name));
    if (!selected.length) {
      return Effect.fail(appError("ValidationError", `No items matched the provided selection.`));
    }
    return Effect.succeed(selected);
  }

  return Effect.succeed(null);
}
