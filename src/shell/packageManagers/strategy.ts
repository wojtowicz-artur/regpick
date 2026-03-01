import type { PackageManager } from "@/types.js";

export type RuntimePackageManager = Exclude<PackageManager, "auto">;

type InstallCommand = {
  command: string;
  args: string[];
};

type PackageManagerStrategy = {
  manager: RuntimePackageManager;
  buildInstallCommands: (
    dependencies: string[],
    devDependencies: string[],
  ) => InstallCommand[];
};

function buildNpmCommands(
  dependencies: string[],
  devDependencies: string[],
): InstallCommand[] {
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
}

function buildYarnCommands(
  dependencies: string[],
  devDependencies: string[],
): InstallCommand[] {
  const commands: InstallCommand[] = [];
  if (dependencies.length) {
    commands.push({ command: "yarn", args: ["add", ...dependencies] });
  }
  if (devDependencies.length) {
    commands.push({ command: "yarn", args: ["add", "-D", ...devDependencies] });
  }
  return commands;
}

function buildPnpmCommands(
  dependencies: string[],
  devDependencies: string[],
): InstallCommand[] {
  const commands: InstallCommand[] = [];
  if (dependencies.length) {
    commands.push({ command: "pnpm", args: ["add", ...dependencies] });
  }
  if (devDependencies.length) {
    commands.push({ command: "pnpm", args: ["add", "-D", ...devDependencies] });
  }
  return commands;
}

const strategyMap: Record<RuntimePackageManager, PackageManagerStrategy> = {
  npm: {
    manager: "npm",
    buildInstallCommands: buildNpmCommands,
  },
  yarn: {
    manager: "yarn",
    buildInstallCommands: buildYarnCommands,
  },
  pnpm: {
    manager: "pnpm",
    buildInstallCommands: buildPnpmCommands,
  },
};

export function getPackageManagerStrategy(
  manager: RuntimePackageManager,
): PackageManagerStrategy {
  return strategyMap[manager];
}
