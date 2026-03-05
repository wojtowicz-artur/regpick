import { Effect } from "effect";
import path from "node:path";

import type { RegistryFile, RegistryItem, RegpickConfig } from "@/types.js";

import { appError, type AppError } from "@/core/errors.js";

function normalizeSlashes(relativePath: string): string {
  return relativePath.replace(/\\/g, "/");
}

function assertInsideProject(
  projectRoot: string,
  outputPath: string,
  allowOutsideProject: boolean,
): Effect.Effect<void, AppError> {
  const projectRootWithSep = `${path.resolve(projectRoot)}${path.sep}`;
  const resolvedOutput = path.resolve(outputPath);
  if (allowOutsideProject) {
    return Effect.succeed(undefined);
  }
  if (
    resolvedOutput !== path.resolve(projectRoot) &&
    !resolvedOutput.startsWith(projectRootWithSep)
  ) {
    return Effect.fail(
      appError("ValidationError", `Refusing to write outside project: ${resolvedOutput}`),
    );
  }
  return Effect.succeed(undefined);
}

export const resolveOutputPathFromPolicy = (
  item: RegistryItem,
  file: RegistryFile,
  cwd: string,
  config: RegpickConfig,
): Effect.Effect<{ absoluteTarget: string; relativeTarget: string }, AppError> =>
  Effect.gen(function* () {
    const typeKey = file.type || item.type || "registry:file";
    const mappedBase = config.resolve.targets[typeKey];
    const preferManifestTarget = config.registry.preferManifestTarget;
    const fallbackFileName = path.basename(file.path || `${item.name}.txt`);

    let relativeTarget: string;
    if (preferManifestTarget && file.target) {
      relativeTarget = file.target;
    } else if (mappedBase) {
      relativeTarget = path.join(mappedBase, fallbackFileName);
    } else if (file.target) {
      relativeTarget = file.target;
    } else {
      relativeTarget = path.join("src", fallbackFileName);
    }

    // Allow custom path resolvers to override the fallback logic
    if (config.plugins && config.plugins.length > 0) {
      for (const resolver of config.plugins) {
        if (
          typeof resolver === "object" &&
          resolver !== null &&
          "resolvePath" in resolver &&
          typeof resolver.resolvePath === "function"
        ) {
          const resolved = resolver.resolvePath(file, item, relativeTarget, config);
          if (resolved) {
            relativeTarget = resolved;
            break;
          }
        }
      }
    }

    const absoluteTarget = path.resolve(cwd, relativeTarget);
    yield* assertInsideProject(cwd, absoluteTarget, config.install.allowOutsideProject);

    return yield* Effect.succeed({
      absoluteTarget,
      relativeTarget: normalizeSlashes(path.relative(cwd, absoluteTarget)),
    });
  });
