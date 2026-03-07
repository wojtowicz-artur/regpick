import type { InstallCommand } from "../domain/models/index.js";

export interface PackageManagerPlugin {
  readonly type: "package-manager";
  readonly name: string;
  readonly lockfiles: string[];
  detect(cwd: string, fs: { existsSync(path: string): boolean }): boolean | Promise<boolean>;
  buildInstallCommands(deps: string[], devDeps: string[]): InstallCommand[];
}
