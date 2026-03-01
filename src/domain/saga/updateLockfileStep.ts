import { type AppError } from "@/core/errors.js";
import { type Result, ok } from "@/core/result.js";
import { type TransactionStep } from "@/core/saga.js";
import type { RegistryItem } from "@/domain/registryModel.js";
import { type RegpickLockfile, readLockfile, writeLockfile } from "@/shell/lockfile.js";
import type { RuntimePorts } from "@/shell/runtime/ports.js";

export class UpdateLockfileStep implements TransactionStep<void> {
  public name = "Update lockfile";
  private priorLockfileState?: RegpickLockfile;
  private existedPreviously: boolean = false;

  constructor(
    private readonly itemsToInstall: RegistryItem[],
    private readonly projectPath: string,
    private readonly runtime: RuntimePorts,
  ) {}

  async execute(): Promise<Result<void, AppError>> {
    const lockfilePath = `${this.projectPath}/regpick-lock.json`;
    this.existedPreviously = await this.runtime.fs.pathExists(lockfilePath);

    if (this.existedPreviously) {
      this.priorLockfileState = await readLockfile(this.projectPath, this.runtime);
      this.priorLockfileState = JSON.parse(JSON.stringify(this.priorLockfileState));
    }

    const lockfile = await readLockfile(this.projectPath, this.runtime);

    for (const item of this.itemsToInstall) {
      if (!lockfile.components) lockfile.components = {};
      lockfile.components[item.name] = {
        source: item.sourceMeta?.baseUrl ?? item.sourceMeta?.baseDir ?? "unknown",
        hash: "pending", // needs proper hash integration
      };
    }

    await writeLockfile(this.projectPath, lockfile, this.runtime);
    return ok(undefined);
  }

  async compensate(): Promise<Result<void, AppError>> {
    const lockfilePath = `${this.projectPath}/regpick-lock.json`;

    if (!this.existedPreviously && this.runtime.fs.remove) {
      await this.runtime.fs.remove(lockfilePath);
    } else if (this.priorLockfileState !== undefined) {
      await writeLockfile(this.projectPath, this.priorLockfileState, this.runtime);
    }

    return ok(undefined);
  }
}
