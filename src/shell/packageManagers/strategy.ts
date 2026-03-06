import type { InstallCommand, RegpickConfig } from "@/domain/models/index.js";
import type { PackageManagerPlugin } from "@/sdk/index.js";
import path from "node:path";

export const npmPlugin: PackageManagerPlugin & { type: "package-manager" } = {
  type: "package-manager",
  name: "npm",
  lockfiles: ["package-lock.json"],
  detect: (cwd: string, fs: { existsSync(path: string): boolean }) =>
    fs.existsSync(path.join(cwd, "package-lock.json")),
  buildInstallCommands: (dependencies: string[], devDependencies: string[]): InstallCommand[] => {
    const commands: InstallCommand[] = [];
    if (dependencies.length) {
      commands.push({ command: "npm", args: ["install", ...dependencies] });
    }
    if (devDependencies.length) {
      commands.push({
        command: "npm",
        args: ["install", "-D", ...devDependencies],
      });
    }
    return commands;
  },
};

export const yarnPlugin: PackageManagerPlugin & { type: "package-manager" } = {
  type: "package-manager",
  name: "yarn",
  lockfiles: ["yarn.lock"],
  detect: (cwd: string, fs: { existsSync(path: string): boolean }) =>
    fs.existsSync(path.join(cwd, "yarn.lock")),
  buildInstallCommands: (dependencies: string[], devDependencies: string[]): InstallCommand[] => {
    const commands: InstallCommand[] = [];
    if (dependencies.length) {
      commands.push({ command: "yarn", args: ["add", ...dependencies] });
    }
    if (devDependencies.length) {
      commands.push({
        command: "yarn",
        args: ["add", "-D", ...devDependencies],
      });
    }
    return commands;
  },
};

export const pnpmPlugin: PackageManagerPlugin & { type: "package-manager" } = {
  type: "package-manager",
  name: "pnpm",
  lockfiles: ["pnpm-lock.yaml"],
  detect: (cwd: string, fs: { existsSync(path: string): boolean }) =>
    fs.existsSync(path.join(cwd, "pnpm-lock.yaml")),
  buildInstallCommands: (dependencies: string[], devDependencies: string[]): InstallCommand[] => {
    const commands: InstallCommand[] = [];
    if (dependencies.length) {
      commands.push({ command: "pnpm", args: ["add", ...dependencies] });
    }
    if (devDependencies.length) {
      commands.push({
        command: "pnpm",
        args: ["add", "-D", ...devDependencies],
      });
    }
    return commands;
  },
};

export const bunPlugin: PackageManagerPlugin & { type: "package-manager" } = {
  type: "package-manager",
  name: "bun",
  lockfiles: ["bun.lockb", "bun.lock"],
  detect: (cwd: string, fs: { existsSync(path: string): boolean }) =>
    fs.existsSync(path.join(cwd, "bun.lockb")) || fs.existsSync(path.join(cwd, "bun.lock")),
  buildInstallCommands: (dependencies: string[], devDependencies: string[]): InstallCommand[] => {
    const commands: InstallCommand[] = [];
    if (dependencies.length) {
      commands.push({ command: "bun", args: ["add", ...dependencies] });
    }
    if (devDependencies.length) {
      commands.push({
        command: "bun",
        args: ["add", "-D", ...devDependencies],
      });
    }
    return commands;
  },
};

const defaultPluginRegistry: Record<string, PackageManagerPlugin & { type: "package-manager" }> = {
  npm: npmPlugin,
  yarn: yarnPlugin,
  pnpm: pnpmPlugin,
  bun: bunPlugin,
};

export function getPackageManagerPlugin(
  name: string,
  config?: RegpickConfig,
): PackageManagerPlugin | undefined {
  const userPlugin = config?.plugins?.find(
    (p): p is PackageManagerPlugin & { type: "package-manager" } =>
      typeof p === "object" &&
      p !== null &&
      "type" in p &&
      p.type === "package-manager" &&
      p.name === name,
  );
  return userPlugin ?? defaultPluginRegistry[name];
}

export function getAllPackageManagerPlugins(config?: RegpickConfig): PackageManagerPlugin[] {
  const userPlugins = (config?.plugins || []).filter(
    (p): p is PackageManagerPlugin & { type: "package-manager" } =>
      typeof p === "object" && p !== null && "type" in p && p.type === "package-manager",
  );

  const builtIns = Object.values(defaultPluginRegistry).filter(
    (bp) => !userPlugins.some((up) => up.name === bp.name),
  );

  return [...userPlugins, ...builtIns];
}
