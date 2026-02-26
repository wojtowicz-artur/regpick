import path from "node:path";

import type { OverwritePolicy, RegpickConfig, RegistryItem } from "../types.js";
import { appError, type AppError } from "../core/errors.js";
import { err, ok, type Result } from "../core/result.js";
import { resolveOutputPathFromPolicy } from "../domain/pathPolicy.js";
import {
  getPackageManagerStrategy,
  type RuntimePackageManager,
} from "../shell/packageManagers/strategy.js";
import type { RuntimePorts } from "../shell/runtime/ports.js";
import { resolvePackageManager } from "../shell/packageManagers/resolver.js";

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function collectMissingDependencies(
  items: RegistryItem[],
  cwd: string,
  runtime: RuntimePorts,
): { missingDependencies: string[]; missingDevDependencies: string[] } {
  const packageJsonPath = path.join(cwd, "package.json");
  if (!runtime.fs.existsSync(packageJsonPath)) {
    return { missingDependencies: [], missingDevDependencies: [] };
  }

  const packageJsonResult = runtime.fs.readJsonSync<{
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  }>(packageJsonPath);
  const packageJson = packageJsonResult.ok ? packageJsonResult.value : {};
  const declared = {
    ...(packageJson.dependencies || {}),
    ...(packageJson.devDependencies || {}),
    ...(packageJson.peerDependencies || {}),
  };

  const allDeps = unique(items.flatMap((item) => item.dependencies || []));
  const allDevDeps = unique(items.flatMap((item) => item.devDependencies || []));

  const missingDependencies = allDeps.filter((dep) => !declared[dep]);
  const missingDevDependencies = allDevDeps.filter((dep) => !declared[dep]);

  return { missingDependencies, missingDevDependencies };
}

export function installDependencies(
  cwd: string,
  packageManager: RuntimePackageManager,
  dependencies: string[],
  devDependencies: string[],
  runtime: RuntimePorts,
): Result<void, AppError> {
  if (!dependencies.length && !devDependencies.length) {
    return ok(undefined);
  }

  const strategy = getPackageManagerStrategy(packageManager);
  const commands = strategy.buildInstallCommands(dependencies, devDependencies);
  for (const command of commands) {
    const result = runtime.process.run(command.command, command.args, cwd);
    if (result.status !== 0) {
      return err(appError("InstallError", `Dependency install failed: ${command.command} ${command.args.join(" ")}`));
    }
  }
  return ok(undefined);
}

