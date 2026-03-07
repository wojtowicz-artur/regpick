import type { ResolvedRegpickConfig } from "../domain/models/index.js";

export interface TransformContext {
  cwd: string;
  config: ResolvedRegpickConfig;
  meta?: Record<string, unknown>;
}

export interface TransformPlugin {
  readonly type: "transform";
  readonly name: string;
  /**
   * Promise<> dozwolony tylko dla operacji CPU (np. parsowanie AST).
   * ZAKAZ I/O. INV-04
   */
  transform(
    code: string,
    fileId: string,
    ctx: TransformContext,
  ): string | null | Promise<string | null>;
}
