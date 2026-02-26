import type { RuntimePorts } from "./shell/runtime/ports.js";

export type FlagValue = string | boolean;

export type CliArgs = {
  flags: Record<string, FlagValue>;
  positionals: string[];
};

export type CommandContext = {
  cwd: string;
  args: CliArgs;
  runtime: RuntimePorts;
};

export type OverwritePolicy = "prompt" | "overwrite" | "skip";
export type PackageManager = "auto" | "npm" | "yarn" | "pnpm";

export type RegpickConfig = {
  registries: Record<string, string>;
  targetsByType: Record<string, string>;
  aliases?: Record<string, string>;
  overwritePolicy: OverwritePolicy;
  packageManager: PackageManager;
  preferManifestTarget: boolean;
  allowOutsideProject: boolean;
};

export type RegistrySourceMeta = {
  type: "http" | "file" | "directory";
  baseUrl?: string;
  baseDir?: string;
};

export type RegistryFile = {
  path?: string;
  target?: string;
  type: string;
  content?: string;
  url?: string;
};

export type RegistryItem = {
  name: string;
  title: string;
  description: string;
  type: string;
  dependencies: string[];
  devDependencies: string[];
  registryDependencies: string[];
  files: RegistryFile[];
  sourceMeta: RegistrySourceMeta;
};

export type PlannedWrite = {
  itemName: string;
  sourceFile: RegistryFile;
  absoluteTarget: string;
  relativeTarget: string;
};

export type DependencyPlan = {
  dependencies: string[];
  devDependencies: string[];
};

export type InstallPlan = {
  selectedItems: RegistryItem[];
  plannedWrites: PlannedWrite[];
  dependencyPlan: DependencyPlan;
  conflicts: PlannedWrite[];
};

export type LockfileItem = {
  version?: string;
  source?: string;
  hash: string;
};

export type RegpickLockfile = {
  components: Record<string, LockfileItem>;
};

export type CommandOutcome =
  | {
      kind: "success";
      message?: string;
    }
  | {
      kind: "noop";
      message: string;
    };
