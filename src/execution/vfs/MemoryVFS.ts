import { Effect } from "effect";
import path from "path";
import { VFSEnginePort, VFSFile } from "./engine.js";

export class MemoryVFS implements VFSEnginePort {
  private files: Map<string, string> = new Map();

  // Fix BUG 4: Windows Path normalisation (backslash to forward-slash)
  normalizePath(p: string): string {
    return path.normalize(p).replace(/\\\\/g, "/").replace(/\\/g, "/");
  }

  readFile(p: string): Effect.Effect<VFSFile, Error, never> {
    return Effect.sync(() => {
      const np = this.normalizePath(p);
      if (!this.files.has(np)) {
        throw new Error(`File not found: ${np}`);
      }
      return { path: np, content: this.files.get(np)! };
    });
  }

  writeFile(file: VFSFile): Effect.Effect<void, Error, never> {
    return Effect.sync(() => {
      const np = this.normalizePath(file.path);
      this.files.set(np, file.content);
    });
  }

  exists(p: string): Effect.Effect<boolean, never, never> {
    return Effect.sync(() => {
      const np = this.normalizePath(p);
      return this.files.has(np);
    });
  }

  commitToDisk(): Effect.Effect<void, Error, never> {
    // In actual implementation, we read the real files and run fs.writeFile.
    // In our pure tests, this will do nothing or emit to an injected FileSystemPort.
    return Effect.succeed(undefined);
  }
}
