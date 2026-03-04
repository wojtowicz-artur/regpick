import { type PersistableVFS, type PipelineContext, type Plugin } from "@/core/pipeline.js";
import { installDependencies } from "@/shell/installer.js";
import { computeTreeHash, readLockfile, writeLockfile } from "@/shell/lockfile.js";
import { resolvePackageManager } from "@/shell/packageManagers/resolver.js";
import { type RuntimePorts } from "@/shell/runtime/ports.js";
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
      // 1. Install Dependencies first. If this fails, VFS will be rolled back by the orchestrator.
      const depsToInstall = [...dependencyPlan.dependencies, ...dependencyPlan.devDependencies];

      if (depsToInstall.length > 0) {
        const pmName = await Effect.runPromise(
          resolvePackageManager(ctx.cwd, config.install?.packageManager || "auto", runtime, config),
        );

        try {
          await Effect.runPromise(
            installDependencies(
              ctx.cwd,
              pmName,
              dependencyPlan.dependencies,
              dependencyPlan.devDependencies,
              runtime,
              config,
            ),
          );
        } catch (error) {
          throw new Error(`Failed to install dependencies: ${(error as any).message}`);
        }
      }

      // 2. Flush the VFS buffer to the real disk
      if ("flushToDisk" in ctx.vfs) {
        await (ctx.vfs as PersistableVFS).flushToDisk();
      }

      // 3. Save Lockfile
      if (installedItemsInfo.length > 0) {
        const lockfile = await Effect.runPromise(readLockfile(ctx.cwd, runtime));
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
              const localBuffer = await ctx.vfs.readFile(w.absoluteTarget, "utf-8");
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
        await Effect.runPromise(writeLockfile(ctx.cwd, lockfile, runtime));
      }
    },
  };
}
