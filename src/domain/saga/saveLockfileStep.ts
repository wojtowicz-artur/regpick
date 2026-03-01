import { type AppError } from "@/core/errors.js";
import { type Result, ok } from "@/core/result.js";
import { type TransactionStep } from "@/core/saga.js";
import {
  type RegpickLockfile,
  getLockfilePath,
  readLockfile,
  writeLockfile,
} from "@/shell/lockfile.js";
import { type RuntimePorts } from "@/shell/runtime/ports.js";

export class SaveLockfileStep implements TransactionStep<void> {
  public name = "Save lockfile";
  private previousLockfile: RegpickLockfile | null = null;
  private existedBefore = false;

  constructor(
    private cwd: string,
    private newLockfile: RegpickLockfile,
    private runtime: RuntimePorts,
  ) {}

  async execute(): Promise<Result<void, AppError>> {
    const lockfilePath = getLockfilePath(this.cwd);
    this.existedBefore = await this.runtime.fs.pathExists(lockfilePath);

    if (this.existedBefore) {
      const prev = await readLockfile(this.cwd, this.runtime);
      // deep clone to avoid reference updates
      this.previousLockfile = JSON.parse(JSON.stringify(prev));
    }

    await writeLockfile(this.cwd, this.newLockfile, this.runtime);
    return ok(undefined);
  }

  async compensate(): Promise<Result<void, AppError>> {
    if (this.existedBefore && this.previousLockfile) {
      await writeLockfile(this.cwd, this.previousLockfile, this.runtime);
    } else {
      const lockfilePath = getLockfilePath(this.cwd);
      const remRes = await this.runtime.fs.remove(lockfilePath);
      if (!remRes.ok) return remRes;
    }
    return ok(undefined);
  }
}
