import { Either } from "effect";
import type { AppError } from "@/core/errors.js";
import { applyAliases } from "@/domain/aliasCore.js";
import { resolveOutputPathFromPolicy } from "@/domain/pathPolicy.js";
import { computeHash } from "@/shell/lockfile.js";
import type { RegistryFile, RegistryItem, RegpickConfig, RegpickLockfile } from "@/types.js";

export type UpdateFile = {
  target: string;
  content: string;
};

export type UpdateAction = {
  itemName: string;
  status: "up-to-date" | "requires-diff-prompt";
  newHash: string;
  files: UpdateFile[];
};

export function groupBySource(lockfile: RegpickLockfile): Record<string, string[]> {
  const bySource: Record<string, string[]> = {};
  for (const name of Object.keys(lockfile.components)) {
    const source = lockfile.components[name].source;
    if (source) {
      if (!bySource[source]) bySource[source] = [];
      bySource[source].push(name);
    }
  }
  return bySource;
}

export function buildUpdatePlanForItem(
  itemName: string,
  registryItem: RegistryItem,
  resolvedFiles: { file: RegistryFile; content: string }[],
  currentHash: string,
  cwd: string,
  config: RegpickConfig,
): Either.Either<UpdateAction, AppError> {
  const remoteContents: string[] = [];
  const remoteFiles: UpdateFile[] = [];

  for (const { file, content: rawContent } of resolvedFiles) {
    const content = applyAliases(rawContent, config);
    remoteContents.push(content);

    const outputRes = resolveOutputPathFromPolicy(registryItem, file, cwd, config);
    if (Either.isLeft(outputRes))
      return Either.left(outputRes.left) as unknown as Either.Either<UpdateAction, AppError>;

    remoteFiles.push({
      target: outputRes.right.absoluteTarget,
      content: content,
    });
  }

  const newHash = computeHash(remoteContents.sort().join(""));
  const status = newHash !== currentHash ? "requires-diff-prompt" : "up-to-date";

  return Either.right({
    itemName,
    status,
    newHash,
    files: remoteFiles,
  });
}
