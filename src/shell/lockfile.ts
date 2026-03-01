import type { RuntimePorts } from "@/shell/runtime/ports.js";
import type { RegpickLockfile } from "@/types.js";
import crypto from "node:crypto";
import path from "node:path";
import * as v from "valibot";

const LOCKFILE_NAME = "regpick-lock.json";

export const RegpickLockfileSchema = v.object({
  components: v.record(
    v.string(),
    v.object({
      version: v.optional(v.string()),
      source: v.optional(v.string()),
      hash: v.string(),
    }),
  ),
});

export function getLockfilePath(cwd: string): string {
  return path.join(cwd, LOCKFILE_NAME);
}

export async function readLockfile(cwd: string, runtime: RuntimePorts): Promise<RegpickLockfile> {
  const lockfilePath = getLockfilePath(cwd);
  const exists = await runtime.fs.pathExists(lockfilePath);

  if (!exists) {
    return { components: {} };
  }

  const readRes = runtime.fs.readJsonSync<unknown>(lockfilePath);
  if (!readRes.ok) {
    return { components: {} };
  }

  try {
    const parsed = v.parse(RegpickLockfileSchema, readRes.value);
    return parsed as RegpickLockfile;
  } catch {
    return { components: {} };
  }
}

export async function writeLockfile(
  cwd: string,
  lockfile: RegpickLockfile,
  runtime: RuntimePorts,
): Promise<void> {
  const lockfilePath = getLockfilePath(cwd);
  await runtime.fs.writeJson(lockfilePath, lockfile, { spaces: 2 });
}

export function computeHash(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}
