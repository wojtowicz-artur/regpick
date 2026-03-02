import { Volume } from "memfs";
import fs from "node:fs/promises";
import path from "node:path";
import { type PersistableVFS } from "./pipeline.js";

export class MemoryVFS implements PersistableVFS {
  private memory = new Volume();

  async readFile(filePath: string): Promise<string> {
    const memBuffer = this.memory.readFileSync(filePath);
    if (memBuffer) {
      return memBuffer.toString();
    }
    // Fallback to real disk
    const content = await fs.readFile(filePath, "utf-8");
    return content;
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const dir = path.dirname(filePath);
    await this.mkdir(dir);
    this.memory.writeFileSync(filePath, content);
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      if (this.memory.existsSync(filePath)) {
        return true;
      }
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async mkdir(dirPath: string): Promise<void> {
    this.memory.mkdirSync(dirPath, { recursive: true });
  }

  /**
   * Syncs the in-memory changes to the actual disk concurrently.
   */
  async flushToDisk(): Promise<void> {
    const files = this.memory.toJSON();
    const writePromises = Object.entries(files).map(async ([filePath, content]) => {
      if (typeof content === "string") {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, content, "utf-8");
      }
    });

    await Promise.all(writePromises);
  }

  /**
   * Drop all current memory modifications. Effectively rolls back.
   */
  rollback(): void {
    this.memory.reset();
  }
}
