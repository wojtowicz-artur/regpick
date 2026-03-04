import { Effect } from "effect";
import type { RuntimePorts } from "../shell/runtime/ports.js";
import { appError, type AppError } from "./errors.js";

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

export class PipelineRenderer {
  private plugins: Plugin[] = [];

  constructor(plugins: Plugin[]) {
    this.plugins = plugins;
  }

  run(
    ctx: PipelineContext,
    files: { id: string; code: string | Uint8Array }[],
  ): Effect.Effect<void, AppError> {
    const effect = Effect.gen(this, function* () {
      // 1. Start Phase
      for (const plugin of this.plugins) {
        if (plugin.start) {
          yield* Effect.tryPromise({
            try: () => plugin.start!(ctx),
            catch: (e) =>
              appError(
                "RuntimeError",
                `[${plugin.name}] Failed during start hook: ${e instanceof Error ? e.message : String(e)}`,
              ),
          });
        }
      }

      // 2. Resolve Phase
      const resolvedFiles = yield* Effect.forEach(
        files,
        (file) =>
          Effect.gen(this, function* () {
            let currentId = file.id;
            for (const plugin of this.plugins) {
              if (plugin.resolveId) {
                const resolved = yield* Effect.tryPromise({
                  try: () => plugin.resolveId!(currentId, undefined, ctx),
                  catch: (e) =>
                    appError(
                      "RuntimeError",
                      `[${plugin.name}] Failed to resolveId for '${currentId}': ${e instanceof Error ? e.message : String(e)}`,
                    ),
                });
                if (resolved) {
                  currentId = resolved;
                  break;
                }
              }
            }
            return { file, currentId };
          }),
        { concurrency: "unbounded" },
      );

      const groups = new Map<string, typeof resolvedFiles>();
      for (const rf of resolvedFiles) {
        if (!groups.has(rf.currentId)) groups.set(rf.currentId, []);
        groups.get(rf.currentId)!.push(rf);
      }

      // Load & Transform Phase (Concurrent mapping between groups, synchronized per Target ID)
      yield* Effect.forEach(
        groups.values(),
        (group) =>
          Effect.gen(this, function* () {
            for (const rf of group) {
              let currentCode: string | Uint8Array | null = rf.file.code;
              const currentId = rf.currentId;

              // load
              for (const plugin of this.plugins) {
                if (plugin.load) {
                  const loaded = yield* Effect.tryPromise({
                    try: () => plugin.load!(currentId, ctx),
                    catch: (e) =>
                      appError(
                        "RuntimeError",
                        `[${plugin.name}] Failed to load '${currentId}': ${e instanceof Error ? e.message : String(e)}`,
                      ),
                  });
                  if (loaded !== null && loaded !== undefined) {
                    currentCode = loaded;
                    break;
                  }
                }
              }

              // transform
              if (currentCode !== null) {
                if (typeof currentCode === "string") {
                  for (const plugin of this.plugins) {
                    if (plugin.transform) {
                      const transformed = yield* Effect.tryPromise({
                        try: () => plugin.transform!(currentCode as string, currentId, ctx),
                        catch: (e) =>
                          appError(
                            "RuntimeError",
                            `[${plugin.name}] Failed to transform '${currentId}': ${e instanceof Error ? e.message : String(e)}`,
                          ),
                      });
                      if (transformed !== null && transformed !== undefined) {
                        currentCode = transformed;
                      }
                    }
                  }
                }
                yield* Effect.tryPromise({
                  try: () => ctx.vfs.writeFile(currentId, currentCode!),
                  catch: (e) =>
                    appError(
                      "RuntimeError",
                      `Failed to write ${currentId}: ${e instanceof Error ? e.message : String(e)}`,
                    ),
                });
              }
            }
          }),
        { concurrency: "unbounded" },
      );

      // 3. Finish Phase
      for (const plugin of this.plugins) {
        if (plugin.finish) {
          yield* Effect.tryPromise({
            try: () => plugin.finish!(ctx),
            catch: (e) =>
              appError(
                "RuntimeError",
                `[${plugin.name}] Failed during finish hook: ${e instanceof Error ? e.message : String(e)}`,
              ),
          });
        }
      }
    }).pipe(
      Effect.catchAll((err) =>
        Effect.gen(this, function* () {
          for (const plugin of this.plugins) {
            if (plugin.onError) {
              yield* Effect.tryPromise({
                try: () => plugin.onError!(err as Error, ctx),
                catch: () => {}, // Ignore nested errors during cleanup
              }).pipe(Effect.ignore);
            }
          }
          return yield* Effect.fail(err);
        }),
      ),
    );

    return effect as unknown as Effect.Effect<void, AppError>;
  }
}
