import path from "node:path";

import type { RegistryFile, RegistryItem, RegpickConfig } from "@/types.js";

import { appError, type AppError } from "@/core/errors.js";
import { err, ok, type Result } from "@/core/result.js";

function normalizeSlashes(relativePath: string): string {
  return relativePath.replace(/\\/g, "/");
}

function assertInsideProject(
  projectRoot: string,
  outputPath: string,
  allowOutsideProject: boolean,
): Result<void, AppError> {
  const projectRootWithSep = `${path.resolve(projectRoot)}${path.sep}`;
  const resolvedOutput = path.resolve(outputPath);
  if (allowOutsideProject) {
    return ok(undefined);
  }
  if (
    resolvedOutput !== path.resolve(projectRoot) &&
    !resolvedOutput.startsWith(projectRootWithSep)
  ) {
    return err(appError("ValidationError", `Refusing to write outside project: ${resolvedOutput}`));
  }
  return ok(undefined);
}

export function resolveOutputPathFromPolicy(
  item: RegistryItem,
  file: RegistryFile,
  cwd: string,
  config: RegpickConfig,
): Result<{ absoluteTarget: string; relativeTarget: string }, AppError> {
  const typeKey = file.type || item.type || "registry:file";
  const mappedBase = (config.resolve?.targets || {})?.[typeKey];
  const preferManifestTarget = (config.resolve?.preferManifestTarget ?? true) !== false;
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
      const resolved = resolver.resolvePath?.(file, item, relativeTarget, config);
      if (resolved) {
        relativeTarget = resolved;
        break;
      }
    }
  }

  const absoluteTarget = path.resolve(cwd, relativeTarget);
  const assertRes = assertInsideProject(
    cwd,
    absoluteTarget,
    Boolean(config.install?.allowOutsideProject || false),
  );
  if (!assertRes.ok) return assertRes;

  return ok({
    absoluteTarget,
    relativeTarget: normalizeSlashes(path.relative(cwd, absoluteTarget)),
  });
}
