import { Either } from "effect";
import type { RuntimePorts } from "@/shell/runtime/ports.js";
import { Effect, Schema as S } from "effect";
import crypto from "node:crypto";
import path from "node:path";

const LOCKFILE_NAME = "regpick-lock.json";

export const LockfileItemSchema = S.mutable(
  S.Struct({
    version: S.optionalWith(S.String, { exact: true }),
    source: S.optionalWith(S.String, { exact: true }),
    hash: S.String,
  }),
);
export type LockfileItem = S.Schema.Type<typeof LockfileItemSchema>;

export const RegpickLockfileSchema = S.mutable(
  S.Struct({
    components: S.Record({ key: S.String, value: LockfileItemSchema }),
  }),
);
export type RegpickLockfile = {
  components: Record<string, LockfileItem>;
};

export function getLockfilePath(cwd: string): string {
  return path.join(cwd, LOCKFILE_NAME);
}

export async function readLockfile(cwd: string, runtime: RuntimePorts): Promise<RegpickLockfile> {
  const lockfilePath = getLockfilePath(cwd);
  const exists = await Effect.runPromise(runtime.fs.pathExists(lockfilePath));

  if (!exists) {
    return { components: {} };
  }

  const readRes = Effect.runSyncExit(runtime.fs.readJsonSync<unknown>(lockfilePath));
  if (readRes._tag !== "Success") {
    return { components: {} };
  }

  const decodeEither = S.decodeUnknownEither(RegpickLockfileSchema);
  const parsed = decodeEither(readRes.value);
  if (parsed._tag === "Right") {
    return parsed.right;
  } else {
    return { components: {} };
  }
}

export async function writeLockfile(
  cwd: string,
  lockfile: RegpickLockfile,
  runtime: RuntimePorts,
): Promise<void> {
  const lockfilePath = getLockfilePath(cwd);
  await Effect.runPromise(runtime.fs.writeJson(lockfilePath, lockfile, { spaces: 2 }));
}

export function computeHash(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}
