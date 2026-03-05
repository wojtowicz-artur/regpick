import { CommandContextTag, ConfigTag } from "@/core/context.js";
import { toAppError, type AppError } from "@/core/errors.js";
import { JournalService } from "@/core/journal.js";
import { runPipeline, type PersistableVFS } from "@/core/pipeline.js";
import { FileSystemPort, HttpPort, ProcessPort, PromptPort } from "@/core/ports.js";
import type { ApprovedUpdatePlan } from "@/domain/updatePlan.js";
import { MemoryVFS } from "@/shell/adapters/vfs.js";
import {
  queryAvailableUpdates,
  queryUpdateState,
  queryUserUpdateApproval,
} from "@/shell/cli/updateOrchestrator.js";
import { DirectoryPlugin, FilePlugin, HttpPlugin, loadPlugins } from "@/shell/plugins/index.js";
import { computeHash, writeLockfile } from "@/shell/services/lockfile.js";
import type { CommandOutcome } from "@/types.js";
import { Effect } from "effect";
import crypto from "node:crypto";
import path from "node:path";

/**
 * Main controller for the `update` command effect loop.
 */
export function runUpdateCommand(): Effect.Effect<
  CommandOutcome,
  AppError,
  FileSystemPort | HttpPort | ProcessPort | PromptPort | CommandContextTag | JournalService
> {
  return Effect.gen(function* () {
    const state = yield* queryUpdateState();

    const logic = Effect.gen(function* () {
      const fs = yield* FileSystemPort;
      const http = yield* HttpPort;
      const process = yield* ProcessPort;
      const prompt = yield* PromptPort;
      const runtime = { fs, http, process, prompt };
      const context = yield* CommandContextTag;

      const componentNames = Object.keys(state.lockfile.components);
      if (componentNames.length === 0) {
        yield* runtime.prompt.info("No components installed. Nothing to update.");
        return {
          kind: "noop",
          message: "No components to update.",
        } as CommandOutcome;
      }

      const customPlugins = yield* loadPlugins((yield* ConfigTag).plugins || [], context.cwd).pipe(
        Effect.mapError(toAppError),
      );

      const plugins = [...customPlugins, HttpPlugin(), FilePlugin(), DirectoryPlugin()];

      const updates = yield* queryAvailableUpdates(state.lockfile, plugins);

      if (updates.length === 0) {
        return {
          kind: "noop",
          message: "All components are up to date.",
        } as CommandOutcome;
      }

      let approvedPlan: ApprovedUpdatePlan;

      if (context.args?.flags?.yes) {
        approvedPlan = { approvedUpdates: updates };
      } else {
        approvedPlan = yield* queryUserUpdateApproval(updates);
      }

      const approvedCount = approvedPlan.approvedUpdates.length;
      if (approvedCount === 0) {
        return {
          kind: "noop",
          message: "No updates approved.",
        } as CommandOutcome;
      }

      const updatedLockfile = JSON.parse(JSON.stringify(state.lockfile));
      const vfsFiles: { id: string; code: string }[] = [];

      yield* Effect.forEach(
        approvedPlan.approvedUpdates,
        (update) =>
          Effect.sync(() => {
            update.files.forEach((file) => {
              vfsFiles.push({
                id: file.target,
                code: file.remoteContent,
              });
            });
            updatedLockfile.components[update.itemName].installedAt = new Date().toISOString();
          }),
        { concurrency: "unbounded" },
      );

      const userPlugins = (yield* ConfigTag).plugins?.filter((p) => typeof p === "object") || [];
      const vfs = new MemoryVFS();

      const pipelinePlugins: import("../core/pipeline.js").Plugin[] = [
        ...(userPlugins as import("../core/pipeline.js").Plugin[]),
        {
          name: "regpick:core-update",
          async finish(ctx: import("../core/pipeline.js").PipelineContext) {
            if ("flushToDisk" in ctx.vfs) {
              await (ctx.vfs as PersistableVFS).flushToDisk();
            }

            for (const update of approvedPlan.approvedUpdates) {
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
              updatedLockfile.components[update.itemName].files = localFiles
                .map((file) => ({
                  path: file.path,
                  hash: computeHash(file.content),
                }))
                .sort((a, b) => a.path.localeCompare(b.path));
            }

            await Effect.runPromise(writeLockfile(ctx.cwd, updatedLockfile, runtime));
          },
        },
      ];

      const journal = yield* JournalService;
      const entry = {
        id: crypto.randomUUID(),
        command: "update" as const,
        status: "pending" as const,
        plannedFiles: vfsFiles.map((f) => f.id),
        lockfileBackup: state.lockfile,
      };

      yield* journal.writeIntent(entry, context.cwd);

      yield* runPipeline(
        { vfs, cwd: context.cwd, runtime: runtime },
        pipelinePlugins,
        vfsFiles,
      ).pipe(
        Effect.tapError(() => journal.clearIntent(context.cwd)),
        Effect.catchAll((error) => {
          vfs.rollback();
          return Effect.gen(function* () {
            yield* runtime.prompt.error(`[Failed] Update aborted: ${error.message}`);
            return yield* Effect.fail(error);
          });
        }),
        Effect.tap(() => journal.clearIntent(context.cwd)),
      );

      return {
        kind: "success",
        message: `Updated ${approvedCount} components.`,
      } as CommandOutcome;
    });

    return yield* Effect.provideService(logic, ConfigTag, state.config);
  });
}
