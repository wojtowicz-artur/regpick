import type { AppError } from "@/core/errors.js";
import type { Result } from "@/core/result.js";
import type { RuntimePorts } from "@/shell/runtime/ports.js";
import type { RegistryFile, RegistryItem, RegistrySourceMeta } from "@/types.js";

export interface RegistryAdapterMatchContext {
  source: string;
  cwd: string;
}

export interface RegistryAdapterManifestResult {
  sourceMeta: RegistrySourceMeta;
  rawData?: unknown;
  items?: RegistryItem[];
  resolvedSource?: string;
}

export interface RegistryAdapter {
  name: string;

  /**
   * Check if this adapter can handle the given source.
   */
  match(ctx: RegistryAdapterMatchContext): boolean;

  /**
   * Resolve the main manifest payload for a source.
   * Can either return raw JSON payload (which the core will parse),
   * or a pre-resolved array of RegistryItems (omitting default validation).
   */
  resolveManifest(
    ctx: RegistryAdapterMatchContext,
    runtime: RuntimePorts,
  ): Promise<Result<RegistryAdapterManifestResult, AppError>>;

  /**
   * Resolve an external reference payload.
   */
  resolveItemReference(
    reference: string,
    sourceMeta: RegistrySourceMeta,
    runtime: RuntimePorts,
  ): Promise<Result<unknown, AppError>>;

  /**
   * Resolve the string content of a file.
   */
  resolveFile(
    file: RegistryFile,
    item: RegistryItem,
    cwd: string,
    runtime: RuntimePorts,
  ): Promise<Result<string, AppError>>;
}
