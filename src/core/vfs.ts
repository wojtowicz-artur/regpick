import { Volume } from "memfs";
import fs from "node:fs/promises";
import path from "node:path";
import { type PersistableVFS } from "./pipeline.js";

/**
 * Normalizes windows paths to posix format for compatible memory caching.
 */
function normalizePath(id: string): string {
  return id.replace(/\\/g, "/");
}

export class MemoryVFS implements PersistableVFS {
  private memory = new Volume();

  async readFile(
    filePath: string,
    encoding: "utf-8" | undefined = "utf-8",
  ): Promise<string | Uint8Array> {
    const normPath = normalizePath(filePath);
    const memBuffer = this.memory.readFileSync(normPath);
    if (memBuffer) {
      if (encoding === "utf-8") {
        return memBuffer.toString();
      }
      return memBuffer as Buffer;
    }
    // Fallback to real disk
    if (encoding === "utf-8") {
      const content = await fs.readFile(filePath, "utf-8");
      return content;
    }
    const content = await fs.readFile(filePath);
    return content;
  }

  async writeFile(filePath: string, content: string | Uint8Array): Promise<void> {
    const normPath = normalizePath(filePath);
    const dir = path.dirname(normPath);
    await this.mkdir(dir);
    this.memory.writeFileSync(normPath, content);
  }

  async exists(filePath: string): Promise<boolean> {
    const normPath = normalizePath(filePath);
    try {
      if (this.memory.existsSync(normPath)) {
        return true;
      }
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async mkdir(dirPath: string): Promise<void> {
    const normPath = normalizePath(dirPath);
    this.memory.mkdirSync(normPath, { recursive: true });
  }

  /**
   * Syncs the in-memory changes to the actual disk concurrently.
   */
  async flushToDisk(): Promise<void> {
    const files = this.memory.toJSON();
    const writePromises = Object.entries(files).map(async ([filePath, content]) => {
      if (content !== null) {
        // We write to real FS using the system's path semantics, but read from VFS
        // using the normPath we get natively from iterating memfs
        // Although toJSON might give POSIX paths anyway, we pass the raw system filePath
        const realTargetPath = path.normalize(filePath);
        await fs.mkdir(path.dirname(realTargetPath), { recursive: true });

        // Read raw buffer from memfs to avoid encoding corruptions
        const raw = this.memory.readFileSync(filePath);
        await fs.writeFile(realTargetPath, raw as Buffer);
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
