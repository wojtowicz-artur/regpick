import { FileSystemError } from "@/core/errors.js";
import { RegpickLockfile } from "@/domain/models/state.js";
import { Effect } from "effect";
import fs from "fs/promises";
import path from "path";
import { LockfilePort } from "./port.js";

const LOCKFILE_NAME = "regpick.lock.json";

function getEmptyLockfile(): RegpickLockfile {
  return { lockfileVersion: 2, components: {} };
}

export const LockfileService = LockfilePort.of({
  read: (cwd: string) => {
    return Effect.gen(function* () {
      const lockfilePath = path.join(cwd, LOCKFILE_NAME);
      const content = yield* Effect.tryPromise({
        try: () => fs.readFile(lockfilePath, "utf-8"),
        catch: () => null, // If completely missing, we return empty later
      });

      if (!content) {
        return getEmptyLockfile();
      }

      try {
        const parsed = JSON.parse(content);
        if (!parsed.components || (parsed.lockfileVersion !== 2 && parsed.lockfileVersion !== 1)) {
          return getEmptyLockfile();
        }
        // Basic normalization if needed
        return {
          lockfileVersion: 2,
          components: parsed.components || {},
        } as RegpickLockfile;
      } catch {
        return getEmptyLockfile();
      }
    }).pipe(Effect.catchAll(() => Effect.succeed(getEmptyLockfile())));
  },

  write: (cwd: string, lockfile: RegpickLockfile) => {
    return Effect.gen(function* () {
      const lockfilePath = path.join(cwd, LOCKFILE_NAME);
      const json = JSON.stringify(lockfile, null, 2);

      yield* Effect.tryPromise({
        try: () => fs.writeFile(lockfilePath, json, "utf-8"),
        catch: (e) =>
          new FileSystemError({
            message: `Failed to write lockfile to ${lockfilePath}`,
            cause: e as Error,
          }),
      });
    });
  },
});

export const LockfileServiceLayer = Effect.succeed(LockfileService);

import crypto from "node:crypto";
export function computeHash(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}
