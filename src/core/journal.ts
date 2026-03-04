import { Context, Effect } from "effect";
import path from "node:path";
import { writeLockfile } from "../shell/lockfile.js";
import { Runtime } from "../shell/runtime/ports.js";
import type { JournalEntry } from "../types.js";
import { type AppError } from "./errors.js";

function getJournalPath(cwd: string): string {
  return path.join(cwd, "node_modules", ".cache", "regpick", "journal.json");
}

export class JournalService extends Context.Tag("JournalService")<
  JournalService,
  {
    readonly writeIntent: (
      entry: JournalEntry,
      cwd: string,
    ) => Effect.Effect<void, AppError, Runtime>;
    readonly clearIntent: (cwd: string) => Effect.Effect<void, never, Runtime>;
    readonly rollbackIntent: (cwd: string) => Effect.Effect<boolean, AppError, Runtime>;
  }
>() {}

export const JournalServiceImpl = JournalService.of({
  writeIntent: (entry: JournalEntry, cwd: string) =>
    Effect.gen(function* () {
      const runtime = yield* Runtime;
      const journalPath = getJournalPath(cwd);

      yield* runtime.fs.ensureDir(path.dirname(journalPath));
      yield* runtime.fs.writeJson(journalPath, entry, { spaces: 2 });
    }),

  clearIntent: (cwd: string) =>
    Effect.gen(function* () {
      const runtime = yield* Runtime;
      const journalPath = getJournalPath(cwd);

      yield* runtime.fs.remove(journalPath).pipe(Effect.ignore);
    }),

  rollbackIntent: (cwd: string) =>
    Effect.gen(function* () {
      const runtime = yield* Runtime;
      const journalPath = getJournalPath(cwd);

      const exists = yield* runtime.fs.pathExists(journalPath);
      if (!exists) return false;

      const entry = yield* runtime.fs
        .readJsonSync<JournalEntry>(journalPath)
        .pipe(Effect.catchAll(() => Effect.succeed(null)));

      if (!entry || entry.status !== "pending") {
        yield* runtime.fs.remove(journalPath).pipe(Effect.ignore);
        return false;
      }

      // Rollback planned files
      for (const filePath of entry.plannedFiles || []) {
        yield* runtime.fs.remove(filePath).pipe(Effect.ignore);
      }

      // Rollback lockfile
      if (entry.lockfileBackup) {
        yield* writeLockfile(cwd, entry.lockfileBackup!, runtime).pipe(Effect.ignore);
      }

      // Clean up the journal
      yield* runtime.fs.remove(journalPath).pipe(Effect.ignore);
      return true;
    }),
});
