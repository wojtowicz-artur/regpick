import { Context, Effect } from "effect";
import { Runtime } from "@/core/ports.js";
import type { JournalEntry } from "@/types.js";
import { type AppError } from "./errors.js";

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
