import type { ResolvedRegpickConfig } from "@/domain/configModel.js";

export interface TransformContext {
  cwd: string;
  config: ResolvedRegpickConfig;
  meta?: Record<string, unknown>;
}

export interface TransformPlugin {
  readonly type: "transform";
  readonly name: string;
  transform(
    code: string,
    fileId: string,
    ctx: TransformContext,
  ): string | null | Promise<string | null>;
}
