import type { RuntimePorts } from "../shell/runtime/ports.js";
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
  runtime: RuntimePorts;
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

/**
 * A simple lock mechanism to ensure operations on the same target ID
 * do not run concurrently, eliminating race conditions while allowing
 * other IDs to be processed in parallel.
 */
class KeyedMutex {
  private locks = new Map<string, Promise<void>>();

  async runExclusive<T>(key: string, task: () => Promise<T>): Promise<T> {
    const currentLock = this.locks.get(key) || Promise.resolve();

    let release!: () => void;
    const nextLock = new Promise<void>((resolve) => {
      release = resolve;
    });

    this.locks.set(
      key,
      currentLock.finally(() => nextLock),
    );

    try {
      await currentLock;
    } catch {
      // safe to ignore previous task rejection here
    }

    try {
      return await task();
    } finally {
      release();
      if (this.locks.get(key) === nextLock) {
        this.locks.delete(key);
      }
    }
  }
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
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            throw appError("RuntimeError", `[${plugin.name}] Failed during start hook: ${msg}`);
          }
        }
      }

      // 2. Resolve, Load & Transform Phase (Concurrent mapping, synchronized per Target ID)
      const fileMutex = new KeyedMutex();

      await Promise.all(
        files.map(async (file) => {
          let currentId = file.id;
          let currentCode: string | Uint8Array | null = file.code;

          // resolveId (Wait-free execution)
          for (const plugin of this.plugins) {
            if (plugin.resolveId) {
              try {
                const resolved = await plugin.resolveId(currentId, undefined, ctx);
                if (resolved) {
                  currentId = resolved;
                  break; // Stop at first resolver that claims it
                }
              } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                throw appError(
                  "RuntimeError",
                  `[${plugin.name}] Failed to resolveId for '${currentId}': ${msg}`,
                );
              }
            }
          }

          // Lock modifications and assertions to strictly this `currentId`
          await fileMutex.runExclusive(currentId, async () => {
            // load
            for (const plugin of this.plugins) {
              if (plugin.load) {
                try {
                  const loaded = await plugin.load(currentId, ctx);
                  if (loaded !== null && loaded !== undefined) {
                    currentCode = loaded;
                    break; // Stop at first loader that claims it
                  }
                } catch (e: unknown) {
                  const msg = e instanceof Error ? e.message : String(e);
                  throw appError(
                    "RuntimeError",
                    `[${plugin.name}] Failed to load '${currentId}': ${msg}`,
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
                    } catch (e: unknown) {
                      const msg = e instanceof Error ? e.message : String(e);
                      throw appError(
                        "RuntimeError",
                        `[${plugin.name}] Failed to transform '${currentId}': ${msg}`,
                      );
                    }
                  }
                }
              }

              // write result to VFS
              await ctx.vfs.writeFile(currentId, currentCode);
            }
          });
        }),
      );

      // 3. Finish Phase
      for (const plugin of this.plugins) {
        if (plugin.finish) {
          try {
            await plugin.finish(ctx);
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            throw appError("RuntimeError", `[${plugin.name}] Failed during finish hook: ${msg}`);
          }
        }
      }
    } catch (error: unknown) {
      // 4. Error Hook On Failure
      const actualError = error instanceof Error ? error : new Error(String(error));
      for (const plugin of this.plugins) {
        if (plugin.onError) {
          try {
            await plugin.onError(actualError, ctx);
          } catch {
            // Ignore nested errors during cleanup
          }
        }
      }
      throw error;
    }
  }
}
