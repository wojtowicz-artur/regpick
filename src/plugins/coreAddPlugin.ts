import { type PersistableVFS, type PipelineContext, type Plugin } from "@/core/pipeline.js";
import { installDependencies } from "@/shell/installer.js";
import { readLockfile, writeLockfile } from "@/shell/lockfile.js";
import { resolvePackageManager } from "@/shell/packageManagers/resolver.js";
import { type RuntimePorts } from "@/shell/runtime/ports.js";
import { type RegistryItem, type RegpickConfig } from "@/types.js";

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
): Plugin {
  return {
    name: "regpick:core-add",

    async finish(ctx: PipelineContext) {
      // 1. Install Dependencies first. If this fails, VFS will be rolled back by the orchestrator.
      const depsToInstall = [...dependencyPlan.dependencies, ...dependencyPlan.devDependencies];

      if (depsToInstall.length > 0) {
        const pmName = await resolvePackageManager(
          ctx.cwd,
          config.install?.packageManager || "auto",
          runtime,
          config,
        );

        const result = installDependencies(
          ctx.cwd,
          pmName,
          dependencyPlan.dependencies,
          dependencyPlan.devDependencies,
          runtime,
          config,
        );

        if (!result.ok) {
          throw new Error(`Failed to install dependencies: ${result.error.message}`);
        }
      }

      // 2. Flush the VFS buffer to the real disk
      if ("flushToDisk" in ctx.vfs) {
        await (ctx.vfs as PersistableVFS).flushToDisk();
      }

      // 3. Save Lockfile
      if (installedItemsInfo.length > 0) {
        const lockfile = await readLockfile(ctx.cwd, runtime);
        for (const item of installedItemsInfo) {
          if (!lockfile.components) lockfile.components = {};
          lockfile.components[item.name] = {
            source: item.sourceMeta?.originalSource ?? "unknown",
            hash: "pending", // Hash integration handled post-transform or left pending
          };
        }
        await writeLockfile(ctx.cwd, lockfile, runtime);
      }
    },
  };
}
