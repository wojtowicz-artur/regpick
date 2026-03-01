import type {
  RegistryFile as ValibotRegistryFile,
  RegistryItem as ValibotRegistryItem,
  RegistrySourceMeta as ValibotRegistrySourceMeta,
} from "@/domain/registryModel.js";
import type { RegpickConfig as ValibotRegpickConfig } from "@/shell/config.js";
import type {
  LockfileItem as ValibotLockfileItem,
  RegpickLockfile as ValibotRegpickLockfile,
} from "@/shell/lockfile.js";
import type { RuntimePorts } from "@/shell/runtime/ports.js";

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

export type RegpickConfig = ValibotRegpickConfig;
export type RegistrySourceMeta = ValibotRegistrySourceMeta;
export type RegistryFile = ValibotRegistryFile;
export type RegistryItem = ValibotRegistryItem;

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

export type LockfileItem = ValibotLockfileItem;
export type RegpickLockfile = ValibotRegpickLockfile;

export type CommandOutcome =
  | {
      kind: "success";
      message?: string;
    }
  | {
      kind: "noop";
      message: string;
    };
