import type { AppError } from "@/core/errors.js";
import { applyAliases } from "@/domain/aliasCore.js";
import { resolveOutputPathFromPolicy } from "@/domain/pathPolicy.js";
import { computeHash } from "@/shell/lockfile.js";
import type { RegistryFile, RegistryItem, RegpickConfig, RegpickLockfile } from "@/types.js";
import { Effect } from "effect";

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

export const buildUpdatePlanForItem = (
  itemName: string,
  registryItem: RegistryItem,
  resolvedFiles: { file: RegistryFile; content: string }[],
  currentHash: string,
  cwd: string,
  config: RegpickConfig,
): Effect.Effect<UpdateAction, AppError> =>
  Effect.gen(function* () {
    const remoteContents: string[] = [];
    const remoteFiles: UpdateFile[] = [];

    for (const { file, content: rawContent } of resolvedFiles) {
      const content = applyAliases(rawContent, config);
      remoteContents.push(content);

      const outputRes = yield* resolveOutputPathFromPolicy(registryItem, file, cwd, config);

      remoteFiles.push({
        target: outputRes.absoluteTarget,
        content: content,
      });
    }

    const newHash = computeHash(remoteContents.sort().join(""));
    const status: "requires-diff-prompt" | "up-to-date" =
      newHash !== currentHash ? "requires-diff-prompt" : "up-to-date";

    return yield* Effect.succeed({
      itemName,
      status,
      newHash,
      files: remoteFiles,
    });
  });
