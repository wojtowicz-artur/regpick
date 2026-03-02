import { type AppError } from "@/core/errors.js";
import { type Result, isErr, ok } from "@/core/result.js";
import { type TransactionStep } from "@/core/saga.js";
import { installDependencies } from "@/shell/installer.js";
import { resolvePackageManager } from "@/shell/packageManagers/resolver.js";
import { getPackageManagerPlugin } from "@/shell/packageManagers/strategy.js";
import type { RuntimePorts } from "@/shell/runtime/ports.js";
import type { RegpickConfig } from "@/types.js";

export class InstallDependenciesStep implements TransactionStep<void> {
  public name = "Install dependencies";
  private packageJsonSnapshot?: string;
  private lockfilesSnapshot: Record<string, string> = {};

  constructor(
    private readonly plan: {
      dependencies: string[];
      devDependencies: string[];
    },
    private readonly projectPath: string,
    private readonly runtime: RuntimePorts,
    private readonly config: RegpickConfig,
  ) {}

  async execute(): Promise<Result<void, AppError>> {
    const pmName = await resolvePackageManager(
      this.projectPath,
      this.config.packageManager,
      this.runtime,
      this.config,
    );
    const plugin = getPackageManagerPlugin(pmName, this.config);
    const lockfiles = plugin?.lockfiles || ["package-lock.json"];

    const packageJsonPath = `${this.projectPath}/package.json`;

    const pkgRes = await this.runtime.fs.readFile(packageJsonPath, "utf8");
    if (!isErr(pkgRes)) this.packageJsonSnapshot = pkgRes.value;

    for (const lockfileName of lockfiles) {
      const lockfilePath = `${this.projectPath}/${lockfileName}`;
      const lockfileRes = await this.runtime.fs.readFile(lockfilePath, "utf8");
      if (!isErr(lockfileRes)) {
        this.lockfilesSnapshot[lockfileName] = lockfileRes.value;
      }
    }

    return installDependencies(
      this.projectPath,
      pmName,
      this.plan.dependencies,
      this.plan.devDependencies,
      this.runtime,
      this.config,
    );
  }

  async compensate(): Promise<Result<void, AppError>> {
    const packageJsonPath = `${this.projectPath}/package.json`;

    if (this.packageJsonSnapshot !== undefined) {
      await this.runtime.fs.writeFile(packageJsonPath, this.packageJsonSnapshot, "utf8");
    }

    for (const [lockfileName, snapshot] of Object.entries(this.lockfilesSnapshot)) {
      const lockfilePath = `${this.projectPath}/${lockfileName}`;
      await this.runtime.fs.writeFile(lockfilePath, snapshot, "utf8");
    }

    return ok(undefined);
  }
}
