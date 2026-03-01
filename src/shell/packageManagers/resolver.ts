import path from "node:path";

import type { RuntimePackageManager } from "@/shell/packageManagers/strategy.js";
import type { RuntimePorts } from "@/shell/runtime/ports.js";
import type { PackageManager } from "@/types.js";

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
