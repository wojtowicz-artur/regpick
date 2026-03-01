import { styleText } from "node:util";

import { type AppError } from "@/core/errors.js";
import { ok, type Result } from "@/core/result.js";
import { runSaga, type TransactionStep } from "@/core/saga.js";
import { SaveLockfileStep } from "@/domain/saga/saveLockfileStep.js";
import { UpdateFileStep } from "@/domain/saga/updateFileStep.js";
import { buildUpdatePlanForItem, groupBySource } from "@/domain/updatePlan.js";
import { readConfig } from "@/shell/config.js";
import { readLockfile } from "@/shell/lockfile.js";
import { loadRegistry, resolveFileContent } from "@/shell/registry.js";
import type { CommandContext, CommandOutcome } from "@/types.js";

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

export async function runUpdateCommand(
  context: CommandContext,
): Promise<Result<CommandOutcome, AppError>> {
  const lockfile = await readLockfile(context.cwd, context.runtime);
  const componentNames = Object.keys(lockfile.components);

  if (componentNames.length === 0) {
    context.runtime.prompt.info("No components installed. Nothing to update.");
    return ok({ kind: "noop", message: "No components to update." });
  }

  const { config } = await readConfig(context.cwd);

  const bySource = groupBySource(lockfile);

  let updatedCount = 0;
  const sagaSteps: TransactionStep<void>[] = [];
  const updatedLockfile = JSON.parse(JSON.stringify(lockfile));

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

      const resolvedFiles = fileContentResults.filter((r) => r !== null);

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
        context.runtime.prompt.info(`Update available for ${itemName}`);

        const action = await context.runtime.prompt.select({
          message: `What do you want to do with ${itemName}?`,
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
          for (const rf of updateAction.files) {
            const localContentRes = await context.runtime.fs.readFile(rf.target, "utf8");
            const localContent = localContentRes.ok ? localContentRes.value : "";
            console.log(styleText("bold", `\nDiff for ${rf.target}:`));
            await printDiff(localContent, rf.content);
          }

          const confirm = await context.runtime.prompt.confirm({
            message: `Update ${itemName} now?`,
            initialValue: true,
          });

          const isConfirmCancel = await context.runtime.prompt.isCancel(confirm);
          if (isConfirmCancel || !confirm) {
            continue;
          }
        }

        // Defer applying update to Saga
        for (const rf of updateAction.files) {
          sagaSteps.push(new UpdateFileStep(rf.target, rf.content, context.runtime));
        }

        updatedLockfile.components[itemName].hash = updateAction.newHash;
        updatedCount++;
      }
    }
  }

  if (updatedCount > 0) {
    sagaSteps.push(new SaveLockfileStep(context.cwd, updatedLockfile, context.runtime));

    const runRes = await runSaga(sagaSteps, (stepName, status) => {
      if (status === "executing") {
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

    if (!runRes.ok) {
      return runRes;
    }

    return ok({
      kind: "success",
      message: `Updated ${updatedCount} components.`,
    });
  }

  return ok({ kind: "noop", message: "All components are up to date." });
}
