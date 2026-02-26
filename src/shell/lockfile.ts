import path from "node:path";
import crypto from "node:crypto";
import type { RuntimePorts } from "./runtime/ports.js";
import type { RegpickLockfile } from "../types.js";

const LOCKFILE_NAME = "regpick-lock.json";

export function getLockfilePath(cwd: string): string {
  return path.join(cwd, LOCKFILE_NAME);
}

export async function readLockfile(cwd: string, runtime: RuntimePorts): Promise<RegpickLockfile> {
  const lockfilePath = getLockfilePath(cwd);
  const exists = await runtime.fs.pathExists(lockfilePath);

  if (!exists) {
    return { components: {} };
  }

  const readRes = runtime.fs.readJsonSync<RegpickLockfile>(lockfilePath);
  if (!readRes.ok) {
    return { components: {} };
  }

  return readRes.value;
}

export async function writeLockfile(cwd: string, lockfile: RegpickLockfile, runtime: RuntimePorts): Promise<void> {
  const lockfilePath = getLockfilePath(cwd);
  await runtime.fs.writeJson(lockfilePath, lockfile, { spaces: 2 });
}

export function computeHash(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}
