import { Effect } from "effect";
import { PluginError } from "../../core/errors.js";
import type { TransformContext, TransformPlugin } from "../../sdk/TransformPlugin.js";
import type { VFSFile as PortVFSFile, VFSOutput } from "./port.js";

// Minimal definition of the VFS Engine Port
// Handles all high-level virtual file system routines for memory and real disk.
export interface VFSFile {
  path: string;
  content: string;
}

export interface VFSEnginePort {
  readFile: (path: string) => Effect.Effect<VFSFile, Error, never>;
  writeFile: (file: VFSFile) => Effect.Effect<void, Error, never>;
  exists: (path: string) => Effect.Effect<boolean, never, never>;
  commitToDisk: () => Effect.Effect<void, Error, never>;
  normalizePath: (path: string) => string;
}

export interface VFSEngineInput {
  files: PortVFSFile[];
  plugins: TransformPlugin[];
  ctx: TransformContext;
}

export const runVFSEngine = (input: VFSEngineInput): Effect.Effect<VFSOutput, PluginError> =>
  Effect.gen(function* () {
    const transformedFiles: PortVFSFile[] = [];
    for (const file of input.files) {
      let currentCode = file.content;
      for (const plugin of input.plugins) {
        const res = plugin.transform(currentCode, file.id, input.ctx);
        if (res != null) {
          const resolved =
            typeof res === "string"
              ? res
              : yield* Effect.tryPromise({
                  try: () => Promise.resolve(res),
                  catch: (e) =>
                    new PluginError({
                      message: `Plugin ${plugin.name} transform failed: ${String(e)}`,
                    }),
                });
          if (resolved != null) {
            currentCode = resolved;
          }
        }
      }
      transformedFiles.push({ ...file, content: currentCode });
    }
    return { mutations: transformedFiles, additionalDeps: [] };
  });
