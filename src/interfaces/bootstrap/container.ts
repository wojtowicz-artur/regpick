import { Effect, Layer } from "effect";
import { AppError, PluginError } from "../../core/errors.js";

import { createNodeFileSystemLive } from "../fs/node.js";
import { FileSystemPort } from "../fs/port.js";
import { createFetchHttpLive } from "../http/fetch.js";
import { HttpPort } from "../http/port.js";
import { createClackPromptLive } from "../prompt/clack.js";
import { PromptPort } from "../prompt/port.js";

import { ExecPort } from "../../execution/exec/port.js";
import { createExecService } from "../../execution/exec/service.js";

import { LockfilePort } from "../../execution/lockfile/port.js";
import { LockfileService } from "../../execution/lockfile/service.js";

import { JournalPort } from "../../execution/journal/port.js";
import { JournalService } from "../../execution/journal/service.js";

import { VFSPort } from "../../execution/vfs/port.js";
import { RegistryPort } from "../../registry/port.js";
import { createRegistryService } from "../../registry/service.js";

import path from "node:path";
import { CommandContextTag, ConfigTag } from "../../core/context.js";
import { readConfig } from "../../shell/config/index.js";
import { loadPlugins } from "../../shell/plugins/loader.js";

// -- Mocks and Wrappers --
const createVFSLive = () =>
  Layer.effect(
    VFSPort,
    Effect.gen(function* () {
      const fs = yield* FileSystemPort;
      return VFSPort.of({
        transform: (files, plugins, ctx) =>
          Effect.gen(function* () {
            const transformedFiles = [];
            for (const file of files) {
              let currentCode = file.content;
              for (const plugin of plugins) {
                const res = plugin.transform(currentCode, file.id, ctx);
                if (res != null) {
                  const resolved =
                    typeof res === "string"
                      ? res
                      : yield* Effect.tryPromise({
                          try: () => Promise.resolve(res),
                          catch: () => new PluginError({ message: "error" }),
                        });
                  if (resolved != null) {
                    currentCode = resolved;
                  }
                }
              }
              transformedFiles.push({ ...file, content: currentCode });
            }
            return { mutations: transformedFiles, additionalDeps: [] } as any;
          }) as any,
        flush: (output, cwd) =>
          Effect.gen(function* () {
            for (const mutation of output.mutations) {
              const fullPath = path.resolve(cwd, mutation.id); // mutation.id can be relative or absolute
              yield* fs.ensureDir(path.dirname(fullPath));
              yield* fs.writeFile(fullPath, mutation.content, "utf-8");
            }
          }) as any,
      });
    }),
  );

const createLockfileServiceLive = () => Layer.succeed(LockfilePort, LockfileService);
const createJournalServiceLive = () => Layer.succeed(JournalPort, JournalService);

const loadAndResolvePlugins = (plugins: any[], cwd: string) => loadPlugins(plugins ?? [], cwd);

// interfaces/bootstrap/container.ts
// INV-01: JEDYNE miejsce Layer.* w całym projekcie

export const buildRootLayer = (options?: {
  signal?: AbortSignal;
  cwd?: string;
}): Layer.Layer<
  | FileSystemPort
  | HttpPort
  | RegistryPort
  | VFSPort
  | ExecPort
  | PromptPort
  | LockfilePort
  | JournalPort
  | ConfigTag,
  AppError,
  CommandContextTag
> => {
  // ── Infrastruktura bazowa ──────────────────────────────────────────────────
  const FileSystemLive = createNodeFileSystemLive();
  const HttpLive = createFetchHttpLive({ signal: options?.signal });
  const PromptLive = createClackPromptLive();

  const BaseLive = Layer.mergeAll(FileSystemLive, HttpLive, PromptLive);

  // ── Execution subsystem ───────────────────────────────────────────────────
  const VFSLive = createVFSLive().pipe(Layer.provideMerge(BaseLive));
  const LockfileLive = createLockfileServiceLive();
  const JournalLive = createJournalServiceLive();

  // ── Config ────────────────────────────────────────────────────────────────
  const ConfigLive = Layer.effect(
    ConfigTag,
    Effect.gen(function* () {
      const ctx = yield* CommandContextTag;
      const { config } = yield* readConfig(ctx.cwd);
      const resolvedPlugins = yield* loadAndResolvePlugins(config.plugins ?? [], ctx.cwd);
      return { ...config, plugins: resolvedPlugins } as any;
    }),
  ).pipe(Layer.provideMerge(BaseLive));

  const ExecLive = Layer.effect(
    ExecPort,
    Effect.gen(function* () {
      const ctx = yield* CommandContextTag;
      const config = yield* ConfigTag;
      return createExecService(ctx.cwd, config);
    }),
  ).pipe(Layer.provideMerge(ConfigLive));

  // ── Registry subsystem ────────────────────────────────────────────────────
  const RegistryLive = Layer.effect(
    RegistryPort,
    Effect.gen(function* () {
      const config = yield* Effect.serviceOption(ConfigTag);
      const plugins = config._tag === "Some" ? config.value.plugins || [] : [];
      return createRegistryService(plugins);
    }),
  ).pipe(Layer.provideMerge(Layer.mergeAll(BaseLive, ConfigLive)));

  return Layer.mergeAll(VFSLive, LockfileLive, JournalLive, RegistryLive, ExecLive);
};

export const container = buildRootLayer();
