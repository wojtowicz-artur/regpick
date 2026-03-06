import type { RuntimePorts } from "@/core/ports.js";
import { Effect, Schema as S } from "effect";
import crypto from "node:crypto";
import path from "node:path";

const LOCKFILE_NAME = "regpick-lock.json";

export const FileLockSchema = S.Struct({
  path: S.String,
  hash: S.optional(S.String),
});
export type FileLockItem = S.Schema.Type<typeof FileLockSchema>;

export const ComponentLockSchema = S.Struct({
  version: S.optional(S.String),
  installedAt: S.String,
  source: S.optional(S.String),
  dependencies: S.optional(S.mutable(S.Array(S.String))),
  files: S.mutable(S.Array(FileLockSchema)),
});
export type ComponentLockItem = S.Schema.Type<typeof ComponentLockSchema>;

export const RegpickLockfileSchema = S.mutable(
  S.Struct({
    lockfileVersion: S.Literal(2),
    components: S.mutable(S.Record({ key: S.String, value: ComponentLockSchema })),
  }),
);
export type RegpickLockfile = {
  lockfileVersion: 2;
  components: Record<string, ComponentLockItem>;
};

export function getLockfilePath(cwd: string): string {
  return path.join(cwd, LOCKFILE_NAME);
}

export function readLockfile(cwd: string, runtime: RuntimePorts) {
  const lockfilePath = getLockfilePath(cwd);

  return Effect.gen(function* () {
    const exists = yield* runtime.fs.pathExists(lockfilePath);
    if (!exists) {
      return { lockfileVersion: 2, components: {} } as RegpickLockfile;
    }

    const readRes = yield* Effect.exit(runtime.fs.readJsonSync<unknown>(lockfilePath));
    if (readRes._tag !== "Success") {
      return { lockfileVersion: 2, components: {} } as RegpickLockfile;
    }

    const decodeEither = S.decodeUnknownEither(RegpickLockfileSchema);
    const parsed = decodeEither(readRes.value);
    if (parsed._tag === "Right") {
      return parsed.right;
    } else {
      return { lockfileVersion: 2, components: {} } as RegpickLockfile;
    }
  });
}

export function writeLockfile(cwd: string, lockfile: RegpickLockfile, runtime: RuntimePorts) {
  const lockfilePath = getLockfilePath(cwd);

  const sortedComponents: Record<string, ComponentLockItem> = {};
  for (const key of Object.keys(lockfile.components).sort()) {
    const originalItem = lockfile.components[key] as ComponentLockItem;
    sortedComponents[key] = {
      ...originalItem,
      files: [...originalItem.files].sort((a, b) => a.path.localeCompare(b.path)),
    };
  }

  const output: RegpickLockfile = {
    lockfileVersion: 2,
    components: sortedComponents,
  };

  return runtime.fs.writeJson(lockfilePath, output, { spaces: 2 });
}

export function computeHash(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

export function computeTreeHash(files: { path: string; content: string }[]): string {
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  const treeStr = sorted.map((f) => `${f.path}:${f.content}`).join("\n---\n");
  return crypto.createHash("sha256").update(treeStr).digest("hex");
}
