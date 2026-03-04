import { Array, Effect, Schema as S } from "effect";
import path from "node:path";

import { appError, type AppError } from "@/core/errors.js";
import { getPackageManagerPlugin } from "@/shell/packageManagers/strategy.js";
import type { RuntimePorts } from "@/core/ports.js";
import type { RegistryItem, RegpickConfig } from "@/types.js";

const PackageJsonSchema = S.Struct({
  dependencies: S.optionalWith(S.Record({ key: S.String, value: S.String }), {
    exact: true,
    default: () => ({}),
  }),
  devDependencies: S.optionalWith(S.Record({ key: S.String, value: S.String }), {
    exact: true,
    default: () => ({}),
  }),
  peerDependencies: S.optionalWith(S.Record({ key: S.String, value: S.String }), {
    exact: true,
    default: () => ({}),
  }),
});

export function collectMissingDependencies(
  items: RegistryItem[],
  cwd: string,
  runtime: RuntimePorts,
): Effect.Effect<
  { missingDependencies: string[]; missingDevDependencies: string[] },
  never,
  never
> {
  return Effect.gen(function* () {
    const packageJsonPath = path.join(cwd, "package.json");
    if (!runtime.fs.existsSync(packageJsonPath)) {
      return { missingDependencies: [], missingDevDependencies: [] };
    }

    const packageJsonResult = yield* Effect.exit(runtime.fs.readJsonSync<unknown>(packageJsonPath));
    const parsed = packageJsonResult._tag === "Success" ? packageJsonResult.value : {};

    const safeParseResult = S.decodeUnknownEither(PackageJsonSchema)(parsed);
    const packageJson =
      safeParseResult._tag === "Right"
        ? safeParseResult.right
        : { dependencies: {}, devDependencies: {}, peerDependencies: {} };

    const declared = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
      ...packageJson.peerDependencies,
    };

    const allDeps = Array.dedupe(items.flatMap((item) => item.dependencies || []).filter(Boolean));
    const allDevDeps = Array.dedupe(
      items.flatMap((item) => item.devDependencies || []).filter(Boolean),
    );

    const missingDependencies = allDeps.filter((dep) => !(declared as Record<string, string>)[dep]);
    const missingDevDependencies = allDevDeps.filter(
      (dep) => !(declared as Record<string, string>)[dep],
    );

    return { missingDependencies, missingDevDependencies };
  });
}

export function installDependencies(
  cwd: string,
  packageManager: string,
  dependencies: string[],
  devDependencies: string[],
  runtime: RuntimePorts,
  config: RegpickConfig,
): Effect.Effect<void, AppError, never> {
  return Effect.gen(function* () {
    if (!dependencies.length && !devDependencies.length) {
      return;
    }

    const strategy = getPackageManagerPlugin(packageManager, config);
    if (!strategy) {
      return yield* Effect.fail(
        appError("InstallError", `Unknown package manager: ${packageManager}`),
      );
    }
    const commands = strategy.buildInstallCommands(dependencies, devDependencies);

    yield* Effect.forEach(
      commands,
      (command) =>
        Effect.gen(function* () {
          const result = runtime.process.run(command.command, command.args, cwd);
          if (result.status !== 0) {
            return yield* Effect.fail(
              appError(
                "InstallError",
                `Dependency install failed: ${command.command} ${command.args.join(" ")}`,
              ),
            );
          }
        }),
      { concurrency: 1 },
    );
  });
}
