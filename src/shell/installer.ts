import path from "node:path";
import * as v from "valibot";

import { appError, type AppError } from "@/core/errors.js";
import { err, ok, type Result } from "@/core/result.js";
import { getPackageManagerPlugin } from "@/shell/packageManagers/strategy.js";
import type { RuntimePorts } from "@/shell/runtime/ports.js";
import type { RegistryItem, RegpickConfig } from "@/types.js";

const PackageJsonSchema = v.object({
  dependencies: v.optional(v.record(v.string(), v.string()), {}),
  devDependencies: v.optional(v.record(v.string(), v.string()), {}),
  peerDependencies: v.optional(v.record(v.string(), v.string()), {}),
});

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

  const packageJsonResult = runtime.fs.readJsonSync<unknown>(packageJsonPath);
  const parsed = packageJsonResult.ok ? packageJsonResult.value : {};

  const safeParseResult = v.safeParse(PackageJsonSchema, parsed);
  const packageJson = safeParseResult.success
    ? safeParseResult.output
    : { dependencies: {}, devDependencies: {}, peerDependencies: {} };

  const declared = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
    ...packageJson.peerDependencies,
  };

  const allDeps = unique(items.flatMap((item) => item.dependencies || []));
  const allDevDeps = unique(items.flatMap((item) => item.devDependencies || []));

  const missingDependencies = allDeps.filter((dep) => !declared[dep]);
  const missingDevDependencies = allDevDeps.filter((dep) => !declared[dep]);

  return { missingDependencies, missingDevDependencies };
}

export function installDependencies(
  cwd: string,
  packageManager: string,
  dependencies: string[],
  devDependencies: string[],
  runtime: RuntimePorts,
  config: RegpickConfig,
): Result<void, AppError> {
  if (!dependencies.length && !devDependencies.length) {
    return ok(undefined);
  }

  const strategy = getPackageManagerPlugin(packageManager, config);
  if (!strategy) {
    return err(appError("InstallError", `Unknown package manager: ${packageManager}`));
  }
  const commands = strategy.buildInstallCommands(dependencies, devDependencies);
  for (const command of commands) {
    const result = runtime.process.run(command.command, command.args, cwd);
    if (result.status !== 0) {
      return err(
        appError(
          "InstallError",
          `Dependency install failed: ${command.command} ${command.args.join(" ")}`,
        ),
      );
    }
  }
  return ok(undefined);
}
