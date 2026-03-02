import path from "node:path";
import { fileURLToPath } from "node:url";

import { appError, type AppError } from "@/core/errors.js";
import { err, ok, type Result } from "@/core/result.js";
import type { RuntimePorts } from "@/shell/runtime/ports.js";
import type { RegistryFile, RegistryItem, RegistrySourceMeta } from "@/types.js";
import * as v from "valibot";
import type {
  RegistryAdapter,
  RegistryAdapterManifestResult,
  RegistryAdapterMatchContext,
} from "./types.js";

const FileAdapterStateSchema = v.object({
  baseDir: v.string(),
});

function isFileUrl(value: string): boolean {
  return /^file:\/\//i.test(value);
}

export class FileAdapter implements RegistryAdapter {
  name = "file";

  match(ctx: RegistryAdapterMatchContext): boolean {
    // Only act as a fallback file reader or if explicit file URL
    return isFileUrl(ctx.source) || ctx.source.endsWith(".json");
  }

  async resolveManifest(
    ctx: RegistryAdapterMatchContext,
    runtime: RuntimePorts,
  ): Promise<Result<RegistryAdapterManifestResult, AppError>> {
    const fileSystemPath = isFileUrl(ctx.source)
      ? fileURLToPath(new URL(ctx.source))
      : path.resolve(ctx.cwd, ctx.source);

    const statsRes = await runtime.fs.stat(fileSystemPath);
    if (!statsRes.ok) {
      return err(appError("RegistryError", `Registry source not found: ${ctx.source}`));
    }

    // Defer to DirectoryAdapter in case it actually matches a directory
    if (statsRes.value.isDirectory()) {
      return err(appError("RegistryError", `Source is a directory, not a file.`));
    }

    const readRes = await runtime.fs.readFile(fileSystemPath, "utf8");
    if (!readRes.ok) return err(readRes.error);

    let parsed: unknown;
    try {
      parsed = JSON.parse(readRes.value);
    } catch (cause) {
      return err(appError("RegistryError", "Failed to parse registry JSON.", cause));
    }

    return ok({
      sourceMeta: {
        type: "file",
        adapterState: { baseDir: path.dirname(fileSystemPath) },
      },
      rawData: parsed,
      resolvedSource: fileSystemPath,
    });
  }

  async resolveItemReference(
    reference: string,
    sourceMeta: RegistrySourceMeta,
    runtime: RuntimePorts,
  ): Promise<Result<unknown, AppError>> {
    let targetPath = reference;
    if (sourceMeta.type === "file") {
      const parsedState = v.safeParse(FileAdapterStateSchema, sourceMeta.adapterState);
      if (parsedState.success) {
        targetPath = path.resolve(parsedState.output.baseDir, reference);
      } else {
        targetPath = path.resolve(reference);
      }
    } else {
      targetPath = path.resolve(reference);
    }

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

    let localPath = path.resolve(cwd, targetPathOrUrl);
    if (!path.isAbsolute(targetPathOrUrl)) {
      const parsedState = v.safeParse(FileAdapterStateSchema, item.sourceMeta.adapterState);
      if (parsedState.success) {
        localPath = path.resolve(parsedState.output.baseDir, targetPathOrUrl);
      }
    }

    return runtime.fs.readFile(localPath, "utf8");
  }
}
