import { type PersistableVFS, type PipelineContext, type Plugin } from "@/core/pipeline.js";
import { installDependencies } from "@/shell/services/installer.js";
import { computeTreeHash, readLockfile, writeLockfile } from "@/shell/services/lockfile.js";
import { resolvePackageManager } from "@/shell/packageManagers/resolver.js";
import { type RuntimePorts } from "@/core/ports.js";
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
): Plugin {
  return {
    name: "regpick:core-add",

    async finish(ctx: PipelineContext) {
      await Effect.runPromise(
        Effect.gen(function* () {
          // 1. Flush the VFS buffer to the real disk first (Fast / Local I/O)
          if ("flushToDisk" in ctx.vfs) {
            yield* Effect.tryPromise({
              try: () => (ctx.vfs as PersistableVFS).flushToDisk(),
              catch: (e) =>
                new Error(`Failed to flush VFS: ${e instanceof Error ? e.message : String(e)}`),
            });
          }

          // 2. Save Lockfile (Local I/O)
          // Doing this before dependencies installation ensures that if a network failure occurs,
          // the tool states that the component is installed, making repeated 'add' attempts idempotent
          // or at least leaving the system in a state where a generic 'npm install' fixes the gap.
          if (installedItemsInfo.length > 0) {
            const lockfile = yield* readLockfile(ctx.cwd, runtime);
            for (const item of installedItemsInfo) {
              if (!lockfile.components) lockfile.components = {};

              const itemWrites = hydratedWrites.filter((w) => w.itemName === item.name);

              const remoteFiles = itemWrites.map((w) => ({
                path: w.relativeTarget,
                content: w.originalContent,
              }));
              const remoteHash = computeTreeHash(remoteFiles);

              const localFiles = [];
              for (const w of itemWrites) {
                try {
                  // Re-read file synchronously locally using Effect approach (in actual Effect context readFileSync)
                  // But since vfs.readFile is async, we yield.
                  const localBuffer = yield* Effect.promise(() =>
                    ctx.vfs.readFile(w.absoluteTarget, "utf-8"),
                  );
                  localFiles.push({
                    path: w.relativeTarget,
                    content: localBuffer.toString(),
                  });
                } catch {
                  localFiles.push({
                    path: w.relativeTarget,
                    content: w.originalContent,
                  });
                }
              }
              const localHash = computeTreeHash(localFiles);

              lockfile.components[item.name] = {
                source: item.sourceMeta?.originalSource ?? "unknown",
                remoteHash,
                localHash,
              };
            }
            yield* writeLockfile(ctx.cwd, lockfile, runtime).pipe(
              Effect.mapError((e) => new Error(`Failed to write lockfile: ${e.message}`)),
            );
          }

          // 3. Install Dependencies (Slow / Network / High failure rate)
          // If this fails, the files are already on disk and lockfile is updated,
          // meaning the user's codebase is intact and they just have to run `npm i`.
          const depsToInstall = [...dependencyPlan.dependencies, ...dependencyPlan.devDependencies];

          if (depsToInstall.length > 0) {
            const pmName = yield* resolvePackageManager(
              ctx.cwd,
              config.install?.packageManager || "auto",
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
              Effect.catchAll((err) =>
                Effect.fail(new Error(`Failed to install dependencies: ${err.message}`)),
              ),
            );
          }
        }),
      );
    },
  };
}
