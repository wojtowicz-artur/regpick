import { CommandContextTag, ConfigTag } from "@/core/context.js";
import { type AppError } from "@/core/errors.js";
import { JournalService } from "@/core/journal.js";
import { runPipeline } from "@/core/pipeline.js";
import { Runtime } from "@/core/ports.js";
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
import {
  DirectoryPlugin,
  FilePlugin,
  HttpPlugin,
  loadPlugins,
} from "@/shell/plugins/index.js";
import type { CommandOutcome, RegistryItem } from "@/types.js";
import { Effect } from "effect";
import crypto from "node:crypto";

export function runAddCommand(): Effect.Effect<
  CommandOutcome,
  AppError,
  Runtime | CommandContextTag | JournalService
> {
  return Effect.gen(function* () {
    const { config } = yield* queryConfiguration();

    const logic = Effect.gen(function* () {
      const runtime = yield* Runtime;
      const context = yield* CommandContextTag;
      const source = yield* queryRegistrySource();

      if (!source) {
        return {
          kind: "noop",
          message: "No source provided",
        } as CommandOutcome;
      }

      const customPlugins = yield* loadPlugins(
        (yield* ConfigTag).plugins || [],
        context.cwd,
      );
      const plugins = [
        ...customPlugins,
        HttpPlugin(),
        FilePlugin(),
        DirectoryPlugin(),
      ];
      const itemsToProc = yield* querySelectedItems(source, plugins);

      for (const d of itemsToProc.missingRegistryDeps || []) {
        yield* runtime.prompt.warn(
          `Registry dependency "${d}" not found in current registry.`,
        );
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
        const originalItem = approved.selectedItems.find(
          (i) => i.name === write.itemName,
        );
        if (
          originalItem &&
          !installedItemsInfo.some((i) => i.name === originalItem.name)
        ) {
          installedItemsInfo.push(originalItem);
        }
      }

      const userPlugins = (config.plugins?.filter(
        (p) => typeof p === "object",
      ) || []) as import("../core/pipeline.js").Plugin[];

      const depPlan = approved.shouldInstallDeps
        ? approved.dependencyPlan
        : { dependencies: [], devDependencies: [] };

      const pipelinePlugins: import("../core/pipeline.js").Plugin[] = [
        ...userPlugins,
        coreAddPlugin(
          depPlan,
          yield* ConfigTag,
          runtime,
          installedItemsInfo,
          hydratedWrites,
        ) as import("../core/pipeline.js").Plugin,
      ];

      const journal = yield* JournalService;
      let lockfileBackup: any;
      try {
        const { readLockfile } = yield* Effect.promise(
          () => import("@/shell/services/lockfile.js"),
        );
        lockfileBackup = yield* readLockfile(context.cwd, runtime).pipe(
          Effect.catchAll(() => Effect.succeed(undefined)),
        );
      } catch {
        // Ignored
      }

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
            yield* runtime.prompt.error(
              `[Failed] Installation aborted: ${error.message}`,
            );
            return yield* Effect.fail(error);
          });
        }),
        Effect.tap(() => journal.clearIntent(context.cwd)),
      );

      return {
        kind: "success",
        plan: approved,
      } as CommandOutcome;
    }).pipe(Effect.provideService(ConfigTag, config));

    return yield* logic;
  });
}
