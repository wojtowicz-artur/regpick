import { FileSystemError } from "@/core/errors.js";
import { JournalEntry, WorkflowStep } from "@/domain/models/state.js";
import { Effect } from "effect";
import fs from "fs/promises";
import path from "path";
import { JournalPort } from "./port.js";

const JOURNAL_NAME = ".regpick-journal.json";

export const JournalService = JournalPort.of({
  write: (entry: JournalEntry, cwd: string) => {
    return Effect.gen(function* () {
      const journalPath = path.join(cwd, JOURNAL_NAME);
      const json = JSON.stringify(entry, null, 2);

      yield* Effect.tryPromise({
        try: () => fs.writeFile(journalPath, json, "utf-8"),
        catch: (e) =>
          new FileSystemError({
            message: `Failed to write journal to ${journalPath}`,
            cause: e as Error,
          }),
      });
    });
  },

  updateStep: (journalId: string, completedStep: WorkflowStep, cwd: string) => {
    return Effect.gen(function* () {
      const journalPath = path.join(cwd, JOURNAL_NAME);
      const content = yield* Effect.tryPromise({
        try: () => fs.readFile(journalPath, "utf-8"),
        catch: (e) =>
          new FileSystemError({
            message: `Failed to read journal for update at ${journalPath}`,
            cause: e as Error,
          }),
      });

      const entry: JournalEntry = JSON.parse(content);
      if (entry.id !== journalId) {
        return yield* Effect.fail(new FileSystemError({ message: `Journal ID mismatch` }));
      }

      entry.lastCompletedStep = completedStep;

      yield* Effect.tryPromise({
        try: () => fs.writeFile(journalPath, JSON.stringify(entry, null, 2), "utf-8"),
        catch: (e) =>
          new FileSystemError({
            message: `Failed to update journal step at ${journalPath}`,
            cause: e as Error,
          }),
      });
    });
  },

  clear: (cwd: string) => {
    const journalPath = path.join(cwd, JOURNAL_NAME);
    return (
      Effect.tryPromise({
        try: () => fs.unlink(journalPath),
        catch: () => false, // Ignore if doesn't exist
      })
        .pipe(Effect.catchAll(() => Effect.succeed(undefined)))
        // We map the return to void explicitly as requested by Signature
        .pipe(Effect.map(() => undefined))
    );
  },

  read: (cwd: string) => {
    const journalPath = path.join(cwd, JOURNAL_NAME);
    return Effect.tryPromise({
      try: () => fs.readFile(journalPath, "utf-8"),
      catch: () => null, // If completely missing
    }).pipe(
      Effect.map((content) => {
        if (!content) return null;
        try {
          return JSON.parse(content) as JournalEntry;
        } catch {
          return null;
        }
      }),
      Effect.catchAll(() => Effect.succeed(null)),
    );
  },
});

export const JournalServiceLayer = Effect.succeed(JournalService);
