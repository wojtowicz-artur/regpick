export interface VFS {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
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
}

export interface Plugin extends PluginHooks {
  name: string;
}

export class PipelineRenderer {
  private plugins: Plugin[] = [];

  constructor(plugins: Plugin[]) {
    this.plugins = plugins;
  }

  async run(ctx: PipelineContext, files: { id: string; code: string }[]): Promise<void> {
    // 1. Start Phase
    for (const plugin of this.plugins) {
      if (plugin.start) {
        await plugin.start(ctx);
      }
    }

    // 2. Resolve, Load & Transform Phase (Concurrent per file)
    await Promise.all(
      files.map(async (file) => {
        let currentId = file.id;
        let currentCode: string | null = file.code;

        // resolveId
        for (const plugin of this.plugins) {
          if (plugin.resolveId) {
            const resolved = await plugin.resolveId(currentId, undefined, ctx);
            if (resolved) {
              currentId = resolved;
              break; // Stop at first resolver that claims it
            }
          }
        }

        // load
        for (const plugin of this.plugins) {
          if (plugin.load) {
            const loaded = await plugin.load(currentId, ctx);
            if (loaded !== null && loaded !== undefined) {
              currentCode = loaded;
              break; // Stop at first loader that claims it
            }
          }
        }

        // transform
        if (currentCode !== null) {
          for (const plugin of this.plugins) {
            if (plugin.transform) {
              const transformed = await plugin.transform(currentCode, currentId, ctx);
              if (transformed !== null && transformed !== undefined) {
                currentCode = transformed;
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
        await plugin.finish(ctx);
      }
    }
  }
}
