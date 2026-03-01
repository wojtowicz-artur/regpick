import path from "node:path";
import { fileURLToPath } from "node:url";

import { appError, type AppError } from "@/core/errors.js";
import { err, ok, type Result } from "@/core/result.js";
import {
  extractItemReferences,
  normalizeItem,
  normalizeManifestInline,
} from "@/domain/registryModel.js";
import type { RuntimePorts } from "@/shell/runtime/ports.js";
import type { RegistryFile, RegistryItem, RegistrySourceMeta } from "@/types.js";

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function normalizeGitHubUrl(url: string): string {
  if (!url.includes("github.com")) return url;

  // matches: https://github.com/user/repo/blob/branch/path/to/file
  // matches: https://github.com/user/repo/tree/branch/path/to/dir
  return url
    .replace(/^https?:\/\/github\.com\//, "https://raw.githubusercontent.com/")
    .replace(/\/(blob|tree)\//, "/");
}

function isFileUrl(value: string): boolean {
  return /^file:\/\//i.test(value);
}

function joinUrl(baseUrl: string, relativePath: string): string {
  return new URL(relativePath, baseUrl).toString();
}

async function normalizeManifest(
  data: unknown,
  sourceMeta: RegistrySourceMeta,
  runtime: RuntimePorts,
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
      let itemData: unknown;
      if (isHttpUrl(itemRef)) {
        const res = await runtime.http.getJson(itemRef);
        if (!res.ok) return err(res.error);
        itemData = res.value;
      } else if (sourceMeta.type === "http" && sourceMeta.baseUrl) {
        const res = await runtime.http.getJson(joinUrl(sourceMeta.baseUrl, itemRef));
        if (!res.ok) return err(res.error);
        itemData = res.value;
      } else if (
        (sourceMeta.type === "file" || sourceMeta.type === "directory") &&
        sourceMeta.baseDir
      ) {
        const res = await runtime.fs.readFile(path.resolve(sourceMeta.baseDir, itemRef), "utf8");
        if (!res.ok) return err(res.error);
        try {
          itemData = JSON.parse(res.value);
        } catch {
          return err(appError("RegistryError", `Invalid JSON: ${itemRef}`));
        }
      } else {
        const res = await runtime.fs.readFile(path.resolve(itemRef), "utf8");
        if (!res.ok) return err(res.error);
        try {
          itemData = JSON.parse(res.value);
        } catch {
          return err(appError("RegistryError", `Invalid JSON: ${itemRef}`));
        }
      }

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

async function loadDirectoryRegistry(
  directoryPath: string,
  runtime: RuntimePorts,
): Promise<Result<RegistryItem[], AppError>> {
  const absoluteDir = path.resolve(directoryPath);
  const dirRes = await runtime.fs.readdir(absoluteDir);
  if (!dirRes.ok) return err(dirRes.error);

  const files = dirRes.value;
  const jsonFiles = files.filter((file) => file.endsWith(".json"));

  const fileResults = await Promise.all(
    jsonFiles.map(async (fileName) => {
      const fullPath = path.join(absoluteDir, fileName);
      const readRes = await runtime.fs.readFile(fullPath, "utf8");
      if (!readRes.ok) return readRes; // Bubble error up

      let parsed: unknown;
      try {
        parsed = JSON.parse(readRes.value);
      } catch {
        return ok(null);
      }

      if (
        !parsed ||
        typeof parsed !== "object" ||
        !("files" in parsed) ||
        !Array.isArray(parsed.files)
      ) {
        return ok(null);
      }

      return ok(
        normalizeItem(parsed, {
          type: "directory",
          baseDir: absoluteDir,
        }),
      );
    }),
  );

  const items: RegistryItem[] = [];
  for (const res of fileResults) {
    if (!res.ok) return err(res.error);
    if (res.value) items.push(res.value);
  }

  return ok(items);
}

export async function loadRegistry(
  source: string,
  cwd: string,
  runtime: RuntimePorts,
): Promise<Result<{ items: RegistryItem[]; source: string }, AppError>> {
  if (!source) {
    return err(appError("ValidationError", "Registry source is required."));
  }

  const resolved =
    isHttpUrl(source) || isFileUrl(source) ? normalizeGitHubUrl(source) : path.resolve(cwd, source);

  if (isHttpUrl(resolved)) {
    const dataRes = await runtime.http.getJson(resolved);
    if (!dataRes.ok) return err(dataRes.error);
    const baseUrl = resolved.endsWith("/") ? resolved : resolved.replace(/[^/]*$/, "");
    const itemsRes = await normalizeManifest(dataRes.value, { type: "http", baseUrl }, runtime);
    if (!itemsRes.ok) return err(itemsRes.error);
    return ok({ items: itemsRes.value, source: resolved });
  }

  const fileSystemPath = isFileUrl(resolved)
    ? fileURLToPath(new URL(resolved))
    : path.resolve(resolved);
  const statsRes = await runtime.fs.stat(fileSystemPath);
  if (!statsRes.ok) {
    return err(appError("RegistryError", `Registry source not found: ${source}`));
  }
  const stats = statsRes.value;

  if (stats.isDirectory()) {
    const itemsRes = await loadDirectoryRegistry(fileSystemPath, runtime);
    if (!itemsRes.ok) return err(itemsRes.error);
    return ok({ items: itemsRes.value, source: fileSystemPath });
  }

  const readRes = await runtime.fs.readFile(fileSystemPath, "utf8");
  if (!readRes.ok) return err(readRes.error);

  let parsed: unknown;
  try {
    parsed = JSON.parse(readRes.value);
  } catch (cause) {
    return err(appError("RegistryError", "Failed to parse registry JSON.", cause));
  }

  const itemsRes = await normalizeManifest(
    parsed,
    {
      type: "file",
      baseDir: path.dirname(fileSystemPath),
    },
    runtime,
  );

  if (!itemsRes.ok) return err(itemsRes.error);
  return ok({ items: itemsRes.value, source: fileSystemPath });
}

export async function resolveFileContent(
  file: RegistryFile,
  item: RegistryItem,
  cwd: string,
  runtime: RuntimePorts,
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

  const normalizedTarget = isHttpUrl(targetPathOrUrl)
    ? normalizeGitHubUrl(targetPathOrUrl)
    : targetPathOrUrl;

  if (isHttpUrl(normalizedTarget)) {
    return await runtime.http.getText(normalizedTarget);
  }

  if (item.sourceMeta.type === "http" && item.sourceMeta.baseUrl) {
    const remoteUrl = joinUrl(item.sourceMeta.baseUrl, normalizedTarget);
    return await runtime.http.getText(remoteUrl);
  }

  const localPath =
    item.sourceMeta.baseDir && !path.isAbsolute(targetPathOrUrl)
      ? path.resolve(item.sourceMeta.baseDir, targetPathOrUrl)
      : path.resolve(cwd, targetPathOrUrl);

  return await runtime.fs.readFile(localPath, "utf8");
}
