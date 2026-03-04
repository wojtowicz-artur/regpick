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

export interface PluginContext {
  cwd: string;
  runtime: RuntimePorts;
}

export interface RegpickPlugin {
  name: string;
  start?(ctx: PluginContext): void | Promise<void>;
  resolveId?(
    source: string,
    importer?: string,
    ctx?: PluginContext,
  ): string | null | undefined | Promise<string | null | undefined>;
  load?(id: string, ctx?: PluginContext): unknown | Promise<unknown>;
  transform?(
    code: string,
    id: string,
    ctx?: PluginContext,
  ): string | null | undefined | Promise<string | null | undefined>;
  finish?(ctx: PluginContext): void | Promise<void>;
  onError?(err: Error, ctx: PluginContext): void | Promise<void>;

  lockfiles?: string[];
  detect?: Function;
  buildInstallCommands?: Function;
  resolvePath?: Function;
}

export type FlagValue = string | boolean;

export type CliArgs = {
  flags: Record<string, FlagValue>;
  positionals: string[];
};

export type CommandContext = {
  cwd: string;
  args: CliArgs;
};

export type OverwritePolicy = "prompt" | "overwrite" | "skip";
export type PackageManager = string;

export interface InstallCommand {
  command: string;
  args: string[];
}

export interface PackageManagerPlugin {
  name: string;
  lockfiles: string[];
  detect: (cwd: string, runtime: RuntimePorts) => Promise<boolean> | boolean;
  buildInstallCommands: (dependencies: string[], devDependencies: string[]) => InstallCommand[];
}

export interface PathResolverPlugin {
  name: string;
  resolve: (
    file: RegistryFile,
    item: RegistryItem,
    defaultPath: string,
    config: RegpickConfig,
  ) => string | undefined | null;
}

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

export type JournalEntry = {
  id: string;
  command: "add" | "update";
  status: "pending";
  plannedFiles: string[];
  lockfileBackup?: RegpickLockfile;
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
