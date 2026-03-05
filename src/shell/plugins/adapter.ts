import { appError } from "@/core/errors.js";
import type { EffectPipelinePlugin, PipelineContext } from "@/core/pipeline.js";
import type { RuntimePorts } from "@/core/ports.js";
import type { PipelinePlugin, PluginContext, StandardRuntimePorts } from "@/types.js";
import { Effect } from "effect";

export function createStandardRuntime(runtime: RuntimePorts): StandardRuntimePorts {
  return {
    fs: {
      existsSync: runtime.fs.existsSync,
      pathExists: (path: string) => Effect.runPromise(runtime.fs.pathExists(path)),
      ensureDir: (path: string) => Effect.runPromise(runtime.fs.ensureDir(path)),
      remove: (path: string) => Effect.runPromise(runtime.fs.remove(path)),
      writeFile: (path: string, content: string | Uint8Array, encoding?: BufferEncoding) =>
        Effect.runPromise(runtime.fs.writeFile(path, content, encoding)),
      readFile: (path: string, encoding?: BufferEncoding) =>
        Effect.runPromise(runtime.fs.readFile(path, encoding)),
      readJsonSync: <T = unknown>(path: string) =>
        Effect.runPromise(runtime.fs.readJsonSync<T>(path)),
      writeJson: (path: string, value: unknown, options?: { spaces?: number }) =>
        Effect.runPromise(runtime.fs.writeJson(path, value, options)),
      stat: (path: string) => Effect.runPromise(runtime.fs.stat(path)),
      readdir: (path: string) => Effect.runPromise(runtime.fs.readdir(path)),
    },
    http: {
      getJson: <T = unknown>(url: string, timeoutMs?: number) =>
        timeoutMs !== undefined
          ? Effect.runPromise(runtime.http.getJson<T>(url, timeoutMs))
          : Effect.runPromise(runtime.http.getJson<T>(url)),
      getText: (url: string, timeoutMs?: number) =>
        timeoutMs !== undefined
          ? Effect.runPromise(runtime.http.getText(url, timeoutMs))
          : Effect.runPromise(runtime.http.getText(url)),
    },
    prompt: {
      intro: (message: string) => Effect.runPromise(runtime.prompt.intro(message)),
      outro: (message: string) => Effect.runPromise(runtime.prompt.outro(message)),
      cancel: (message: string) => Effect.runPromise(runtime.prompt.cancel(message)),
      isCancel: (value: unknown) => Effect.runPromise(runtime.prompt.isCancel(value)),
      info: (message: string) => Effect.runPromise(runtime.prompt.info(message)),
      warn: (message: string) => Effect.runPromise(runtime.prompt.warn(message)),
      error: (message: string) => Effect.runPromise(runtime.prompt.error(message)),
      success: (message: string) => Effect.runPromise(runtime.prompt.success(message)),
      log: (message: string) => Effect.runPromise(runtime.prompt.log(message)),
      text: (options: any) => Effect.runPromise(runtime.prompt.text(options)),
      confirm: (options: any) => Effect.runPromise(runtime.prompt.confirm(options)),
      select: (options: any) => Effect.runPromise(runtime.prompt.select(options)),
      multiselect: (options: any) => Effect.runPromise(runtime.prompt.multiselect(options)),
      autocompleteMultiselect: (options: any) =>
        Effect.runPromise(runtime.prompt.autocompleteMultiselect(options)),
    },
    process: {
      run: runtime.process.run,
    },
  };
}

export function createStandardContext(ctx: { cwd: string; runtime: RuntimePorts }): PluginContext {
  const runtime = ctx.runtime;

  const standardRuntime: StandardRuntimePorts = createStandardRuntime(runtime);

  return {
    cwd: ctx.cwd,
    runtime: standardRuntime,
  };
}

export function createEffectPlugin(plugin: PipelinePlugin): EffectPipelinePlugin {
  return {
    type: "pipeline",
    name: plugin.name,
    ...(plugin.start && {
      start: (ctx: PipelineContext) =>
        Effect.tryPromise({
          try: () => Promise.resolve(plugin.start!(createStandardContext(ctx))),
          catch: (e) =>
            appError(
              "PluginError",
              `[${plugin.name}] Failed in start: ${e instanceof Error ? e.message : String(e)}`,
            ),
        }),
    }),
    ...(plugin.resolveId && {
      resolveId: (
        source: string,
        importer?: string | undefined,
        ctx?: PipelineContext | undefined,
      ) =>
        Effect.tryPromise({
          try: () =>
            Promise.resolve(
              plugin.resolveId!(source, importer, ctx ? createStandardContext(ctx) : undefined),
            ) as Promise<string | void | null>,
          catch: (e) =>
            appError(
              "PluginError",
              `[${plugin.name}] Failed in resolveId: ${e instanceof Error ? e.message : String(e)}`,
            ),
        }),
    }),
    ...(plugin.load && {
      load: (id: string, ctx?: PipelineContext | undefined) =>
        Effect.tryPromise({
          try: () =>
            Promise.resolve(
              plugin.load!(id, ctx ? createStandardContext(ctx) : undefined),
            ) as Promise<string | void | null>,
          catch: (e) =>
            appError(
              "PluginError",
              `[${plugin.name}] Failed in load: ${e instanceof Error ? e.message : String(e)}`,
            ),
        }),
    }),
    ...(plugin.transform && {
      transform: (code: string, id: string, ctx?: PipelineContext | undefined) =>
        Effect.tryPromise({
          try: () =>
            Promise.resolve(
              plugin.transform!(code, id, ctx ? createStandardContext(ctx) : undefined),
            ) as Promise<string | void | null>,
          catch: (e) =>
            appError(
              "PluginError",
              `[${plugin.name}] Failed in transform: ${e instanceof Error ? e.message : String(e)}`,
            ),
        }),
    }),
    ...(plugin.finish && {
      finish: (ctx: PipelineContext) =>
        Effect.tryPromise({
          try: () => Promise.resolve(plugin.finish!(createStandardContext(ctx))),
          catch: (e) =>
            appError(
              "PluginError",
              `[${plugin.name}] Failed in finish: ${e instanceof Error ? e.message : String(e)}`,
            ),
        }),
    }),
    ...(plugin.onError && {
      onError: (err: Error, ctx: PipelineContext) =>
        Effect.tryPromise({
          try: () => Promise.resolve(plugin.onError!(err, createStandardContext(ctx))),
          catch: (e) =>
            appError(
              "PluginError",
              `[${plugin.name}] Failed in onError: ${e instanceof Error ? e.message : String(e)}`,
            ),
        }),
    }),
  };
}
