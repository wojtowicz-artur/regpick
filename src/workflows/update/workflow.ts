import { ConfigTag } from "@/core/context.js";
import { type AppError } from "@/core/errors.js";
import { Effect } from "effect";
import crypto from "node:crypto";
import * as path from "node:path";

import type { UpdateIntent } from "@/domain/models/intent.js";
import type { JournalEntry, RegpickLockfile } from "@/domain/models/state.js";
import { JournalPort } from "@/execution/journal/port.js";
import { LockfilePort } from "@/execution/lockfile/port.js";
import { VFSPort, type VFSFile } from "@/execution/vfs/port.js";
import { FileSystemPort } from "@/interfaces/fs/port.js";
import { PromptPort } from "@/interfaces/prompt/port.js";
import { RegistryPort } from "@/registry/port.js";
import type { TransformPlugin } from "@/sdk/TransformPlugin.js";
import { groupBySource, buildUpdatePlanForItem, type DetectedUpdate } from "@/domain/updatePlan.js";

function getLockfilePath(cwd: string) {
  return path.join(cwd, "regpick.lock.json");
}

function resolveTransformPlugins(config: any) {
  return (config.plugins || []).filter((p: any) => p.type === "transform") as TransformPlugin[];
}

export const updateWorkflow = (
  intent: UpdateIntent,
): Effect.Effect<
  void,
  AppError,
  RegistryPort | PromptPort | VFSPort | LockfilePort | JournalPort | ConfigTag | FileSystemPort
> =>
  Effect.gen(function* () {
    const registry = yield* RegistryPort;
    const prompt = yield* PromptPort;
    const vfsPort = yield* VFSPort;
    const lf = yield* LockfilePort;
    const journal = yield* JournalPort;
    const config = yield* ConfigTag;
    const fs = yield* FileSystemPort;

    // ── load_lockfile ────────────────────────────────────────────────────────
    const lockfile = yield* lf
      .read(intent.flags.cwd)
      .pipe(
        Effect.catchAll(() =>
          Effect.succeed({ lockfileVersion: 2, components: {} } as RegpickLockfile),
        ),
      );

    const componentNames = Object.keys(lockfile.components || {});
    if (componentNames.length === 0) {
      yield* prompt.info("No components installed. Nothing to update.");
      return;
    }

    const bySource = groupBySource(lockfile);
    const updates: DetectedUpdate[] = [];

    for (const source of Object.keys(bySource)) {
      const reg = yield* registry
        .loadManifest(source)
        .pipe(Effect.catchAll(() => Effect.succeed(null)));
      if (!reg) continue;

      for (const itemName of bySource[source]) {
        const lockItem = lockfile.components[itemName];
        const regItem = reg.items.find((i) => i.name === itemName);
        if (!regItem) continue;

        const resolvedFiles = yield* Effect.forEach(regItem.files, (f) =>
          Effect.gen(function* () {
            const content = yield* registry.loadFileContent(f, regItem);
            return { file: f, content };
          }),
        );

        const action = yield* buildUpdatePlanForItem(
          itemName,
          regItem,
          resolvedFiles as any,
          lockItem,
          intent.flags.cwd,
          config,
        );

        if (action.status === "requires-diff-prompt") {
          const detFiles = yield* Effect.forEach(action.files, (af) =>
            Effect.gen(function* () {
              let localContent = "";
              const exists = yield* fs.pathExists(af.target);
              if (exists) {
                const b = yield* fs.readFile(af.target, "utf-8");
                localContent = typeof b === "string" ? b : b.toString();
              }
              return {
                target: af.target,
                remoteContent: af.content,
                localContent,
              };
            }),
          );

          updates.push({
            itemName,
            newFiles: action.newFiles,
            files: Array.from(detFiles),
            version: regItem.version,
            dependencies: regItem.dependencies,
            source: source,
          });
        }
      }
    }

    if (updates.length === 0) {
      yield* prompt.info("All components are up to date.");
      return;
    }

    let approvedUpdates: DetectedUpdate[] = [];
    if (intent.flags.all || intent.flags.yes) {
      approvedUpdates = updates;
    } else {
      const selectedNames = yield* prompt.multiselect({
        message: "Select components to update",
        options: updates.map((u) => ({ value: u.itemName, label: u.itemName })),
      });
      approvedUpdates = updates.filter((u) => selectedNames.includes(u.itemName));
    }

    const approvedCount = approvedUpdates.length;
    if (approvedCount === 0) {
      yield* prompt.info("No updates approved.");
      return;
    }

    const vfsFiles: VFSFile[] = [];
    for (const update of approvedUpdates) {
      for (const file of update.files) {
        vfsFiles.push({ id: file.target, content: file.remoteContent });
      }
    }

    const lockfileBackup = lockfile;

    // ── BARIERA: write_journal ───────────────────────────────────────────────
    const journalEntry: JournalEntry = {
      id: crypto.randomUUID(),
      command: "update",
      status: "pending",
      currentStep: "write_journal",
      lastCompletedStep: "transform_files",
      plannedFiles: vfsFiles.map((f) => f.id),
      lockfileBackup: lockfileBackup as any,
      lockfilePath: getLockfilePath(intent.flags.cwd),
    };
    yield* journal.write(journalEntry, intent.flags.cwd);

    // ── hydrate_and_transform_files ──────────────────────────────────────────
    const transformPlugins = resolveTransformPlugins(config);
    const vfsOutput = yield* vfsPort.transform(vfsFiles as any, transformPlugins, {
      cwd: intent.flags.cwd,
      config,
    });

    // ── commit_files ─────────────────────────────────────────────────────────
    yield* vfsPort.flush(vfsOutput, intent.flags.cwd);
    yield* journal.updateStep(journalEntry.id, "commit_files", intent.flags.cwd);

    // ── commit_lockfile ──────────────────────────────────────────────────────
    const newLockfile = { ...lockfileBackup, components: { ...lockfileBackup.components } };
    for (const update of approvedUpdates) {
      newLockfile.components[update.itemName] = {
        ...newLockfile.components[update.itemName],
        files: update.newFiles,
        installedAt: new Date().toISOString(),
        version: update.version || newLockfile.components[update.itemName].version,
        dependencies: update.dependencies || newLockfile.components[update.itemName].dependencies,
        source: update.source || newLockfile.components[update.itemName].source,
      };
    }

    yield* lf.write(intent.flags.cwd, newLockfile);
    yield* journal.updateStep(journalEntry.id, "commit_lockfile", intent.flags.cwd);

    yield* journal.clear(intent.flags.cwd);
    yield* prompt.success(`Updated ${approvedCount} components.`);
  });
