import { appError, type AppError } from "@/core/errors.js";
import { err, ok, type Result } from "@/core/result.js";
import type { CommandContext, RegistryItem } from "@/types.js";

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
  context: CommandContext,
): Result<RegistryItem[] | null, AppError> {
  const { flags } = context.args;
  const explicit = parseSelectedNames(flags.select);
  if (flags.all) {
    return ok(items);
  }

  if (explicit.length) {
    const selected = items.filter((item) => explicit.includes(item.name));
    if (!selected.length) {
      return err(appError("ValidationError", `No items matched --select=${String(flags.select)}`));
    }
    return ok(selected);
  }

  return ok(null);
}
