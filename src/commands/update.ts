import { Effect, Either } from "effect";
import { styleText } from "node:util";

import { appError, type AppError } from "@/core/errors.js";
import { PipelineRenderer, type PersistableVFS } from "@/core/pipeline.js";
import { MemoryVFS } from "@/core/vfs.js";
import { buildUpdatePlanForItem, groupBySource } from "@/domain/updatePlan.js";
import { readConfig } from "@/shell/config.js";
import { readLockfile, writeLockfile } from "@/shell/lockfile.js";
import { DirectoryPlugin, FilePlugin, HttpPlugin, loadPlugins } from "@/shell/plugins/index.js";
import { loadRegistry, resolveFileContent } from "@/shell/registry.js";
import type {
  CommandContext,
  CommandOutcome,
  RegistryFile,
  RegpickConfig,
  RegpickLockfile,
  RegpickPlugin,
} from "@/types.js";

type DetectedUpdateFile = {
  target: string;
  remoteContent: string;
  localContent: string;
};

type DetectedUpdate = {
  itemName: string;
  newHash: string;
  files: DetectedUpdateFile[];
};

type ApprovedUpdatePlan = {
  approvedUpdates: DetectedUpdate[];
};

/**
 * Evaluates local lockfile dependencies against root config boundaries.
 */
function queryLoadState(
  context: CommandContext,
): Effect.Effect<{ config: RegpickConfig; lockfile: RegpickLockfile }, AppError> {
  return Effect.gen(function* () {
    const configRes = yield* Effect.tryPromise({
      try: () => readConfig(context.cwd),
      catch: (e): AppError => appError("RuntimeError", String(e)),
    });

    const lockfile = yield* Effect.tryPromise({
      try: () => readLockfile(context.cwd, context.runtime),
      catch: (e): AppError => appError("RuntimeError", String(e)),
    });

    if (!configRes.configPath) {
      yield* context.runtime.prompt.error(
        "No regpick.json configuration found. Please run 'init' first.",
      );
      return yield* Effect.fail(appError("ValidationError", "No config file found"));
    }

    return { config: configRes.config as RegpickConfig, lockfile };
  });
}

/**
 * Scans all defined component origins matching hashes to registry states.
 */
function queryAvailableUpdates(
  context: CommandContext,
  config: RegpickConfig,
  lockfile: RegpickLockfile,
  plugins: RegpickPlugin[],
): Effect.Effect<DetectedUpdate[], AppError> {
  return Effect.gen(function* () {
    const bySource = groupBySource(lockfile);
    const availableUpdates: DetectedUpdate[] = [];

    for (const [source, itemsToUpdate] of Object.entries(bySource)) {
      const loadOpt = yield* Effect.either(
        loadRegistry(source, context.cwd, context.runtime, plugins),
      );

      if (Either.isLeft(loadOpt)) {
        yield* context.runtime.prompt.warn(`Failed to load registry ${source}`);
        continue;
      }

      const registryItems = loadOpt.right.items;

      for (const itemName of itemsToUpdate) {
        const registryItem = registryItems.find((i) => i.name === itemName);
        if (!registryItem) continue;

        const resolvedFiles = yield* Effect.all(
          registryItem.files.map((file) =>
            resolveFileContent(file, registryItem, context.cwd, context.runtime, plugins).pipe(
              Effect.map((content) => ({ file, content })),
              Effect.catchAll(() => Effect.succeed(null)),
            ),
          ),
          { concurrency: "unbounded" },
        ).pipe(
          Effect.map((results) =>
            results.filter((r): r is { file: RegistryFile; content: string } => r !== null),
          ),
        );

        const currentHash = lockfile.components[itemName].hash;
        const updatePlanRes = buildUpdatePlanForItem(
          itemName,
          registryItem,
          resolvedFiles,
          currentHash,
          context.cwd,
          config,
        );

        if (Either.isLeft(updatePlanRes)) continue;

        const updateAction = updatePlanRes.right;

        if (updateAction.status === "requires-diff-prompt") {
          const filesWithLocal: DetectedUpdateFile[] = [];
          for (const rf of updateAction.files) {
            const localContent = yield* Effect.catchAll(
              context.runtime.fs.readFile(rf.target, "utf8"),
              () => Effect.succeed(""),
            );
            filesWithLocal.push({
              target: rf.target,
              remoteContent: rf.content,
              localContent,
            });
          }

          availableUpdates.push({
            itemName,
            newHash: updateAction.newHash,
            files: filesWithLocal,
          });
        }
      }
    }

    return availableUpdates;
  });
}

/**
 * Outputs standard diffing structures inside terminal consoles inline.
 */
function printDiff(oldContent: string, newContent: string): Effect.Effect<void, AppError> {
  return Effect.gen(function* () {
    const changes = yield* Effect.tryPromise({
      try: () => import("diff").then(({ diffLines }) => diffLines(oldContent, newContent)),
      catch: (e): AppError => appError("RuntimeError", String(e)),
    });

    for (const part of changes) {
      const format = part.added ? "green" : part.removed ? "red" : "gray";
      const prefix = part.added ? "+ " : part.removed ? "- " : "  ";
      const lines = part.value.replace(/\n$/, "").split("\n");
      for (const line of lines) {
        console.log(styleText(format, `${prefix}${line}`));
      }
    }
  });
}

/**
 * Determines final decisions on diff changes required by targeted registries.
 */
function interactApprovalPhase(
  context: CommandContext,
  availableUpdates: DetectedUpdate[],
): Effect.Effect<ApprovedUpdatePlan, AppError> {
  return Effect.gen(function* () {
    const approvedUpdates: DetectedUpdate[] = [];

    for (const update of availableUpdates) {
      yield* context.runtime.prompt.info(`Update available for ${update.itemName}`);

      const action = yield* context.runtime.prompt.select({
        message: `What do you want to do with ${update.itemName}?`,
        options: [
          { value: "diff", label: "Show diff" },
          { value: "update", label: "Update" },
          { value: "skip", label: "Skip" },
        ],
      });

      const isActionCancel = yield* context.runtime.prompt.isCancel(action);

      if (isActionCancel || action === "skip") {
        continue;
      }

      if (action === "diff") {
        for (const rf of update.files) {
          console.log(styleText("bold", `\nDiff for ${rf.target}:`));
          yield* printDiff(rf.localContent, rf.remoteContent);
        }

        const confirm = yield* context.runtime.prompt.confirm({
          message: `Update ${update.itemName} now?`,
          initialValue: true,
        });

        const isConfirmCancel = yield* context.runtime.prompt.isCancel(confirm);

        if (isConfirmCancel || !confirm) {
          continue;
        }
      }

      approvedUpdates.push(update);
    }

    return { approvedUpdates };
  });
}

/**
 * Main controller for the `update` command effect loop.
 */
function runUpdateCommandEff(context: CommandContext): Effect.Effect<CommandOutcome, AppError> {
  return Effect.gen(function* () {
    const state = yield* queryLoadState(context);

    const componentNames = Object.keys(state.lockfile.components);
    if (componentNames.length === 0) {
      yield* context.runtime.prompt.info("No components installed. Nothing to update.");
      return {
        kind: "noop",
        message: "No components to update.",
      } as CommandOutcome;
    }

    const customPlugins = yield* Effect.tryPromise({
      try: () => loadPlugins(state.config.plugins || [], context.cwd),
      catch: (e): AppError => appError("RuntimeError", String(e)),
    });

    const plugins = [...customPlugins, HttpPlugin(), FilePlugin(), DirectoryPlugin()];

    const updates = yield* queryAvailableUpdates(context, state.config, state.lockfile, plugins);

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
      approvedPlan = yield* interactApprovalPhase(context, updates);
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

    for (const update of approvedPlan.approvedUpdates) {
      for (const file of update.files) {
        vfsFiles.push({
          id: file.target,
          code: file.remoteContent,
        });
      }
      updatedLockfile.components[update.itemName].hash = update.newHash;
    }

    const userPlugins = state.config.plugins?.filter((p) => typeof p === "object") || [];
    const vfs = new MemoryVFS();

    const pipeline = new PipelineRenderer([
      ...(userPlugins as import("../core/pipeline.js").Plugin[]),
      {
        name: "regpick:core-update",
        async finish(ctx) {
          if ("flushToDisk" in ctx.vfs) {
            await (ctx.vfs as PersistableVFS).flushToDisk();
          }
          await writeLockfile(ctx.cwd, updatedLockfile, context.runtime);
        },
      },
    ]);

    yield* Effect.tryPromise({
      try: () => pipeline.run({ vfs, cwd: context.cwd, runtime: context.runtime }, vfsFiles),
      catch: (error): AppError => {
        vfs.rollback();
        Effect.runPromise(context.runtime.prompt.error(`[Failed] Update aborted: ${error}`));
        return appError("RuntimeError", String(error));
      },
    });

    return {
      kind: "success",
      message: `Updated ${approvedCount} components.`,
    } as CommandOutcome;
  });
}

export async function runUpdateCommand(
  context: CommandContext,
): Promise<Either.Either<CommandOutcome, AppError>> {
  return await Effect.runPromise(Effect.either(runUpdateCommandEff(context)));
}
