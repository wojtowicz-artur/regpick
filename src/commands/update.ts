import { CommandContextTag, ConfigTag } from "@/core/context.js";
import { toAppError, type AppError } from "@/core/errors.js";
import { JournalService } from "@/core/journal.js";
import { runPipeline, type Plugin as PipelinePluginDef } from "@/core/pipeline.js";
import { FileSystemPort, HttpPort, ProcessPort, PromptPort } from "@/core/ports.js";
import type { ApprovedUpdatePlan } from "@/domain/updatePlan.js";
import { coreUpdatePlugin } from "@/plugins/coreUpdatePlugin.js";
import { MemoryVFS } from "@/shell/adapters/vfs.js";
import {
  queryAvailableUpdates,
  queryUpdateState,
  queryUserUpdateApproval,
} from "@/shell/cli/updateOrchestrator.js";
import { DirectoryPlugin, FilePlugin, HttpPlugin, loadPlugins } from "@/shell/plugins/index.js";
import type { CommandOutcome, ResolvedRegpickConfig } from "@/types.js";
import { Effect } from "effect";
import crypto from "node:crypto";

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
    const context = yield* CommandContextTag;
    const resolvedPlugins = yield* loadPlugins(state.config.plugins || [], context.cwd).pipe(
      Effect.mapError(toAppError),
    );
    const hydratedConfig: ResolvedRegpickConfig = {
      ...state.config,
      plugins: resolvedPlugins,
    };

    const logic = Effect.gen(function* () {
      const fs = yield* FileSystemPort;
      const http = yield* HttpPort;
      const process = yield* ProcessPort;
      const prompt = yield* PromptPort;
      const runtime = { fs, http, process, prompt };

      const componentNames = Object.keys(state.lockfile.components);
      if (componentNames.length === 0) {
        yield* runtime.prompt.info("No components installed. Nothing to update.");
        return {
          kind: "noop",
          message: "No components to update.",
        } as CommandOutcome;
      }

      const customPlugins = (yield* ConfigTag).plugins || [];

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

      const userPlugins = customPlugins.filter((p) => p.type === "pipeline");
      const vfs = new MemoryVFS();

      const pipelinePlugins: PipelinePluginDef[] = [
        ...(userPlugins as PipelinePluginDef[]),
        coreUpdatePlugin(
          approvedPlan.approvedUpdates,
          updatedLockfile,
          runtime,
        ) as PipelinePluginDef,
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

    return yield* Effect.provideService(logic, ConfigTag, hydratedConfig);
  });
}
