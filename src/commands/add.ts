import { CommandContextTag, ConfigTag } from "@/core/context.js";
import { type AppError } from "@/core/errors.js";
import { JournalService } from "@/core/journal.js";
import { runPipeline, type Plugin as PipelinePluginDef } from "@/core/pipeline.js";
import { FileSystemPort, HttpPort, ProcessPort, PromptPort } from "@/core/ports.js";
import { coreAddPlugin } from "@/plugins/coreAddPlugin.js";
import { MemoryVFS } from "@/shell/adapters/vfs.js";
import {
  queryConfiguration,
  queryFileContents,
  queryInstallationState,
  queryRegistrySource,
  querySelectedItems,
  queryUserApproval,
} from "@/shell/cli/addOrchestrator.js";
import { DirectoryPlugin, FilePlugin, HttpPlugin, loadPlugins } from "@/shell/plugins/index.js";
import { readLockfile } from "@/shell/services/lockfile.js";
import type { CommandOutcome, RegistryItem, ResolvedRegpickConfig } from "@/types.js";
import { Effect } from "effect";
import crypto from "node:crypto";

export function runAddCommand(): Effect.Effect<
  CommandOutcome,
  AppError,
  FileSystemPort | HttpPort | ProcessPort | PromptPort | CommandContextTag | JournalService
> {
  return Effect.gen(function* () {
    const { config } = yield* queryConfiguration();
    const context = yield* CommandContextTag;
    const resolvedPlugins = yield* loadPlugins(config.plugins || [], context.cwd);
    const hydratedConfig: ResolvedRegpickConfig = {
      ...config,
      plugins: resolvedPlugins,
    };

    const logic = Effect.gen(function* () {
      const fs = yield* FileSystemPort;
      const http = yield* HttpPort;
      const process = yield* ProcessPort;
      const prompt = yield* PromptPort;
      const runtime = { fs, http, process, prompt };
      const source = yield* queryRegistrySource();

      if (!source) {
        return {
          kind: "noop",
          message: "No source provided",
        } as CommandOutcome;
      }

      const customPlugins = (yield* ConfigTag).plugins || [];
      const plugins = [...customPlugins, HttpPlugin(), FilePlugin(), DirectoryPlugin()];
      const itemsToProc = yield* querySelectedItems(source, plugins);

      for (const d of itemsToProc.missingRegistryDeps || []) {
        yield* runtime.prompt.warn(`Registry dependency "${d}" not found in current registry.`);
      }

      const state = yield* queryInstallationState(itemsToProc.selectedItems);
      const approved = yield* queryUserApproval(state);
      const hydratedWrites = yield* queryFileContents(
        approved.finalWrites,
        approved.selectedItems,
        plugins,
      );

      const vfs = new MemoryVFS();
      const vfsFiles = hydratedWrites.map((w) => ({
        id: w.absoluteTarget,
        code: w.finalContent,
      }));

      const installedItemsInfo: RegistryItem[] = [];
      for (const write of hydratedWrites) {
        const originalItem = approved.selectedItems.find((i) => i.name === write.itemName);
        if (originalItem && !installedItemsInfo.some((i) => i.name === originalItem.name)) {
          installedItemsInfo.push(originalItem);
        }
      }

      const userPlugins = customPlugins.filter((p) => p.type === "pipeline");

      const depPlan = approved.shouldInstallDeps
        ? approved.dependencyPlan
        : { dependencies: [], devDependencies: [] };

      let lockfileBackup = yield* readLockfile(context.cwd, runtime).pipe(
        Effect.catchAll(() => Effect.succeed(undefined)),
      );

      const pipelinePlugins: PipelinePluginDef[] = [
        ...(userPlugins as PipelinePluginDef[]),
        coreAddPlugin(
          depPlan,
          yield* ConfigTag,
          runtime,
          installedItemsInfo,
          hydratedWrites,
          lockfileBackup,
        ) as PipelinePluginDef,
      ];

      const journal = yield* JournalService;

      const entry = {
        id: crypto.randomUUID(),
        command: "add" as const,
        status: "pending" as const,
        plannedFiles: hydratedWrites.map((w) => w.absoluteTarget),
        lockfileBackup: lockfileBackup,
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
            yield* runtime.prompt.error(`[Failed] Installation aborted: ${error.message}`);
            return yield* Effect.fail(error);
          });
        }),
        Effect.tap(() => journal.clearIntent(context.cwd)),
      );

      return {
        kind: "success",
        plan: approved,
      } as CommandOutcome;
    }).pipe(Effect.provideService(ConfigTag, hydratedConfig));

    return yield* logic;
  });
}
