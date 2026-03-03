import { appError } from "./errors.js";

export interface VFS {
  readFile(path: string, encoding?: "utf-8"): Promise<string | Uint8Array>;
  writeFile(path: string, content: string | Uint8Array): Promise<void>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
}

export interface PersistableVFS extends VFS {
  flushToDisk(): Promise<void>;
  rollback(): void;
}

export interface PipelineContext {
  vfs: VFS;
  cwd: string;
}

export interface PluginHooks {
  /**
   * Called before anything else. Initialize your plugin here.
   */
  start?(ctx: PipelineContext): Promise<void>;

  /**
   * Resolve an import path/alias to an absolute path.
   */
  resolveId?(
    source: string,
    importer?: string,
    ctx?: PipelineContext,
  ): Promise<string | null | void>;

  /**
   * Load the source code of a file before transformation.
   */
  load?(id: string, ctx?: PipelineContext): Promise<string | null | void>;

  /**
   * Transform the source code of a file.
   */
  transform?(code: string, id: string, ctx?: PipelineContext): Promise<string | null | void>;

  /**
   * End of the pipeline, perform any final cleanup or generation steps.
   */
  finish?(ctx: PipelineContext): Promise<void>;

  /**
   * Invoked if an error occurs anywhere in the pipeline.
   */
  onError?(error: Error, ctx: PipelineContext): Promise<void>;
}

export interface Plugin extends PluginHooks {
  name: string;
}

export class PipelineRenderer {
  private plugins: Plugin[] = [];

  constructor(plugins: Plugin[]) {
    this.plugins = plugins;
  }

  async run(
    ctx: PipelineContext,
    files: { id: string; code: string | Uint8Array }[],
  ): Promise<void> {
    try {
      // 1. Start Phase
      for (const plugin of this.plugins) {
        if (plugin.start) {
          try {
            await plugin.start(ctx);
          } catch (e: any) {
            throw appError(
              "RuntimeError",
              `[${plugin.name}] Failed during start hook: ${e.message}`,
            );
          }
        }
      }

      // 2. Resolve, Load & Transform Phase (Concurrent per file)
      await Promise.all(
        files.map(async (file) => {
          let currentId = file.id;
          let currentCode: string | Uint8Array | null = file.code;

          // resolveId
          for (const plugin of this.plugins) {
            if (plugin.resolveId) {
              try {
                const resolved = await plugin.resolveId(currentId, undefined, ctx);
                if (resolved) {
                  currentId = resolved;
                  break; // Stop at first resolver that claims it
                }
              } catch (e: any) {
                throw appError(
                  "RuntimeError",
                  `[${plugin.name}] Failed to resolveId for '${currentId}': ${e.message}`,
                );
              }
            }
          }

          // load
          for (const plugin of this.plugins) {
            if (plugin.load) {
              try {
                const loaded = await plugin.load(currentId, ctx);
                if (loaded !== null && loaded !== undefined) {
                  currentCode = loaded;
                  break; // Stop at first loader that claims it
                }
              } catch (e: any) {
                throw appError(
                  "RuntimeError",
                  `[${plugin.name}] Failed to load '${currentId}': ${e.message}`,
                );
              }
            }
          }

          // transform
          if (currentCode !== null) {
            if (typeof currentCode === "string") {
              for (const plugin of this.plugins) {
                if (plugin.transform) {
                  try {
                    const transformed = await plugin.transform(currentCode, currentId, ctx);
                    if (transformed !== null && transformed !== undefined) {
                      currentCode = transformed;
                    }
                  } catch (e: any) {
                    throw appError(
                      "RuntimeError",
                      `[${plugin.name}] Failed to transform '${currentId}': ${e.message}`,
                    );
                  }
                }
              }
            }

            // write result to VFS
            await ctx.vfs.writeFile(currentId, currentCode);
          }
        }),
      );

      // 3. Finish Phase
      for (const plugin of this.plugins) {
        if (plugin.finish) {
          try {
            await plugin.finish(ctx);
          } catch (e: any) {
            throw appError(
              "RuntimeError",
              `[${plugin.name}] Failed during finish hook: ${e.message}`,
            );
          }
        }
      }
    } catch (error: any) {
      // 4. Error Hook On Failure
      for (const plugin of this.plugins) {
        if (plugin.onError) {
          try {
            await plugin.onError(error, ctx);
          } catch (err) {
            // Ignore nested errors during cleanup
          }
        }
      }
      throw error;
    }
  }
}
