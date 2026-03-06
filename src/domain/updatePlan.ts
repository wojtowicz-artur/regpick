import type { AppError } from "@/core/errors.js";
import { applyAliases } from "@/domain/aliasCore.js";
import { resolveOutputPathFromPolicy } from "@/domain/pathPolicy.js";
import { computeHash } from "@/execution/lockfile/service.js";
import type {
  ComponentLockItem,
  RegistryFile,
  RegistryItem,
  RegpickLockfile,
  ResolvedRegpickConfig,
} from "@/domain/models/index.js";
import { Effect } from "effect";

export type UpdateFile = {
  target: string;
  content: string;
};

export type UpdateAction = {
  itemName: string;
  status: "up-to-date" | "requires-diff-prompt";
  newFiles: { path: string; hash: string }[];
  files: UpdateFile[];
};

export type DetectedUpdateFile = {
  target: string;
  remoteContent: string;
  localContent: string;
};

export type DetectedUpdate = {
  itemName: string;
  newFiles: { path: string; hash: string }[];
  files: DetectedUpdateFile[];
};

export type ApprovedUpdatePlan = {
  approvedUpdates: DetectedUpdate[];
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
  lockfileItem: ComponentLockItem,
  cwd: string,
  config: ResolvedRegpickConfig,
): Effect.Effect<UpdateAction, AppError> =>
  Effect.gen(function* () {
    const remoteFiles: UpdateFile[] = [];
    const treeFiles: { path: string; hash: string }[] = [];

    for (const { file, content: rawContent } of resolvedFiles) {
      const content = applyAliases(rawContent, config);

      const outputRes = yield* resolveOutputPathFromPolicy(registryItem, file, cwd, config);

      remoteFiles.push({
        target: outputRes.absoluteTarget,
        content: content,
      });

      treeFiles.push({
        path: outputRes.relativeTarget,
        hash: computeHash(content),
      });
    }

    // Sort to have deterministic comparison
    treeFiles.sort((a, b) => a.path.localeCompare(b.path));

    // Sort lock files as well although they should already be sorted
    const storedFiles = lockfileItem.files
      ? [...lockfileItem.files].sort((a, b) => a.path.localeCompare(b.path))
      : [];

    const isPending = storedFiles.length === 0; // Legacy or corrupted

    let isDifferent = false;
    if (storedFiles.length !== treeFiles.length) {
      isDifferent = true;
    } else {
      for (let i = 0; i < treeFiles.length; i++) {
        if (
          treeFiles[i].path !== storedFiles[i].path ||
          treeFiles[i].hash !== storedFiles[i].hash
        ) {
          isDifferent = true;
          break;
        }
      }
    }

    const status: "requires-diff-prompt" | "up-to-date" =
      isPending || isDifferent ? "requires-diff-prompt" : "up-to-date";

    return yield* Effect.succeed({
      itemName,
      status,
      newFiles: treeFiles,
      files: remoteFiles,
    });
  });
