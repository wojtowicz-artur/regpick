import type { FileSystemError } from "@/core/errors.js";
import type { JournalEntry, WorkflowStep } from "@/domain/models/state.js";
import { Context, Effect } from "effect";

export class JournalPort extends Context.Tag("JournalPort")<
  JournalPort,
  {
    write(entry: JournalEntry, cwd: string): Effect.Effect<void, FileSystemError>;
    updateStep(
      journalId: string,
      completedStep: WorkflowStep,
      cwd: string,
    ): Effect.Effect<void, FileSystemError>;
    clear(cwd: string): Effect.Effect<void, never>;
    read(cwd: string): Effect.Effect<JournalEntry | null, never>;
  }
>() {}
