import type { RuntimePorts } from "@/core/ports.js";
import type { RegpickConfig } from "@/domain/configModel.js";
import type { RegistryFile, RegistryItem } from "@/domain/registryModel.js";
import type { RegpickLockfile } from "@/shell/services/lockfile.js";

export interface PluginContext {
  cwd: string;
  runtime: RuntimePorts;
}

export interface PipelinePlugin {
  type: "pipeline";
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
}

export interface PackageManagerExtensionPlugin extends PackageManagerPlugin {
  type: "package-manager";
}

export interface PathResolverExtensionPlugin extends PathResolverPlugin {
  type: "path-resolver";
}

export type RegpickPlugin =
  | PipelinePlugin
  | PackageManagerExtensionPlugin
  | PathResolverExtensionPlugin;

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

export type { RegpickConfig } from "@/domain/configModel.js";
export type { RegistryFile, RegistryItem, RegistrySourceMeta } from "@/domain/registryModel.js";

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

export type { ComponentLockItem, RegpickLockfile } from "@/shell/services/lockfile.js";

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
