export type ComponentLockItem = {
  version?: string;
  installedAt: string;
  source?: string;
  dependencies?: string[];
  files: Array<{
    path: string;
    hash?: string;
  }>;
};

export type RegpickLockfile = {
  lockfileVersion: 2;
  components: Record<string, ComponentLockItem>;
};

export type WorkflowStep =
  | "collect_intent"
  | "load_registry"
  | "select_scope"
  | "build_plan"
  | "resolve_conflicts"
  | "hydrate_files"
  | "transform_files"
  | "write_journal"
  | "commit_files"
  | "commit_lockfile"
  | "reconcile_deps"
  | "finalize";

export type JournalEntry = {
  id: string;
  command: "add" | "update";
  status: "pending";
  currentStep: Extract<WorkflowStep, "write_journal">;
  lastCompletedStep: WorkflowStep;
  plannedFiles: string[];
  lockfileBackup?: RegpickLockfile;
  lockfilePath: string;
};
