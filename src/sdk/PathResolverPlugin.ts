import type { ResolvedRegpickConfig } from "../domain/models/index.js";

export interface PathResolverPlugin {
  readonly type: "path-resolver";
  readonly name: string;
  resolve(
    file: { path?: string; type?: string },
    item: { type: string; name: string },
    defaultPath: string,
    config: ResolvedRegpickConfig,
  ): string | null | undefined;
}
