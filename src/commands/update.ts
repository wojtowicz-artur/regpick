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
  localContent: string; // Used for pure diffing interaction without side-effects
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
 *
 * @param context - Command context.
 * @returns Valid active configuration structures alongside locked manifests.
 */
async function queryLoadState(
  context: CommandContext,
): Promise<Either.Either<{ config: RegpickConfig; lockfile: RegpickLockfile }, AppError>> {
  // Read config and lockfile concurrently
  const [configRes, lockfile] = await Promise.all([
    readConfig(context.cwd),
    readLockfile(context.cwd, context.runtime),
  ]);

  if (!configRes.configPath) {
    context.runtime.prompt.error("No regpick.json configuration found. Please run 'init' first.");
    return Either.left(appError("ValidationError", "No config file found"));
  }

  return Either.right({ config: configRes.config as RegpickConfig, lockfile });
}

/**
 * Scans all defined component origins matching hashes to registry states.
 *
 * @param context - Command context.
 * @param config - Main structural configurations constraints.
 * @param lockfile - Component lock structures payload.
 * @returns Calculated diff schemas ready for target execution branches.
 */
async function queryAvailableUpdates(
  context: CommandContext,
  config: RegpickConfig,
  lockfile: RegpickLockfile,
  plugins: RegpickPlugin[],
): Promise<Either.Either<DetectedUpdate[], AppError>> {
  const bySource = groupBySource(lockfile);
  const availableUpdates: DetectedUpdate[] = [];

  for (const [source, itemsToUpdate] of Object.entries(bySource)) {
    const registryRes = await loadRegistry(source, context.cwd, context.runtime, plugins);
    if (Either.isLeft(registryRes)) {
      context.runtime.prompt.warn(`Failed to load registry ${source}`);
      continue;
    }

    const registryItems = registryRes.right.items;

    for (const itemName of itemsToUpdate) {
      const registryItem = registryItems.find((i) => i.name === itemName);
      if (!registryItem) continue;

      const fileContentResults = await Promise.all(
        registryItem.files.map(async (file) => {
          const contentRes = await resolveFileContent(
            file,
            registryItem,
            context.cwd,
            context.runtime,
            plugins,
          );
          if (Either.isLeft(contentRes)) return null;
          return { file, content: contentRes.right };
        }),
      );

      const resolvedFiles = fileContentResults.filter(
        (r): r is { file: RegistryFile; content: string } => r !== null,
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
        // Hydrate local contents immediately so the interaction phase is 100% pure IO with user
        const filesWithLocal: DetectedUpdateFile[] = [];
        for (const rf of updateAction.files) {
          let localContent = "";
          try {
            localContent = await Effect.runPromise(context.runtime.fs.readFile(rf.target, "utf8"));
          } catch {
            localContent = "";
          }
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

  return Either.right(availableUpdates);
}

/**
 * Outputs standard diffing structures inside terminal consoles inline.
 *
 * @param oldContent - Base payload node text.
 * @param newContent - Received targeted remote elements node strings.
 */
async function printDiff(oldContent: string, newContent: string) {
  // TODO: Use a native diff implementation to avoid the dependency. This is a temporary solution. WHEN: implement when ecosystem will move further from Node 20, because native diff landad in Node 22.15
  const changes = await import("diff").then(({ diffLines }) => {
    return diffLines(oldContent, newContent);
  });

  for (const part of changes) {
    const format = part.added ? "green" : part.removed ? "red" : "gray";
    const prefix = part.added ? "+ " : part.removed ? "- " : "  ";
    const lines = part.value.replace(/\n$/, "").split("\n");
    for (const line of lines) {
      console.log(styleText(format, `${prefix}${line}`));
    }
  }
}

/**
 * Determines final decisions on diff changes required by targeted registries.
 *
 * @param context - Command context.
 * @param availableUpdates - Raw detected updates payload.
 * @returns Sanctioned overrides execution plans constraints.
 */
async function interactApprovalPhase(
  context: CommandContext,
  availableUpdates: DetectedUpdate[],
): Promise<Either.Either<ApprovedUpdatePlan, AppError>> {
  const approvedUpdates: DetectedUpdate[] = [];

  for (const update of availableUpdates) {
    context.runtime.prompt.info(`Update available for ${update.itemName}`);

    const action = await Effect.runPromise(
      context.runtime.prompt.select({
        message: `What do you want to do with ${update.itemName}?`,
        options: [
          { value: "diff", label: "Show diff" },
          { value: "update", label: "Update" },
          { value: "skip", label: "Skip" },
        ],
      }),
    );

    const isActionCancel = await Effect.runPromise(context.runtime.prompt.isCancel(action));
    if (isActionCancel || action === "skip") {
      continue;
    }

    if (action === "diff") {
      for (const rf of update.files) {
        console.log(styleText("bold", `\nDiff for ${rf.target}:`));
        await printDiff(rf.localContent, rf.remoteContent);
      }

      const confirm = await Effect.runPromise(
        context.runtime.prompt.confirm({
          message: `Update ${update.itemName} now?`,
          initialValue: true,
        }),
      );

      const isConfirmCancel = await Effect.runPromise(context.runtime.prompt.isCancel(confirm));
      if (isConfirmCancel || !confirm) {
        continue;
      }
    }

    approvedUpdates.push(update);
  }

  return Either.right({ approvedUpdates });
}

/**
 * Main controller for the `update` command.
 * Automates pulling modifications using active lock tracking references.
 *
 * @param context - Command context.
 * @returns Process completion payload constraints wrapper.
 */
export async function runUpdateCommand(
  context: CommandContext,
): Promise<Either.Either<CommandOutcome, AppError>> {
  const stateQ = await queryLoadState(context);
  if (Either.isLeft(stateQ)) return Either.left(stateQ.left);

  const componentNames = Object.keys(stateQ.right.lockfile.components);
  if (componentNames.length === 0) {
    context.runtime.prompt.info("No components installed. Nothing to update.");
    return Either.right({ kind: "noop", message: "No components to update." });
  }

  const customPlugins = await loadPlugins(stateQ.right.config.plugins || [], context.cwd);
  const plugins = [...customPlugins, HttpPlugin(), FilePlugin(), DirectoryPlugin()];

  const updatesQ = await queryAvailableUpdates(
    context,
    stateQ.right.config,
    stateQ.right.lockfile,
    plugins,
  );
  if (Either.isLeft(updatesQ)) return Either.left(updatesQ.left);

  if (updatesQ.right.length === 0) {
    return Either.right({
      kind: "noop",
      message: "All components are up to date.",
    });
  }

  let approvedPlanQ: Either.Either<ApprovedUpdatePlan, AppError>;

  if (context.args?.flags?.yes) {
    approvedPlanQ = Either.right({ approvedUpdates: updatesQ.right });
  } else {
    approvedPlanQ = await interactApprovalPhase(context, updatesQ.right);
  }

  if (Either.isLeft(approvedPlanQ)) return Either.left(approvedPlanQ.left);

  const approvedCount = approvedPlanQ.right.approvedUpdates.length;
  if (approvedCount === 0) {
    return Either.right({ kind: "noop", message: "No updates approved." });
  }

  const updatedLockfile = JSON.parse(JSON.stringify(stateQ.right.lockfile));
  const vfsFiles = [];

  for (const update of approvedPlanQ.right.approvedUpdates) {
    for (const file of update.files) {
      vfsFiles.push({
        id: file.target,
        code: file.remoteContent,
      });
    }
    updatedLockfile.components[update.itemName].hash = update.newHash;
  }

  const userPlugins = stateQ.right.config.plugins?.filter((p) => typeof p === "object") || [];
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

  try {
    await pipeline.run({ vfs, cwd: context.cwd, runtime: context.runtime }, vfsFiles);
  } catch (error) {
    vfs.rollback();
    context.runtime.prompt.error(`[Failed] Update aborted: ${error}`);
    return Either.left(appError("RuntimeError", String(error)));
  }

  return Either.right({
    kind: "success",
    message: `Updated ${approvedCount} components.`,
  });
}
