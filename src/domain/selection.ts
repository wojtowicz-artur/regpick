import { Either } from "effect";
import { appError, type AppError } from "@/core/errors.js";
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
): Either.Either<RegistryItem[] | null, AppError> {
  const { flags } = context.args;
  const explicit = parseSelectedNames(flags.select);
  if (flags.all) {
    return Either.right(items);
  }

  if (explicit.length) {
    const selected = items.filter((item) => explicit.includes(item.name));
    if (!selected.length) {
      return Either.left(
        appError("ValidationError", `No items matched --select=${String(flags.select)}`),
      );
    }
    return Either.right(selected);
  }

  return Either.right(null);
}
