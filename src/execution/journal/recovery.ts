import { JournalEntry } from "@/domain/models/index.js";
import { Effect } from "effect";

export type RecoveryAction = "rollback_files" | "rollback_full" | "cleanup_journal" | "none";

/**
 * Pure function to determine what to do with a failed or interrupted journal entry.
 */
export function determineRecoveryAction(entry: JournalEntry): RecoveryAction {
  if (entry.status !== "pending") {
    return "cleanup_journal";
  }

  // If the last step was write_journal, we haven't committed the lockfile yet.
  // We might have written some files. Roll them back.
  if (
    entry.lastCompletedStep === "write_journal" ||
    entry.lastCompletedStep === "hydrate_files" ||
    entry.lastCompletedStep === "transform_files"
  ) {
    return "rollback_files";
  }

  // If we completed commit_files but not finalize, lockfile might be in an inconsistent state or completed.
  // We need to do a full rollback (files + lockfile).
  if (
    entry.lastCompletedStep === "commit_files" ||
    entry.lastCompletedStep === "commit_lockfile" ||
    entry.lastCompletedStep === "reconcile_deps"
  ) {
    return "rollback_full";
  }

  return "none";
}

export interface RecoveryPorts {
  removeFile: (path: string) => Effect.Effect<void, Error, never>;
  restoreLockfile: (path: string, lockfile: any) => Effect.Effect<void, Error, never>;
  deleteJournalEntry: (id: string) => Effect.Effect<void, Error, never>;
}

/**
 * Execute a recovery plan based on the ports given
 */
export function executeRecovery(
  entry: JournalEntry,
  ports: RecoveryPorts,
): Effect.Effect<void, Error, never> {
  return Effect.gen(function* () {
    const action = determineRecoveryAction(entry);

    if (action === "rollback_files" || action === "rollback_full") {
      for (const file of entry.plannedFiles || []) {
        yield* Effect.catchAll(ports.removeFile(file), () => Effect.succeed(undefined));
      }
    }

    if (action === "rollback_full" && entry.lockfileBackup) {
      yield* Effect.catchAll(ports.restoreLockfile(entry.lockfilePath, entry.lockfileBackup), () =>
        Effect.succeed(undefined),
      );
    }

    if (action !== "none") {
      yield* Effect.catchAll(ports.deleteJournalEntry(entry.id), () => Effect.succeed(undefined));
    }
  });
}
