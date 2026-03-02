import { appError, type AppError } from "@/core/errors.js";
import { err, ok, type Result } from "@/core/result.js";
import { normalizeItem } from "@/domain/registryModel.js";
import type { RuntimePorts } from "@/shell/runtime/ports.js";
import type { RegistryFile, RegistryItem, RegistrySourceMeta } from "@/types.js";
import path from "node:path";
import type {
  RegistryAdapter,
  RegistryAdapterManifestResult,
  RegistryAdapterMatchContext,
} from "./types.js";

export class DirectoryAdapter implements RegistryAdapter {
  name = "directory";

  match(_ctx: RegistryAdapterMatchContext): boolean {
    return true; // We use this as a catch-all if HTTP/File fail logic fallback, or we check stats inside.
  }

  async resolveManifest(
    ctx: RegistryAdapterMatchContext,
    runtime: RuntimePorts,
  ): Promise<Result<RegistryAdapterManifestResult, AppError>> {
    const fileSystemPath = path.resolve(ctx.cwd, ctx.source);

    const statsRes = await runtime.fs.stat(fileSystemPath);
    if (!statsRes.ok || !statsRes.value.isDirectory()) {
      return err(appError("RegistryError", `Source is not a directory: ${ctx.source}`));
    }

    const absoluteDir = fileSystemPath;
    const dirRes = await runtime.fs.readdir(absoluteDir);
    if (!dirRes.ok) return err(dirRes.error);

    const files = dirRes.value;
    const jsonFiles = files.filter((file) => file.endsWith(".json"));

    const sourceMeta: RegistrySourceMeta = { type: "directory", baseDir: absoluteDir };

    const fileResults = await Promise.all(
      jsonFiles.map(async (fileName) => {
        const fullPath = path.join(absoluteDir, fileName);
        const readRes = await runtime.fs.readFile(fullPath, "utf8");
        if (!readRes.ok) return readRes;

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
          !Array.isArray((parsed as any).files)
        ) {
          return ok(null);
        }

        return ok(normalizeItem(parsed, sourceMeta));
      }),
    );

    const items: RegistryItem[] = [];
    for (const res of fileResults) {
      if (!res.ok) return err(res.error);
      if (res.value) items.push(res.value);
    }

    return ok({
      sourceMeta,
      items,
      resolvedSource: fileSystemPath,
    });
  }

  async resolveItemReference(
    reference: string,
    sourceMeta: RegistrySourceMeta,
    runtime: RuntimePorts,
  ): Promise<Result<unknown, AppError>> {
    const targetPath = sourceMeta.baseDir
      ? path.resolve(sourceMeta.baseDir, reference)
      : path.resolve(reference);

    const res = await runtime.fs.readFile(targetPath, "utf8");
    if (!res.ok) return err(res.error);
    try {
      return ok(JSON.parse(res.value));
    } catch {
      return err(appError("RegistryError", `Invalid JSON: ${targetPath}`));
    }
  }

  async resolveFile(
    file: RegistryFile,
    item: RegistryItem,
    cwd: string,
    runtime: RuntimePorts,
  ): Promise<Result<string, AppError>> {
    const targetPathOrUrl = file.url || file.path;
    if (!targetPathOrUrl) {
      return err(appError("ValidationError", `File entry in "${item.name}" missing path/url.`));
    }

    const localPath =
      item.sourceMeta.baseDir && !path.isAbsolute(targetPathOrUrl)
        ? path.resolve(item.sourceMeta.baseDir, targetPathOrUrl)
        : path.resolve(cwd, targetPathOrUrl);

    return runtime.fs.readFile(localPath, "utf8");
  }
}
