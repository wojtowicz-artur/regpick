import { appError, type AppError } from "@/core/errors.js";
import { err, ok, type Result } from "@/core/result.js";
import {
  extractItemReferences,
  normalizeItem,
  normalizeManifestInline,
} from "@/domain/registryModel.js";
import type { RuntimePorts } from "@/shell/runtime/ports.js";
import type { RegistryFile, RegistryItem, RegistrySourceMeta } from "@/types.js";
import type { RegistryAdapter } from "./registry/adapters/types.js";

async function normalizeManifest(
  data: unknown,
  sourceMeta: RegistrySourceMeta,
  runtime: RuntimePorts,
  adapter: RegistryAdapter,
): Promise<Result<RegistryItem[], AppError>> {
  const inlineItemsRes = normalizeManifestInline(data, sourceMeta);

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return inlineItemsRes;
  }

  const references = extractItemReferences(data);
  if (!references.length) {
    return inlineItemsRes;
  }

  const inlineItems = inlineItemsRes.ok ? inlineItemsRes.value : [];

  const resolvedItemResults = await Promise.all(
    references.map(async (itemRef) => {
      const res = await adapter.resolveItemReference(itemRef, sourceMeta, runtime);
      if (!res.ok) return err(res.error);

      const itemData = res.value;
      if (itemData && typeof itemData === "object") {
        return ok(normalizeItem(itemData, sourceMeta));
      }
      return ok(null);
    }),
  );

  const resolvedItems: RegistryItem[] = [];
  for (const res of resolvedItemResults) {
    if (!res.ok) return res;
    if (res.value) resolvedItems.push(res.value);
  }

  return ok([...inlineItems, ...resolvedItems]);
}

export async function loadRegistry(
  source: string,
  cwd: string,
  runtime: RuntimePorts,
  adapters: RegistryAdapter[],
): Promise<Result<{ items: RegistryItem[]; source: string }, AppError>> {
  if (!source) {
    return err(appError("ValidationError", "Registry source is required."));
  }

  for (const adapter of adapters) {
    if (adapter.match({ source, cwd })) {
      const manifestRes = await adapter.resolveManifest({ source, cwd }, runtime);
      if (!manifestRes.ok) return err(manifestRes.error);

      const manifest = manifestRes.value;

      let items: RegistryItem[] = [];
      if (manifest.items) {
        items = manifest.items;
      } else if (manifest.rawData) {
        const itemsRes = await normalizeManifest(
          manifest.rawData,
          manifest.sourceMeta,
          runtime,
          adapter,
        );
        if (!itemsRes.ok) return err(itemsRes.error);
        items = itemsRes.value;
      }

      const finalSource = manifest.resolvedSource || source;

      const enhancedItems = items.map((item) => ({
        ...item,
        sourceMeta: {
          ...item.sourceMeta,
          originalSource: finalSource,
        },
      }));

      return ok({
        items: enhancedItems,
        source: finalSource,
      });
    }
  }

  return err(appError("RegistryError", `No suitable adapter found for source: ${source}`));
}

export async function resolveFileContent(
  file: RegistryFile,
  item: RegistryItem,
  cwd: string,
  runtime: RuntimePorts,
  adapters: RegistryAdapter[],
): Promise<Result<string, AppError>> {
  if (typeof file.content === "string") {
    return ok(file.content);
  }

  const adapter = adapters.find((a) => a.name === item.sourceMeta.type) || adapters[0];

  if (adapter) {
    return adapter.resolveFile(file, item, cwd, runtime);
  }

  return err(appError("RegistryError", `No suitable adapter found to resolve file content.`));
}
