import { JournalEntry } from "@/domain/models/index.js";
import { Effect } from "effect";

export type RecoveryAction =
  | "rollback_files"
  | "rollback_full"
  | "restore_lockfile_only"
  | "warn_deps_incomplete"
  | "cleanup_journal"
  | "none";

/**
 * Pure function to determine what to do with a failed or interrupted journal entry.
 */
export function determineRecoveryAction(entry: JournalEntry): RecoveryAction {
  if (entry.status !== "pending") {
    return "cleanup_journal";
  }

  switch (entry.lastCompletedStep) {
    case "write_journal":
    case "hydrate_files":
    case "transform_files":
      return "rollback_files";

    case "commit_files":
      return "rollback_full";

    case "commit_lockfile":
      return "restore_lockfile_only";

    case "reconcile_deps":
    case "finalize":
      return "warn_deps_incomplete";

    default:
      return "cleanup_journal";
  }
}

export interface RecoveryPorts {
  removeFile: (path: string) => Effect.Effect<void, Error, never>;
  restoreLockfile: (path: string, lockfile: any) => Effect.Effect<void, Error, never>;
  deleteJournalEntry: (id: string) => Effect.Effect<void, Error, never>;
  warn?: (msg: string) => Effect.Effect<void, Error, never>;
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

    if (
      (action === "rollback_full" || action === "restore_lockfile_only") &&
      entry.lockfileBackup
    ) {
      yield* Effect.catchAll(ports.restoreLockfile(entry.lockfilePath, entry.lockfileBackup), () =>
        Effect.succeed(undefined),
      );
    }

    if (action === "warn_deps_incomplete" && ports.warn) {
      yield* Effect.catchAll(
        ports.warn(
          "Previous install completed but dependency installation may be incomplete. Run your package manager manually if needed.",
        ),
        () => Effect.succeed(undefined),
      );
    }

    if (action !== "none") {
      yield* Effect.catchAll(ports.deleteJournalEntry(entry.id), () => Effect.succeed(undefined));
    }
  });
}
