import { Effect, Either } from "effect";
import { styleText } from "node:util";

import { CommandContextTag, ConfigTag } from "@/core/context.js";
import { appError, toAppError, type AppError } from "@/core/errors.js";
import { PipelineRenderer, type PersistableVFS } from "@/core/pipeline.js";
import { MemoryVFS } from "@/core/vfs.js";
import { buildUpdatePlanForItem, groupBySource } from "@/domain/updatePlan.js";
import { readConfig } from "@/shell/config.js";
import { readLockfile, writeLockfile } from "@/shell/lockfile.js";
import { DirectoryPlugin, FilePlugin, HttpPlugin, loadPlugins } from "@/shell/plugins/index.js";
import { loadRegistry, resolveFileContent } from "@/shell/registry.js";
import { Runtime } from "@/shell/runtime/ports.js";
import type {
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
function queryLoadState(): Effect.Effect<
  { config: RegpickConfig; lockfile: RegpickLockfile },
  AppError,
  Runtime | CommandContextTag
> {
  return Effect.gen(function* () {
    const runtime = yield* Runtime;
    const context = yield* CommandContextTag;
    const configRes = yield* readConfig(context.cwd).pipe(Effect.mapError(toAppError));

    const lockfile = yield* readLockfile(context.cwd, runtime).pipe(Effect.mapError(toAppError));

    if (!configRes.configPath) {
      yield* runtime.prompt.error("No regpick.json configuration found. Please run 'init' first.");
      return yield* Effect.fail(appError("ValidationError", "No config file found"));
    }

    return { config: configRes.config as RegpickConfig, lockfile };
  });
}

/**
 * Scans all defined component origins matching hashes to registry states.
 */
function queryAvailableUpdates(
  lockfile: RegpickLockfile,
  plugins: RegpickPlugin[],
): Effect.Effect<DetectedUpdate[], AppError, Runtime | CommandContextTag | ConfigTag> {
  return Effect.gen(function* () {
    const config = yield* ConfigTag;
    const runtime = yield* Runtime;
    const context = yield* CommandContextTag;
    const bySource = groupBySource(lockfile);

    const updatesNested = yield* Effect.forEach(
      Object.entries(bySource),
      ([source, itemsToUpdate]) =>
        Effect.gen(function* () {
          const loadOpt = yield* Effect.either(loadRegistry(source, context.cwd, runtime, plugins));

          if (Either.isLeft(loadOpt)) {
            yield* runtime.prompt.warn(`Failed to load registry ${source}`);
            return [];
          }

          const registryItems = loadOpt.right.items;

          const sourceUpdates = yield* Effect.forEach(
            itemsToUpdate,
            (itemName) =>
              Effect.gen(function* () {
                const registryItem = registryItems.find((i) => i.name === itemName);
                if (!registryItem) return null;

                const resolvedFiles = yield* Effect.all(
                  registryItem.files.map((file) =>
                    resolveFileContent(file, registryItem, context.cwd, runtime, plugins).pipe(
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
                const updatePlanRes = yield* Effect.catchAll(
                  buildUpdatePlanForItem(
                    itemName,
                    registryItem,
                    resolvedFiles,
                    currentHash,
                    context.cwd,
                    config,
                  ),
                  () => Effect.succeed(null),
                );

                if (!updatePlanRes) return null;

                const updateAction = updatePlanRes;

                if (updateAction.status === "requires-diff-prompt") {
                  const filesWithLocal = yield* Effect.forEach(
                    updateAction.files,
                    (rf) =>
                      Effect.gen(function* () {
                        const localContent = yield* Effect.catchAll(
                          runtime.fs.readFile(rf.target, "utf8"),
                          () => Effect.succeed(""),
                        );
                        return {
                          target: rf.target,
                          remoteContent: rf.content,
                          localContent,
                        };
                      }),
                    { concurrency: "unbounded" },
                  );

                  return {
                    itemName,
                    newHash: updateAction.newHash,
                    files: filesWithLocal,
                  };
                }
                return null;
              }),
            { concurrency: "unbounded" },
          );

          return sourceUpdates.filter((u): u is DetectedUpdate => u !== null);
        }),
      { concurrency: 1 }, // Because of prompt.warn
    );

    return updatesNested.flat();
  });
}

/**
 * Outputs standard diffing structures inside terminal consoles inline.
 */
function printDiff(oldContent: string, newContent: string): Effect.Effect<void, AppError> {
  return Effect.gen(function* () {
    const changes = yield* Effect.tryPromise({
      try: () => import("diff").then(({ diffLines }) => diffLines(oldContent, newContent)),
      catch: toAppError,
    });

    yield* Effect.forEach(
      changes,
      (part) =>
        Effect.sync(() => {
          const format = part.added ? "green" : part.removed ? "red" : "gray";
          const prefix = part.added ? "+ " : part.removed ? "- " : "  ";
          const lines = part.value.replace(/\n$/, "").split("\n");
          for (const line of lines) {
            console.log(styleText(format, `${prefix}${line}`));
          }
        }),
      { concurrency: 1 },
    );
  });
}

/**
 * Determines final decisions on diff changes required by targeted registries.
 */
function interactApprovalPhase(
  availableUpdates: DetectedUpdate[],
): Effect.Effect<ApprovedUpdatePlan, AppError, Runtime | CommandContextTag | ConfigTag> {
  return Effect.gen(function* () {
    const runtime = yield* Runtime;
    const approvedUpdatesOpt = yield* Effect.forEach(
      availableUpdates,
      (update) =>
        Effect.gen(function* () {
          yield* runtime.prompt.info(`Update available for ${update.itemName}`);

          const action = yield* runtime.prompt.select({
            message: `What do you want to do with ${update.itemName}?`,
            options: [
              { value: "diff", label: "Show diff" },
              { value: "update", label: "Update" },
              { value: "skip", label: "Skip" },
            ],
          });

          const isActionCancel = yield* runtime.prompt.isCancel(action);

          if (isActionCancel || action === "skip") {
            return null;
          }

          if (action === "diff") {
            yield* Effect.forEach(
              update.files,
              (rf) =>
                Effect.gen(function* () {
                  console.log(styleText("bold", `\nDiff for ${rf.target}:`));
                  yield* printDiff(rf.localContent, rf.remoteContent);
                }),
              { concurrency: 1 },
            );

            const confirm = yield* runtime.prompt.confirm({
              message: `Update ${update.itemName} now?`,
              initialValue: true,
            });

            const isConfirmCancel = yield* runtime.prompt.isCancel(confirm);

            if (isConfirmCancel || !confirm) {
              return null;
            }
          }

          return update;
        }),
      { concurrency: 1 },
    );

    return {
      approvedUpdates: approvedUpdatesOpt.filter((u): u is DetectedUpdate => u !== null),
    };
  });
}

/**
 * Main controller for the `update` command effect loop.
 */
export function runUpdateCommand(): Effect.Effect<
  CommandOutcome,
  AppError,
  Runtime | CommandContextTag
> {
  return Effect.gen(function* () {
    const state = yield* queryLoadState();

    const logic = Effect.gen(function* () {
      const runtime = yield* Runtime;
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
        approvedPlan = yield* interactApprovalPhase(updates);
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
            updatedLockfile.components[update.itemName].hash = update.newHash;
          }),
        { concurrency: "unbounded" },
      );

      const userPlugins = (yield* ConfigTag).plugins?.filter((p) => typeof p === "object") || [];
      const vfs = new MemoryVFS();

      const pipeline = new PipelineRenderer([
        ...(userPlugins as import("../core/pipeline.js").Plugin[]),
        {
          name: "regpick:core-update",
          async finish(ctx) {
            if ("flushToDisk" in ctx.vfs) {
              await (ctx.vfs as PersistableVFS).flushToDisk();
            }
            await Effect.runPromise(writeLockfile(ctx.cwd, updatedLockfile, runtime));
          },
        },
      ]);

      yield* pipeline.run({ vfs, cwd: context.cwd, runtime: runtime }, vfsFiles).pipe(
        Effect.catchAll((error) => {
          vfs.rollback();
          return Effect.gen(function* () {
            yield* runtime.prompt.error(`[Failed] Update aborted: ${error.message}`);
            return yield* Effect.fail(error);
          });
        }),
      );

      return {
        kind: "success",
        message: `Updated ${approvedCount} components.`,
      } as CommandOutcome;
    });

    return yield* Effect.provideService(logic, ConfigTag, state.config);
  });
}
