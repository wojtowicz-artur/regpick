import type { RegistryFile, RegistryItem } from "./registry.js";

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

export type ResolvedPlan = {
  selectedItems: RegistryItem[];
  finalWrites: PlannedWrite[];
  dependencyPlan: DependencyPlan;
  shouldInstallDeps: boolean;
};

export type OverwritePolicy = "prompt" | "overwrite" | "skip";

export interface InstallCommand {
  command: string;
  args: string[];
}
