import { styleText } from "node:util";

import { appError, type AppError } from "@/core/errors.js";
import { PipelineRenderer, type PersistableVFS } from "@/core/pipeline.js";
import { err, ok, type Result } from "@/core/result.js";
import { MemoryVFS } from "@/core/vfs.js";
import { buildUpdatePlanForItem, groupBySource } from "@/domain/updatePlan.js";
import { readConfig } from "@/shell/config.js";
import { readLockfile, writeLockfile } from "@/shell/lockfile.js";
import { loadRegistry, resolveFileContent } from "@/shell/registry.js";
import {
  DirectoryAdapter,
  FileAdapter,
  HttpAdapter,
  loadAdapters,
  type RegistryAdapter,
} from "@/shell/registry/index.js";
import type {
  CommandContext,
  CommandOutcome,
  RegistryFile,
  RegpickConfig,
  RegpickLockfile,
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
): Promise<Result<{ config: RegpickConfig; lockfile: RegpickLockfile }, AppError>> {
  // Read config and lockfile concurrently
  const [configRes, lockfile] = await Promise.all([
    readConfig(context.cwd),
    readLockfile(context.cwd, context.runtime),
  ]);

  if (!configRes.configPath) {
    context.runtime.prompt.error("No regpick.json configuration found. Please run 'init' first.");
    return err(appError("ValidationError", "No config file found"));
  }

  return ok({ config: configRes.config as RegpickConfig, lockfile });
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
  adapters: RegistryAdapter[],
): Promise<Result<DetectedUpdate[], AppError>> {
  const bySource = groupBySource(lockfile);
  const availableUpdates: DetectedUpdate[] = [];

  for (const [source, itemsToUpdate] of Object.entries(bySource)) {
    const registryRes = await loadRegistry(source, context.cwd, context.runtime, adapters);
    if (!registryRes.ok) {
      context.runtime.prompt.warn(`Failed to load registry ${source}`);
      continue;
    }

    const registryItems = registryRes.value.items;

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
            adapters,
          );
          if (!contentRes.ok) return null;
          return { file, content: contentRes.value };
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

      if (!updatePlanRes.ok) continue;

      const updateAction = updatePlanRes.value;

      if (updateAction.status === "requires-diff-prompt") {
        // Hydrate local contents immediately so the interaction phase is 100% pure IO with user
        const filesWithLocal: DetectedUpdateFile[] = [];
        for (const rf of updateAction.files) {
          const localContentRes = await context.runtime.fs.readFile(rf.target, "utf8");
          filesWithLocal.push({
            target: rf.target,
            remoteContent: rf.content,
            localContent: localContentRes.ok ? localContentRes.value : "",
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

  return ok(availableUpdates);
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
): Promise<Result<ApprovedUpdatePlan, AppError>> {
  const approvedUpdates: DetectedUpdate[] = [];

  for (const update of availableUpdates) {
    context.runtime.prompt.info(`Update available for ${update.itemName}`);

    const action = await context.runtime.prompt.select({
      message: `What do you want to do with ${update.itemName}?`,
      options: [
        { value: "diff", label: "Show diff" },
        { value: "update", label: "Update" },
        { value: "skip", label: "Skip" },
      ],
    });

    const isActionCancel = await context.runtime.prompt.isCancel(action);
    if (isActionCancel || action === "skip") {
      continue;
    }

    if (action === "diff") {
      for (const rf of update.files) {
        console.log(styleText("bold", `\nDiff for ${rf.target}:`));
        await printDiff(rf.localContent, rf.remoteContent);
      }

      const confirm = await context.runtime.prompt.confirm({
        message: `Update ${update.itemName} now?`,
        initialValue: true,
      });

      const isConfirmCancel = await context.runtime.prompt.isCancel(confirm);
      if (isConfirmCancel || !confirm) {
        continue;
      }
    }

    approvedUpdates.push(update);
  }

  return ok({ approvedUpdates });
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
): Promise<Result<CommandOutcome, AppError>> {
  const stateQ = await queryLoadState(context);
  if (!stateQ.ok) return err(stateQ.error);

  const componentNames = Object.keys(stateQ.value.lockfile.components);
  if (componentNames.length === 0) {
    context.runtime.prompt.info("No components installed. Nothing to update.");
    return ok({ kind: "noop", message: "No components to update." });
  }

  const customAdapters = await loadAdapters(stateQ.value.config.adapters || [], context.cwd);
  const adapters = [
    ...customAdapters,
    new HttpAdapter(),
    new FileAdapter(),
    new DirectoryAdapter(),
  ];

  const updatesQ = await queryAvailableUpdates(
    context,
    stateQ.value.config,
    stateQ.value.lockfile,
    adapters,
  );
  if (!updatesQ.ok) return err(updatesQ.error);

  if (updatesQ.value.length === 0) {
    return ok({ kind: "noop", message: "All components are up to date." });
  }

  let approvedPlanQ: Result<ApprovedUpdatePlan, AppError>;

  if (context.args?.flags?.yes) {
    approvedPlanQ = ok({ approvedUpdates: updatesQ.value });
  } else {
    approvedPlanQ = await interactApprovalPhase(context, updatesQ.value);
  }

  if (!approvedPlanQ.ok) return err(approvedPlanQ.error);

  const approvedCount = approvedPlanQ.value.approvedUpdates.length;
  if (approvedCount === 0) {
    return ok({ kind: "noop", message: "No updates approved." });
  }

  const updatedLockfile = JSON.parse(JSON.stringify(stateQ.value.lockfile));
  const vfsFiles = [];

  for (const update of approvedPlanQ.value.approvedUpdates) {
    for (const file of update.files) {
      vfsFiles.push({
        id: file.target,
        code: file.remoteContent,
      });
    }
    updatedLockfile.components[update.itemName].hash = update.newHash;
  }

  const userPlugins = stateQ.value.config.plugins || [];
  const vfs = new MemoryVFS();
  const pipeline = new PipelineRenderer([
    ...userPlugins,
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
    await pipeline.run({ vfs, cwd: context.cwd }, vfsFiles);
  } catch (error) {
    vfs.rollback();
    context.runtime.prompt.error(`[Failed] Update aborted: ${error}`);
    return err(appError("RuntimeError", String(error)));
  }

  return ok({
    kind: "success",
    message: `Updated ${approvedCount} components.`,
  });
}
