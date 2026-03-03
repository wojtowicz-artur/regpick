import { appError, type AppError } from "@/core/errors.js";
import { err, ok, type Result } from "@/core/result.js";
import {
  extractItemReferences,
  normalizeItem,
  normalizeManifestInline,
} from "@/domain/registryModel.js";
import type { RuntimePorts } from "@/shell/runtime/ports.js";
import type { RegistryFile, RegistryItem, RegistrySourceMeta, RegpickPlugin } from "@/types.js";

async function normalizeManifest(
  data: unknown,
  sourceMeta: RegistrySourceMeta,
  runtime: RuntimePorts,
  plugins: RegpickPlugin[],
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
      for (const plugin of plugins) {
        if (!plugin.resolveId || !plugin.load) continue;

        try {
          const resolvedId = await plugin.resolveId(itemRef, sourceMeta.originalSource, {
            cwd: process.cwd(),
            runtime,
          });
          if (!resolvedId) continue;

          const loadResult = await plugin.load(resolvedId, {
            cwd: process.cwd(),
            runtime,
          });
          if (!loadResult) continue;

          let itemData: unknown;
          if (typeof loadResult === "string") {
            try {
              itemData = JSON.parse(loadResult);
            } catch {
              return err(appError("RegistryError", `Failed to parse JSON for ${resolvedId}`));
            }
          } else {
            itemData = loadResult;
          }

          if (itemData && typeof itemData === "object") {
            return ok(normalizeItem(itemData, sourceMeta));
          }
          return ok(null);
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : String(e);
          // If we encounter a critical error like HTTP 500, we should probably fail fully,
          // rather than silently ignoring it and trying another plugin,
          // but we follow adapter approach to throw/err where necessary
          if (e instanceof Error && "kind" in e) {
            return err(e as AppError);
          }
          return err(appError("RegistryError", `Failed to resolve ${itemRef}: ${errorMsg}`, e));
        }
      }
      return err(appError("RegistryError", `Could not resolve reference: ${itemRef}`));
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
  plugins: RegpickPlugin[],
): Promise<Result<{ items: RegistryItem[]; source: string }, AppError>> {
  if (!source) {
    return err(appError("ValidationError", "Registry source is required."));
  }

  for (const plugin of plugins) {
    if (!plugin.resolveId || !plugin.load) continue;

    try {
      const resolvedId = await plugin.resolveId(source, cwd, {
        cwd: process.cwd(),
        runtime,
      });
      if (!resolvedId) continue;

      const manifestRes = await plugin.load(resolvedId, {
        cwd: process.cwd(),
        runtime,
      });
      if (!manifestRes) {
        continue;
      }
      if (manifestRes && typeof manifestRes === "object" && manifestRes.ok === false) {
        return err(manifestRes.error);
      }

      const manifest =
        manifestRes && typeof manifestRes === "object" && "value" in manifestRes
          ? manifestRes.value
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
        const itemsRes = await normalizeManifest(
          manifest.rawData,
          manifest.sourceMeta,
          runtime,
          plugins,
        );
        if (!itemsRes.ok) return err(itemsRes.error);
        items = itemsRes.value;
      } else if ((manifest && typeof manifest === "object") || Array.isArray(manifest)) {
        const itemsRes = await normalizeManifest(
          manifest,
          { type: "system", originalSource: resolvedId },
          runtime,
          plugins,
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
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      if (e && typeof e === "object" && "kind" in e) {
        return err(e as AppError);
      }
      return err(
        appError("RegistryError", `Failed to load registry from ${source}: ${errorMsg}`, e),
      );
    }
  }

  return err(appError("RegistryError", `No suitable plugin found for source: ${source}`));
}

export async function resolveFileContent(
  file: RegistryFile,
  item: RegistryItem,
  cwd: string,
  runtime: RuntimePorts,
  plugins: RegpickPlugin[],
): Promise<Result<string, AppError>> {
  if (typeof file.content === "string") {
    return ok(file.content);
  }

  const targetPathOrUrl = file.url || file.path;

  if (!targetPathOrUrl) {
    return err(
      appError(
        "ValidationError",
        `File entry in "${item.name}" is missing both content and path/url.`,
      ),
    );
  }

  for (const plugin of plugins) {
    if (!plugin.resolveId || !plugin.load) continue;

    try {
      const originalSource = item.sourceMeta.originalSource || cwd;
      const resolvedId = await plugin.resolveId(targetPathOrUrl, originalSource, {
        cwd: process.cwd(),
        runtime,
      });
      if (!resolvedId) continue;

      const content = await plugin.load(resolvedId, {
        cwd: process.cwd(),
        runtime,
      });
      if (content == null) continue;

      return ok(typeof content === "string" ? content : JSON.stringify(content, null, 2));
    } catch (e) {
      // Here we catch any thrown appErrors from the plugins and bubble them up
      if (e && typeof e === "object" && "kind" in e) {
        return err(e as AppError);
      }
      const errorMsg = e instanceof Error ? e.message : String(e);
      return err(
        appError(
          "RegistryError",
          `Failed to load file content for ${targetPathOrUrl}: ${errorMsg}`,
          e,
        ),
      );
    }
  }

  return err(
    appError(
      "RegistryError",
      `No suitable plugin found to resolve file content for: ${targetPathOrUrl}`,
    ),
  );
}
