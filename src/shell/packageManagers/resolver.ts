import path from "node:path";

import type { PackageManager } from "../../types.js";
import type { RuntimePorts } from "../runtime/ports.js";
import type { RuntimePackageManager } from "./strategy.js";

export function resolvePackageManager(
  cwd: string,
  configured: PackageManager,
  runtime: RuntimePorts,
): RuntimePackageManager {
  if (configured && configured !== "auto") {
    return configured;
  }

  if (runtime.fs.existsSync(path.join(cwd, "pnpm-lock.yaml"))) {
    return "pnpm";
  }
  if (runtime.fs.existsSync(path.join(cwd, "yarn.lock"))) {
    return "yarn";
  }
  if (runtime.fs.existsSync(path.join(cwd, "package-lock.json"))) {
    return "npm";
  }

  return "npm";
}
