import { Effect, Either } from "effect";
import { styleText } from "node:util";

import { CommandContextTag, ConfigTag } from "@/core/context.js";
import { appError, toAppError, type AppError } from "@/core/errors.js";
import { FileSystemPort, HttpPort, ProcessPort, PromptPort } from "@/core/ports.js";
import {
  buildUpdatePlanForItem,
  groupBySource,
  type ApprovedUpdatePlan,
  type DetectedUpdate,
} from "@/domain/updatePlan.js";
import { readConfig } from "@/shell/config/index.js";
import { readLockfile } from "@/shell/services/lockfile.js";
import { loadRegistry, resolveFileContent } from "@/shell/services/registry.js";
import type { RegistryFile, RegpickConfig, RegpickLockfile, RegpickPlugin } from "@/types.js";

export function queryUpdateState(): Effect.Effect<
  { config: RegpickConfig; lockfile: RegpickLockfile },
  AppError,
  FileSystemPort | HttpPort | ProcessPort | PromptPort | CommandContextTag
> {
  return Effect.gen(function* () {
    const fs = yield* FileSystemPort;
    const http = yield* HttpPort;
    const process = yield* ProcessPort;
    const prompt = yield* PromptPort;
    const runtime = { fs, http, process, prompt };
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

export function queryAvailableUpdates(
  lockfile: RegpickLockfile,
  plugins: RegpickPlugin[],
): Effect.Effect<
  DetectedUpdate[],
  AppError,
  FileSystemPort | HttpPort | ProcessPort | PromptPort | CommandContextTag | ConfigTag
> {
  return Effect.gen(function* () {
    const config = yield* ConfigTag;
    const fs = yield* FileSystemPort;
    const http = yield* HttpPort;
    const process = yield* ProcessPort;
    const prompt = yield* PromptPort;
    const runtime = { fs, http, process, prompt };
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

                const lockfileItem = lockfile.components[itemName];
                const updatePlanRes = yield* Effect.catchAll(
                  buildUpdatePlanForItem(
                    itemName,
                    registryItem,
                    resolvedFiles,
                    lockfileItem,
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
                    newFiles: updateAction.newFiles,
                    files: filesWithLocal,
                  };
                }
                return null;
              }),
            { concurrency: "unbounded" },
          );

          return sourceUpdates.filter((u): u is DetectedUpdate => u !== null);
        }),
      { concurrency: 1 },
    );

    return updatesNested.flat();
  });
}

function printDiff(
  oldContent: string,
  newContent: string,
): Effect.Effect<void, AppError, PromptPort> {
  return Effect.gen(function* () {
    const prompt = yield* PromptPort;
    const changes = yield* Effect.tryPromise({
      try: () => import("diff").then(({ diffLines }) => diffLines(oldContent, newContent)),
      catch: toAppError,
    });

    yield* Effect.forEach(
      changes,
      (part) =>
        Effect.gen(function* () {
          const format = part.added ? "green" : part.removed ? "red" : "gray";
          const prefix = part.added ? "+ " : part.removed ? "- " : "  ";
          const lines = part.value.replace(/\n$/, "").split("\n");
          for (const line of lines) {
            yield* prompt.log(styleText(format, `${prefix}${line}`));
          }
        }),
      { concurrency: 1 },
    );
  });
}

export function queryUserUpdateApproval(
  availableUpdates: DetectedUpdate[],
): Effect.Effect<
  ApprovedUpdatePlan,
  AppError,
  FileSystemPort | HttpPort | ProcessPort | PromptPort | CommandContextTag | ConfigTag
> {
  return Effect.gen(function* () {
    const fs = yield* FileSystemPort;
    const http = yield* HttpPort;
    const process = yield* ProcessPort;
    const prompt = yield* PromptPort;
    const runtime = { fs, http, process, prompt };

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
                  yield* runtime.prompt.log(styleText("bold", `\nDiff for ${rf.target}:`));
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
