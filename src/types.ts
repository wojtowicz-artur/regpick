import type { RegistryFile, RegistryItem } from "@/domain/models/index.js";
export interface StandardFileSystemPort {
  existsSync(path: string): boolean;
  pathExists(path: string): Promise<boolean>;
  ensureDir(path: string): Promise<void>;
  remove(path: string): Promise<void>;
  writeFile(path: string, content: string | Uint8Array, encoding?: BufferEncoding): Promise<void>;
  readFile(path: string, encoding?: BufferEncoding): Promise<string | Uint8Array>;
  readJsonSync<T = unknown>(path: string): Promise<T>;
  writeJson(path: string, value: unknown, options?: { spaces?: number }): Promise<void>;
  stat(path: string): Promise<{ isDirectory(): boolean; isFile(): boolean }>;
  readdir(path: string): Promise<string[]>;
}

export interface StandardHttpPort {
  getJson<T = unknown>(url: string, timeoutMs?: number): Promise<T>;
  getText(url: string, timeoutMs?: number): Promise<string>;
}

export interface StandardPromptPort {
  intro(message: string): Promise<void>;
  outro(message: string): Promise<void>;
  cancel(message: string): Promise<void>;
  isCancel(value: unknown): Promise<boolean>;
  info(message: string): Promise<void>;
  warn(message: string): Promise<void>;
  error(message: string): Promise<void>;
  success(message: string): Promise<void>;
  log(message: string): Promise<void>;
  text(options: {
    message: string;
    placeholder?: string;
    defaultValue?: string;
  }): Promise<string | symbol>;
  confirm(options: { message: string; initialValue?: boolean }): Promise<boolean | symbol>;
  select(options: {
    message: string;
    options: Array<{ value: string; label: string; hint?: string }>;
  }): Promise<string | symbol>;
  multiselect(options: {
    message: string;
    options: Array<{ value: string; label: string; hint?: string }>;
    maxItems?: number;
    required?: boolean;
  }): Promise<Array<string> | symbol>;
  autocompleteMultiselect(options: {
    message: string;
    options: Array<{ value: string; label: string; hint?: string }>;
    maxItems?: number;
    required?: boolean;
  }): Promise<Array<string> | symbol>;
}

export interface StandardProcessPort {
  run(command: string, args: string[], cwd: string): { status: number | null };
}

export interface StandardRuntimePorts {
  fs: StandardFileSystemPort;
  http: StandardHttpPort;
  prompt: StandardPromptPort;
  process: StandardProcessPort;
}

export interface PluginContext {
  cwd: string;
  runtime: StandardRuntimePorts;
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

export type { CliArgs, FlagValue } from "@/domain/models/index.js";

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
  detect: (cwd: string, runtime: StandardRuntimePorts) => Promise<boolean> | boolean;
  buildInstallCommands: (dependencies: string[], devDependencies: string[]) => InstallCommand[];
}

export interface PathResolverPlugin {
  name: string;
  resolve: (
    file: RegistryFile,
    item: RegistryItem,
    defaultPath: string,
    config: import("@/domain/configModel.js").ResolvedRegpickConfig,
  ) => string | undefined | null;
}

export type { RegpickConfig, ResolvedRegpickConfig } from "@/domain/configModel.js";
export type { RegistryFile, RegistryItem } from "@/domain/models/index.js";
export type { RegistrySourceMeta } from "@/domain/registryModel.js";

export type {
  DependencyPlan,
  InstallCommand,
  InstallPlan,
  OverwritePolicy,
  PlannedWrite,
} from "@/domain/models/index.js";

export type { ComponentLockItem, JournalEntry, RegpickLockfile } from "@/domain/models/index.js";

export type CommandOutcome =
  | {
      kind: "success";
      message?: string;
    }
  | {
      kind: "noop";
      message: string;
    };
