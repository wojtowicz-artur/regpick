import { type AppError } from "@/core/errors.js";
import { type Result, isErr, ok } from "@/core/result.js";
import { type TransactionStep } from "@/core/saga.js";
import { installDependencies } from "@/shell/installer.js";
import { resolvePackageManager } from "@/shell/packageManagers/resolver.js";
import type { RuntimePorts } from "@/shell/runtime/ports.js";

export class InstallDependenciesStep implements TransactionStep<void> {
  public name = "Install dependencies";
  private packageJsonSnapshot?: string;
  private lockfileSnapshot?: string;

  constructor(
    private readonly plan: { dependencies: string[]; devDependencies: string[] },
    private readonly projectPath: string,
    private readonly runtime: RuntimePorts,
  ) {}

  async execute(): Promise<Result<void, AppError>> {
    let pmName = resolvePackageManager(this.projectPath, "auto", this.runtime);

    const lockfileName =
      pmName === "pnpm" ? "pnpm-lock.yaml" : pmName === "yarn" ? "yarn.lock" : "package-lock.json";

    const packageJsonPath = `${this.projectPath}/package.json`;
    const lockfilePath = `${this.projectPath}/${lockfileName}`;

    const pkgRes = await this.runtime.fs.readFile(packageJsonPath, "utf8");
    if (!isErr(pkgRes)) this.packageJsonSnapshot = pkgRes.value;

    const lockRes = await this.runtime.fs.readFile(lockfilePath, "utf8");
    if (!isErr(lockRes)) this.lockfileSnapshot = lockRes.value;

    return installDependencies(
      this.projectPath,
      pmName,
      this.plan.dependencies,
      this.plan.devDependencies,
      this.runtime,
    );
  }

  async compensate(): Promise<Result<void, AppError>> {
    const packageJsonPath = `${this.projectPath}/package.json`;
    let pmName = resolvePackageManager(this.projectPath, "auto", this.runtime);

    const lockfileName =
      pmName === "pnpm" ? "pnpm-lock.yaml" : pmName === "yarn" ? "yarn.lock" : "package-lock.json";

    const lockfilePath = `${this.projectPath}/${lockfileName}`;

    if (this.packageJsonSnapshot !== undefined) {
      await this.runtime.fs.writeFile(packageJsonPath, this.packageJsonSnapshot, "utf8");
    }
    if (this.lockfileSnapshot !== undefined) {
      await this.runtime.fs.writeFile(lockfilePath, this.lockfileSnapshot, "utf8");
    }

    return ok(undefined);
  }
}
