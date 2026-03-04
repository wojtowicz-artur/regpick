import { Effect } from "effect";
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
    const entries = Object.entries(files).filter(([_, content]) => content !== null);

    if (entries.length === 0) return;

    // 1. Gather unique directories to create
    const dirsToCreate = new Set<string>();
    for (const [filePath] of entries) {
      const realTargetPath = path.normalize(filePath);
      dirsToCreate.add(path.dirname(realTargetPath));
    }

    // 2. Create directories sequentially to strictly avoid any structural race conditions
    try {
      // Sorting ensures predictable path crawling (top-level folders before deeply nested ones)
      for (const dir of Array.from(dirsToCreate).sort()) {
        await fs.mkdir(dir, { recursive: true });
      }
    } catch (err) {
      throw new Error(`Failed to create physical filesystem directories during flush: ${err}`);
    }

    // 3. Dump files safely handling all outcomes via Promise.allSettled
    const writeResults = await Effect.runPromise(
      Effect.all(
        entries.map(([filePath]) =>
          Effect.tryPromise(async () => {
            const realTargetPath = path.normalize(filePath);
            // Read raw buffer from memfs to avoid encoding corruptions
            const raw = this.memory.readFileSync(filePath);
            await fs.writeFile(realTargetPath, raw as Buffer);
          }),
        ),
        { concurrency: "unbounded", mode: "either" },
      ),
    );

    const failures = writeResults.filter((res) => res._tag === "Left");

    if (failures.length > 0) {
      const errorMessages = failures
        .map((f) => (f as any).left?.message || String((f as any).left))
        .join("\n");
      throw new Error(`flushToDisk failed with ${failures.length} errors:\n${errorMessages}`);
    }
  }

  /**
   * Drop all current memory modifications. Effectively rolls back.
   */
  rollback(): void {
    this.memory.reset();
  }
}
