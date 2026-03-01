import { type AppError } from "@/core/errors.js";
import { type Result, ok } from "@/core/result.js";
import { type TransactionStep } from "@/core/saga.js";
import { type RuntimePorts } from "@/shell/runtime/ports.js";
import path from "node:path";

export class UpdateFileStep implements TransactionStep {
  public name: string;
  private existedBefore: boolean = false;
  private previousContent: string | null = null;

  constructor(
    private targetPath: string,
    private newContent: string,
    private runtime: RuntimePorts,
  ) {
    this.name = `Update file ${targetPath}`;
  }

  async execute(): Promise<Result<void, AppError>> {
    const readRes = await this.runtime.fs.readFile(this.targetPath, "utf8");
    if (readRes.ok) {
      this.existedBefore = true;
      this.previousContent = readRes.value;
    } else {
      this.existedBefore = false;
    }

    const ensureRes = await this.runtime.fs.ensureDir(path.dirname(this.targetPath));
    if (!ensureRes.ok) return ensureRes;

    const writeRes = await this.runtime.fs.writeFile(this.targetPath, this.newContent, "utf8");
    if (!writeRes.ok) return writeRes;

    return ok(undefined);
  }

  async compensate(): Promise<Result<void, AppError>> {
    if (this.existedBefore && this.previousContent !== null) {
      // Restore previous content
      const ensureRes = await this.runtime.fs.ensureDir(path.dirname(this.targetPath));
      if (!ensureRes.ok) return ensureRes;
      const restoreRes = await this.runtime.fs.writeFile(
        this.targetPath,
        this.previousContent,
        "utf8",
      );
      if (!restoreRes.ok) return restoreRes;
    } else {
      // File didn't exist before, so remove it
      const remRes = await this.runtime.fs.remove(this.targetPath);
      if (!remRes.ok) return remRes;
    }
    return ok(undefined);
  }
}
