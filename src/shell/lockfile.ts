import type { RuntimePorts } from "@/shell/runtime/ports.js";
import { Effect, Schema as S } from "effect";
import crypto from "node:crypto";
import path from "node:path";

const LOCKFILE_NAME = "regpick-lock.json";

export const LockfileItemSchema = S.mutable(
  S.Struct({
    version: S.optionalWith(S.String, { exact: true }),
    source: S.optionalWith(S.String, { exact: true }),
    hash: S.optionalWith(S.String, { exact: true }),
    remoteHash: S.optionalWith(S.String, { exact: true }),
    localHash: S.optionalWith(S.String, { exact: true }),
  }),
);
export type LockfileItem = S.Schema.Type<typeof LockfileItemSchema>;

export const RegpickLockfileSchema = S.mutable(
  S.Struct({
    components: S.mutable(S.Record({ key: S.String, value: LockfileItemSchema })),
  }),
);
export type RegpickLockfile = {
  components: Record<string, LockfileItem>;
};

export function getLockfilePath(cwd: string): string {
  return path.join(cwd, LOCKFILE_NAME);
}

export function readLockfile(cwd: string, runtime: RuntimePorts) {
  const lockfilePath = getLockfilePath(cwd);

  return Effect.gen(function* () {
    const exists = yield* runtime.fs.pathExists(lockfilePath);
    if (!exists) {
      return { components: {} };
    }

    const readRes = yield* Effect.exit(runtime.fs.readJsonSync<unknown>(lockfilePath));
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
  });
}

export function writeLockfile(cwd: string, lockfile: RegpickLockfile, runtime: RuntimePorts) {
  const lockfilePath = getLockfilePath(cwd);
  return runtime.fs.writeJson(lockfilePath, lockfile, { spaces: 2 });
}

export function computeHash(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

export function computeTreeHash(files: { path: string; content: string }[]): string {
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  const treeStr = sorted.map((f) => `${f.path}:${f.content}`).join("\n---\n");
  return crypto.createHash("sha256").update(treeStr).digest("hex");
}
