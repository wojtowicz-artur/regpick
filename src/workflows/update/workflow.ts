import { ConfigTag } from "@/core/context.js";
import { type AppError } from "@/core/errors.js";
import { Effect } from "effect";
import crypto from "node:crypto";
import * as path from "node:path";

import type { UpdateIntent } from "@/domain/models/intent.js";
import type { JournalEntry } from "@/domain/models/state.js";
import { ExecPort } from "@/execution/exec/port.js";
import { JournalPort } from "@/execution/journal/port.js";
import { LockfilePort } from "@/execution/lockfile/port.js";
import { VFSPort } from "@/execution/vfs/port.js";
import { PromptPort } from "@/interfaces/prompt/port.js";
import { RegistryPort } from "@/registry/port.js";

// TODO: stubbed or imported missing domain logic
function queryAvailableUpdates(lockfile: any, plugins: any) {
  return Effect.succeed([]);
}

function queryUserUpdateApproval(updates: any) {
  return Effect.succeed({ approvedUpdates: [] });
}

function getLockfilePath(cwd: string) {
  return path.join(cwd, "regpick-lock.json");
}

function buildNewLockfile(backup: any, plan: any, vfsOut: any): any {
  return backup || {};
}

function resolveTransformPlugins(config: any) {
  return [];
}

export const updateWorkflow = (
  intent: UpdateIntent,
): Effect.Effect<
  void,
  AppError,
  RegistryPort | PromptPort | VFSPort | ExecPort | LockfilePort | JournalPort | ConfigTag
> =>
  Effect.gen(function* () {
    const registry = yield* RegistryPort;
    const prompt = yield* PromptPort;
    const vfsPort = yield* VFSPort;
    const exec = yield* ExecPort;
    const lf = yield* LockfilePort;
    const journal = yield* JournalPort;
    const config = yield* ConfigTag;

    // ── load_lockfile ────────────────────────────────────────────────────────
    const lockfile = yield* lf
      .read(intent.flags.cwd)
      .pipe(Effect.catchAll(() => Effect.succeed({ components: {} } as any)));

    const componentNames = Object.keys(lockfile.components || {});
    if (componentNames.length === 0) {
      yield* prompt.info("No components installed. Nothing to update.");
      return;
    }

    const updates = yield* queryAvailableUpdates(lockfile, []);

    if (updates.length === 0) {
      yield* prompt.info("All components are up to date.");
      return;
    }

    let approvedPlan: any;
    if (intent.flags.all || intent.flags.yes) {
      approvedPlan = { approvedUpdates: updates };
    } else {
      approvedPlan = yield* queryUserUpdateApproval(updates);
    }

    const approvedCount = approvedPlan?.approvedUpdates?.length || 0;
    if (approvedCount === 0) {
      yield* prompt.info("No updates approved.");
      return;
    }

    const vfsFiles: { id: string; code: string }[] = [];
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

    // ── hydrate_and_transform_files (Mocked) ─────────────────────────────────
    const transformPlugins = resolveTransformPlugins(config);
    const vfsOutput = yield* vfsPort.transform(vfsFiles as any, transformPlugins, {
      cwd: intent.flags.cwd,
      config,
    });

    // ── commit_files ─────────────────────────────────────────────────────────
    yield* vfsPort.flush(vfsOutput, intent.flags.cwd);
    yield* journal.updateStep(journalEntry.id, "commit_files", intent.flags.cwd);

    // ── commit_lockfile ──────────────────────────────────────────────────────
    const newLockfile = buildNewLockfile(lockfileBackup, approvedPlan, vfsOutput);
    yield* lf.write(intent.flags.cwd, newLockfile);
    yield* journal.updateStep(journalEntry.id, "commit_lockfile", intent.flags.cwd);

    yield* prompt.success(`Updated ${approvedCount} components.`);
  });
