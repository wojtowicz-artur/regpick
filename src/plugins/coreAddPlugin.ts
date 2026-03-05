import { appError } from "@/core/errors.js";
import {
  type EffectPipelinePlugin,
  type PersistableVFS,
  type PipelineContext,
} from "@/core/pipeline.js";
import { type RuntimePorts } from "@/core/ports.js";
import { resolvePackageManager } from "@/shell/packageManagers/resolver.js";
import { installDependencies } from "@/shell/services/installer.js";
import { computeHash, readLockfile, writeLockfile } from "@/shell/services/lockfile.js";
import { type RegistryFile, type RegistryItem, type RegpickConfig } from "@/types.js";
import { Effect } from "effect";

type HydratedWriteInfo = {
  itemName: string;
  absoluteTarget: string;
  relativeTarget: string;
  sourceFile: RegistryFile;
  originalContent: string;
  finalContent: string;
};

/**
 * Core Plugin that bridges the gap between the `InstallPlan` resulting from
 * `addPlan.ts` and the new VFS pipeline.
 *
 * It acts like Vite/Rollup's core file loader plugin. Instead of a hardcoded Saga,
 * this fetches remote contents into the system and triggers `transform` before writing to `vfs`.
 */
export function coreAddPlugin(
  dependencyPlan: { dependencies: string[]; devDependencies: string[] },
  config: RegpickConfig,
  runtime: RuntimePorts,
  installedItemsInfo: RegistryItem[] = [],
  hydratedWrites: HydratedWriteInfo[] = [],
  initialLockfile?: import("@/types.js").RegpickLockfile,
): EffectPipelinePlugin {
  return {
    type: "pipeline",
    name: "regpick:core-add",

    finish: (ctx: PipelineContext) =>
      Effect.gen(function* () {
        // 1. Flush the VFS buffer to the real disk first (Fast / Local I/O)
        if ("flushToDisk" in ctx.vfs) {
          yield* Effect.tryPromise({
            try: () => (ctx.vfs as PersistableVFS).flushToDisk(),
            catch: (e) =>
              appError(
                "VfsError",
                `Failed to flush VFS: ${e instanceof Error ? e.message : String(e)}`,
              ),
          });
        }

        // 2. Save Lockfile (Local I/O)
        if (installedItemsInfo.length > 0) {
          const lockfile = initialLockfile || (yield* readLockfile(ctx.cwd, runtime));
          for (const item of installedItemsInfo) {
            if (!lockfile.components) lockfile.components = {};

            const itemWrites = hydratedWrites.filter((w) => w.itemName === item.name);

            const localFiles = [];
            for (const w of itemWrites) {
              const readResult = yield* Effect.tryPromise({
                try: () => ctx.vfs.readFile(w.absoluteTarget, "utf-8"),
                catch: () => false,
              }).pipe(Effect.catchAll(() => Effect.succeed(null)));

              if (readResult !== null) {
                localFiles.push({
                  path: w.relativeTarget,
                  content: readResult.toString(),
                });
              } else {
                localFiles.push({
                  path: w.relativeTarget,
                  content: w.originalContent,
                });
              }
            }

            const files = localFiles.map((file) => ({
              path: file.path,
              hash: computeHash(file.content),
            }));

            lockfile.components[item.name] = {
              source: item.sourceMeta?.originalSource ?? "unknown",
              version: "version" in item ? String((item as any).version) : undefined,
              installedAt: new Date().toISOString(),
              dependencies: item.dependencies ?? [],
              files: files.sort((a, b) => a.path.localeCompare(b.path)),
            };
          }
          yield* writeLockfile(ctx.cwd, lockfile, runtime).pipe(
            Effect.mapError((e) =>
              appError("FileSystemError", `Failed to write lockfile: ${e.message}`),
            ),
          );
        }

        // 3. Install Dependencies (Slow / Network / High failure rate)
        const depsToInstall = [...dependencyPlan.dependencies, ...dependencyPlan.devDependencies];

        if (depsToInstall.length > 0) {
          const pmName = yield* resolvePackageManager(
            ctx.cwd,
            config.install.packageManager,
            runtime,
            config,
          );

          yield* installDependencies(
            ctx.cwd,
            pmName,
            dependencyPlan.dependencies,
            dependencyPlan.devDependencies,
            runtime,
            config,
          ).pipe(
            Effect.mapError((err) =>
              appError("InstallError", `Failed to install dependencies: ${err.message}`),
            ),
          );
        }
      }),
  };
}
