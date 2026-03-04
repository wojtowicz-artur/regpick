import type { InstallCommand, PackageManagerPlugin, RegpickConfig } from "@/types.js";
import path from "node:path";

export const npmPlugin: PackageManagerPlugin = {
  name: "npm",
  lockfiles: ["package-lock.json"],
  detect: (cwd, runtime) => runtime.fs.existsSync(path.join(cwd, "package-lock.json")),
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

export const yarnPlugin: PackageManagerPlugin = {
  name: "yarn",
  lockfiles: ["yarn.lock"],
  detect: (cwd, runtime) => runtime.fs.existsSync(path.join(cwd, "yarn.lock")),
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

export const pnpmPlugin: PackageManagerPlugin = {
  name: "pnpm",
  lockfiles: ["pnpm-lock.yaml"],
  detect: (cwd, runtime) => runtime.fs.existsSync(path.join(cwd, "pnpm-lock.yaml")),
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

export const bunPlugin: PackageManagerPlugin = {
  name: "bun",
  lockfiles: ["bun.lockb", "bun.lock"],
  detect: (cwd, runtime) =>
    runtime.fs.existsSync(path.join(cwd, "bun.lockb")) ||
    runtime.fs.existsSync(path.join(cwd, "bun.lock")),
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

const defaultPluginRegistry: Record<string, PackageManagerPlugin> = {
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
    (p): p is PackageManagerPlugin =>
      typeof p === "object" && p !== null && "name" in p && (p as any).name === name,
  );
  return userPlugin ?? defaultPluginRegistry[name];
}

export function getAllPackageManagerPlugins(config?: RegpickConfig): PackageManagerPlugin[] {
  const userPlugins = (config?.plugins || []).filter(
    (p): p is PackageManagerPlugin =>
      typeof p === "object" && p !== null && "buildInstallCommands" in p,
  );

  const builtIns = Object.values(defaultPluginRegistry).filter(
    (bp) => !userPlugins.some((up) => up.name === bp.name),
  );

  return [...userPlugins, ...builtIns];
}
