import { styleText } from "node:util";

import { appError, type AppError } from "@/core/errors.js";
import { err, ok, type Result } from "@/core/result.js";
import { runSaga, type TransactionStep } from "@/core/saga.js";
import { SaveLockfileStep } from "@/domain/saga/saveLockfileStep.js";
import { UpdateFileStep } from "@/domain/saga/updateFileStep.js";
import { buildUpdatePlanForItem, groupBySource } from "@/domain/updatePlan.js";
import { readConfig } from "@/shell/config.js";
import { readLockfile } from "@/shell/lockfile.js";
import { loadRegistry, resolveFileContent } from "@/shell/registry.js";
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
): Promise<Result<DetectedUpdate[], AppError>> {
  const bySource = groupBySource(lockfile);
  const availableUpdates: DetectedUpdate[] = [];

  for (const [source, itemsToUpdate] of Object.entries(bySource)) {
    const registryRes = await loadRegistry(source, context.cwd, context.runtime);
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

type UpdateTransactionPayload = {
  sagaSteps: TransactionStep<any>[];
  updatedLockfile: RegpickLockfile;
};

/**
 * Wraps final decision changes payloads safely directly within transaction structures.
 *
 * @param context - Command context.
 * @param initialLockfile - Fallback lock tracking structure constraints.
 * @param approvedPlan - Hand-picked decisions wrapper schemas.
 * @returns Object holding transaction actions plus mapped target hash keys updates.
 */
function buildUpdateCommand(
  context: CommandContext,
  initialLockfile: RegpickLockfile,
  approvedPlan: ApprovedUpdatePlan,
): UpdateTransactionPayload {
  const sagaSteps: TransactionStep<any>[] = [];
  const updatedLockfile = JSON.parse(JSON.stringify(initialLockfile)) as RegpickLockfile;

  for (const update of approvedPlan.approvedUpdates) {
    for (const file of update.files) {
      sagaSteps.push(new UpdateFileStep(file.target, file.remoteContent, context.runtime));
    }
    // Record the newly computed hash in the deeply cloned lockfile object
    updatedLockfile.components[update.itemName].hash = update.newHash;
  }

  if (approvedPlan.approvedUpdates.length > 0) {
    sagaSteps.push(new SaveLockfileStep(context.cwd, updatedLockfile, context.runtime));
  }

  return { sagaSteps, updatedLockfile };
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
  // 1. Initial State
  const stateQ = await queryLoadState(context);
  if (!stateQ.ok) return err(stateQ.error);

  const componentNames = Object.keys(stateQ.value.lockfile.components);
  if (componentNames.length === 0) {
    context.runtime.prompt.info("No components installed. Nothing to update.");
    return ok({ kind: "noop", message: "No components to update." });
  }

  // 2. Discover Targets (Network & Local disk reads)
  const updatesQ = await queryAvailableUpdates(context, stateQ.value.config, stateQ.value.lockfile);
  if (!updatesQ.ok) return err(updatesQ.error);

  if (updatesQ.value.length === 0) {
    return ok({ kind: "noop", message: "All components are up to date." });
  }

  // 3. Resolve conflicts / prompts via User Interactions
  const approvedPlanQ = await interactApprovalPhase(context, updatesQ.value);
  if (!approvedPlanQ.ok) return err(approvedPlanQ.error);

  const approvedCount = approvedPlanQ.value.approvedUpdates.length;
  if (approvedCount === 0) {
    return ok({ kind: "noop", message: "No updates approved." });
  }

  // 4. Assemble Transactions
  const { sagaSteps } = buildUpdateCommand(context, stateQ.value.lockfile, approvedPlanQ.value);

  // 5. Execute!
  const runRes = await runSaga(sagaSteps, (stepName, status) => {
    if (status === "executing") {
      // Intentionally quiet while executing tasks
    } else if (status === "completed") {
      context.runtime.prompt.success(`[Success] ${stepName}`);
    } else if (status === "failed") {
      context.runtime.prompt.error(`[Failed] ${stepName}`);
    } else if (status === "compensating") {
      context.runtime.prompt.warn(`[Rollback] ${stepName}`);
    } else if (status === "interrupted") {
      context.runtime.prompt.error(`[Interrupted] Rolling back ${stepName}`);
    }
  });

  if (!runRes.ok) return runRes;

  return ok({
    kind: "success",
    message: `Updated ${approvedCount} components.`,
  });
}
