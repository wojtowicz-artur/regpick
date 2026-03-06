import type { AddIntent } from "@/domain/models/intent.js";
import type { InstallPlan, ResolvedPlan } from "@/domain/models/plan.js";
import type { Registry, RegistryItem } from "@/domain/models/registry.js";
import type { RegpickLockfile } from "@/domain/models/state.js";
import type { VFSFile, VFSOutput } from "@/execution/vfs/port.js";

export type LoadRegistryInput = { intent: AddIntent };
export type LoadRegistryOutput = { intent: AddIntent; registry: Registry };

export type SelectScopeInput = LoadRegistryOutput;
export type SelectScopeOutput = LoadRegistryOutput & { selected: RegistryItem[] };

export type BuildPlanInput = SelectScopeOutput;
export type BuildPlanOutput = SelectScopeOutput & { plan: InstallPlan };

export type ResolveConflictsInput = BuildPlanOutput;
export type ResolveConflictsOutput = BuildPlanOutput & { resolvedPlan: ResolvedPlan };

export type HydrateFilesInput = ResolveConflictsOutput;
export type HydrateFilesOutput = ResolveConflictsOutput & { files: VFSFile[] };

export type TransformFilesInput = HydrateFilesOutput;
export type TransformFilesOutput = HydrateFilesOutput & { vfsOutput: VFSOutput };

export type WriteJournalInput = TransformFilesOutput & { lockfileBackup: RegpickLockfile | null };
export type WriteJournalOutput = TransformFilesOutput & {
  lockfileBackup: RegpickLockfile | null;
  journalId: string;
};

export type CommitFilesInput = WriteJournalOutput;
export type CommitLockfileInput = CommitFilesInput & { newLockfile: RegpickLockfile };
export type ReconcileDepsInput = CommitLockfileInput;
