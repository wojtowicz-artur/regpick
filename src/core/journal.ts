import { FileSystemPort } from "@/core/ports.js";
import type { JournalEntry } from "@/types.js";
import { Context, Effect } from "effect";
import { type AppError } from "./errors.js";

export class JournalService extends Context.Tag("JournalService")<
  JournalService,
  {
    readonly writeIntent: (
      entry: JournalEntry,
      cwd: string,
    ) => Effect.Effect<void, AppError, FileSystemPort>;
    readonly clearIntent: (cwd: string) => Effect.Effect<void, never, FileSystemPort>;
    readonly rollbackIntent: (cwd: string) => Effect.Effect<boolean, AppError, FileSystemPort>;
  }
>() {}
