import type { AppError } from "@/core/errors.js";
import { applyAliases } from "@/domain/aliasCore.js";
import { resolveOutputPathFromPolicy } from "@/domain/pathPolicy.js";
import { computeTreeHash } from "@/shell/lockfile.js";
import type {
  LockfileItem,
  RegistryFile,
  RegistryItem,
  RegpickConfig,
  RegpickLockfile,
} from "@/types.js";
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
  lockfileItem: LockfileItem,
  cwd: string,
  config: RegpickConfig,
): Effect.Effect<UpdateAction, AppError> =>
  Effect.gen(function* () {
    const remoteFiles: UpdateFile[] = [];
    const treeFiles: { path: string; content: string }[] = [];

    for (const { file, content: rawContent } of resolvedFiles) {
      const content = applyAliases(rawContent, config);

      const outputRes = yield* resolveOutputPathFromPolicy(registryItem, file, cwd, config);

      remoteFiles.push({
        target: outputRes.absoluteTarget,
        content: content,
      });

      treeFiles.push({
        path: outputRes.relativeTarget,
        content: content,
      });
    }

    const newRemoteHash = computeTreeHash(treeFiles);

    // If the lockfile matches the remote state, no incoming changes exist
    // If it's a legacy lockfile (hash only and pending), we will prompt to update it
    const storedHash = lockfileItem.remoteHash || lockfileItem.hash;
    const isPending = storedHash === "pending";
    const status: "requires-diff-prompt" | "up-to-date" =
      isPending || newRemoteHash !== storedHash ? "requires-diff-prompt" : "up-to-date";

    return yield* Effect.succeed({
      itemName,
      status,
      newHash: newRemoteHash,
      files: remoteFiles,
    });
  });
