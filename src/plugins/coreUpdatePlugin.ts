import { type PersistableVFS, type PipelineContext, type Plugin } from "@/core/pipeline.js";
import { type RuntimePorts } from "@/core/ports.js";
import { computeHash, writeLockfile } from "@/shell/services/lockfile.js";
import { type RegpickLockfile } from "@/types.js";
import { Effect } from "effect";
import path from "node:path";

type ApprovedUpdate = {
  itemName: string;
  files: {
    target: string;
    remoteContent: string;
  }[];
};

export function coreUpdatePlugin(
  approvedUpdates: ApprovedUpdate[],
  updatedLockfile: RegpickLockfile,
  runtime: RuntimePorts,
): Plugin {
  return {
    type: "pipeline",
    name: "regpick:core-update",
    async finish(ctx: PipelineContext) {
      if ("flushToDisk" in ctx.vfs) {
        await (ctx.vfs as PersistableVFS).flushToDisk();
      }

      for (const update of approvedUpdates) {
        const localFiles = [];
        for (const file of update.files) {
          const relativeTarget = path.relative(ctx.cwd, file.target);
          try {
            const localContent = await ctx.vfs.readFile(file.target, "utf-8");
            localFiles.push({
              path: relativeTarget,
              content: localContent.toString(),
            });
          } catch {
            localFiles.push({
              path: relativeTarget,
              content: file.remoteContent,
            });
          }
        }
        updatedLockfile.components[update.itemName] = {
          ...updatedLockfile.components[update.itemName],
          files: localFiles
            .map((file) => ({
              path: file.path,
              hash: computeHash(file.content),
            }))
            .sort((a, b) => a.path.localeCompare(b.path)),
        };
      }

      await Effect.runPromise(writeLockfile(ctx.cwd, updatedLockfile, runtime));
    },
  };
}
