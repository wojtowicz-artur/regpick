import { type AppError } from "@/core/errors.js";
import { type Result, err, isErr, ok } from "@/core/result.js";
import { type TransactionStep } from "@/core/saga.js";
import type { RuntimePorts } from "@/shell/runtime/ports.js";

export class WriteFileStep implements TransactionStep<void> {
  public name: string;
  private priorContent?: string;
  private existedPreviously: boolean = false;

  constructor(
    private readonly targetPath: string,
    private readonly newContent: string,
    private readonly runtime: RuntimePorts,
  ) {
    this.name = `Write file: ${this.targetPath}`;
  }

  async execute(): Promise<Result<void, AppError>> {
    const exists = await this.runtime.fs.pathExists(this.targetPath);
    this.existedPreviously = exists;

    if (exists) {
      const readRes = await this.runtime.fs.readFile(this.targetPath, "utf8");
      if (isErr(readRes)) {
        return err(readRes.error);
      }
      this.priorContent = readRes.value;
    }

    const dirname = this.targetPath.substring(0, this.targetPath.lastIndexOf("/"));
    const dirExists = await this.runtime.fs.pathExists(dirname);
    if (!dirExists && this.runtime.fs.ensureDir) {
      await this.runtime.fs.ensureDir(dirname);
    }

    return await this.runtime.fs.writeFile(this.targetPath, this.newContent, "utf8");
  }

  async compensate(): Promise<Result<void, AppError>> {
    if (!this.existedPreviously) {
      if (this.runtime.fs.remove) {
        return await this.runtime.fs.remove(this.targetPath);
      }
    } else if (this.priorContent !== undefined) {
      return await this.runtime.fs.writeFile(this.targetPath, this.priorContent, "utf8");
    }
    return ok(undefined);
  }
}
