export type AddIntent = any; // TODO: import from domain/models/intent.js
export type Registry = any; // TODO: import from domain/models/registry.js
export type RegistryItem = any; // TODO: import from domain/models/registry.js
export type InstallPlan = any; // TODO: import from domain/models/plan.js
export type ResolvedPlan = any; // TODO: import from domain/models/plan.js
export type VFSFile = any; // TODO: import from execution/vfs/port.js
export type VFSOutput = any; // TODO: import from execution/vfs/port.js
export type RegpickLockfile = any; // TODO: import from domain/models/state.js

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
