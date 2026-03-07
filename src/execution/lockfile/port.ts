import type { FileSystemError } from "@/core/errors.js";
import type { RegpickLockfile } from "@/domain/models/state.js";
import { Context, Effect } from "effect";

export class LockfilePort extends Context.Tag("LockfilePort")<
  LockfilePort,
  {
    read(cwd: string): Effect.Effect<RegpickLockfile, never>;
    write(cwd: string, lockfile: RegpickLockfile): Effect.Effect<void, FileSystemError>;
  }
>() {}
