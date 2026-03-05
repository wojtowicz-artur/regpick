import { appError } from "@/core/errors.js";
import {
  type EffectPipelinePlugin,
  type PersistableVFS,
  type PipelineContext,
} from "@/core/pipeline.js";
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
): EffectPipelinePlugin {
  return {
    type: "pipeline",
    name: "regpick:core-update",
    finish: (ctx: PipelineContext) =>
      Effect.gen(function* () {
        if ("flushToDisk" in ctx.vfs) {
          yield* Effect.tryPromise({
            try: () => (ctx.vfs as PersistableVFS).flushToDisk(),
            catch: (e) =>
              appError(
                "VfsError",
                `Failed to flush to disk: ${e instanceof Error ? e.message : String(e)}`,
              ),
          });
        }

        for (const update of approvedUpdates) {
          const localFiles = [];
          for (const file of update.files) {
            const relativeTarget = path.relative(ctx.cwd, file.target);
            const localContent = yield* Effect.tryPromise({
              try: () => ctx.vfs.readFile(file.target, "utf-8"),
              catch: () => false,
            }).pipe(Effect.catchAll(() => Effect.succeed(null)));

            if (localContent !== null) {
              localFiles.push({
                path: relativeTarget,
                content: localContent.toString(),
              });
            } else {
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

        yield* writeLockfile(ctx.cwd, updatedLockfile, runtime).pipe(
          Effect.mapError((e) =>
            appError("FileSystemError", `Failed to write lockfile: ${e.message}`),
          ),
        );
      }),
  };
}
