import { appError, type AppError } from "@/core/errors.js";
import { err, ok, type Result } from "@/core/result.js";
import type { RuntimePorts } from "@/shell/runtime/ports.js";
import type { RegistryFile, RegistryItem, RegistrySourceMeta } from "@/types.js";
import type {
  RegistryAdapter,
  RegistryAdapterManifestResult,
  RegistryAdapterMatchContext,
} from "./types.js";

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function normalizeGitHubUrl(url: string): string {
  if (!url.includes("github.com")) return url;
  return url
    .replace(/^https?:\/\/github\.com\//, "https://raw.githubusercontent.com/")
    .replace(/\/(blob|tree)\//, "/");
}

function joinUrl(baseUrl: string, relativePath: string): string {
  return new URL(relativePath, baseUrl).toString();
}

export class HttpAdapter implements RegistryAdapter {
  name = "http";

  match(ctx: RegistryAdapterMatchContext): boolean {
    return isHttpUrl(ctx.source);
  }

  async resolveManifest(
    ctx: RegistryAdapterMatchContext,
    runtime: RuntimePorts,
  ): Promise<Result<RegistryAdapterManifestResult, AppError>> {
    const resolved = normalizeGitHubUrl(ctx.source);
    const dataRes = await runtime.http.getJson(resolved);
    if (!dataRes.ok) return err(dataRes.error);

    const baseUrl = resolved.endsWith("/") ? resolved : resolved.replace(/[^/]*$/, "");
    return ok({
      sourceMeta: { type: "http", baseUrl },
      rawData: dataRes.value,
      resolvedSource: resolved,
    });
  }

  async resolveItemReference(
    reference: string,
    sourceMeta: RegistrySourceMeta,
    runtime: RuntimePorts,
  ): Promise<Result<unknown, AppError>> {
    if (isHttpUrl(reference)) {
      return runtime.http.getJson(reference);
    }
    if (sourceMeta.type === "http" && sourceMeta.baseUrl) {
      const fullUrl = joinUrl(sourceMeta.baseUrl, reference);
      return runtime.http.getJson(fullUrl);
    }
    return err(appError("RegistryError", `Cannot resolve HTTP reference: ${reference}`));
  }

  async resolveFile(
    file: RegistryFile,
    item: RegistryItem,
    _cwd: string,
    runtime: RuntimePorts,
  ): Promise<Result<string, AppError>> {
    const targetPathOrUrl = file.url || file.path;
    if (!targetPathOrUrl) {
      return err(appError("ValidationError", `File entry in "${item.name}" missing path/url.`));
    }

    const normalizedTarget = isHttpUrl(targetPathOrUrl)
      ? normalizeGitHubUrl(targetPathOrUrl)
      : targetPathOrUrl;

    if (isHttpUrl(normalizedTarget)) {
      return runtime.http.getText(normalizedTarget);
    }

    if (item.sourceMeta.type === "http" && item.sourceMeta.baseUrl) {
      const remoteUrl = joinUrl(item.sourceMeta.baseUrl, normalizedTarget);
      return runtime.http.getText(remoteUrl);
    }

    return err(appError("RegistryError", `Cannot resolve remote file: ${normalizedTarget}`));
  }
}
