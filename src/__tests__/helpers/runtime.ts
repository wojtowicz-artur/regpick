import { type RuntimePorts, HttpPort } from "@/core/ports.js";
import { Context, Effect } from "effect";
import * as path from "path";
import { type Mock, vi } from "vitest";

class MemoryFileSystem {
  private files = new Map<string, string>();
  writeFile(filePath: string, content: string): void {
    const absPath = path.resolve(filePath);
    this.files.set(absPath, content);
  }
  readFile(filePath: string): string | null {
    const absPath = path.resolve(filePath);
    return this.files.get(absPath) || null;
  }
  exists(filePath: string): boolean {
    const absPath = path.resolve(filePath);
    return this.files.has(absPath);
  }
  removeFile(filePath: string): void {
    const absPath = path.resolve(filePath);
    this.files.delete(absPath);
  }
  clear() {
    this.files.clear();
  }
  getFiles() {
    return Array.from(this.files.keys());
  }
}

export function createMockRuntime(initialFiles: Record<string, string> = {}): {
  runtime: RuntimePorts;
  fs: MemoryFileSystem;
  mockHttp: {
    getJson: Mock<RuntimePorts["http"]["getJson"]>;
    getText: Mock<RuntimePorts["http"]["getText"]>;
  };
} {
  const fileSystem = new MemoryFileSystem();
  for (const [filePath, content] of Object.entries(initialFiles)) {
    fileSystem.writeFile(filePath, content);
  }

  const mockHttp = {
    getJson: vi.fn<Context.Tag.Service<HttpPort>["getJson"]>(() => Effect.succeed({} as any)),
    getText: vi.fn<Context.Tag.Service<HttpPort>["getText"]>(() => Effect.succeed("")),
  };

  const runtime: RuntimePorts = {
    fs: {
      pathExists: (filePath: string) => Effect.succeed(fileSystem.exists(filePath)),
      ensureDir: () => Effect.succeed(undefined),
      remove: (_filePath: string) => Effect.succeed(undefined),
      writeFile: (_filePath: string, _content: string) => Effect.succeed(undefined),
      readFile: (_filePath: string) => Effect.succeed({ isDirectory: () => false } as any),
      readdir: () => Effect.succeed([]),
    } as any,
    http: mockHttp as unknown as Context.Tag.Service<HttpPort>,
    prompt: {
      intro: () => Effect.void,
      outro: () => Effect.void,
      cancel: () => Effect.void,
      isCancel: (v: unknown) => Effect.succeed(v === Symbol.for("cancel")),
      info: () => Effect.void,
      warn: () => Effect.void,
      error: () => Effect.void,
      success: () => Effect.void,
      text: vi
        .fn()
        .mockImplementation(
          async (options: Parameters<RuntimePorts["prompt"]["text"]>[0]) =>
            options.defaultValue || "",
        ),
      confirm: vi.fn().mockImplementation(async () => true),
      select: vi
        .fn()
        .mockImplementation(
          async (options: Parameters<RuntimePorts["prompt"]["select"]>[0]) =>
            options.options[0].value,
        ),
      multiselect: vi
        .fn()
        .mockImplementation(async (options: Parameters<RuntimePorts["prompt"]["multiselect"]>[0]) =>
          options.options.map((o) => o.value),
        ),
      autocompleteMultiselect: vi
        .fn()
        .mockImplementation(
          async (options: Parameters<RuntimePorts["prompt"]["autocompleteMultiselect"]>[0]) =>
            options.options.map((o) => o.value),
        ),
    } as any,
    process: {
      run: (_command: string, _args: string[], _cwd: string) => ({ status: 0 }),
    } as any,
  };

  return { runtime, fs: fileSystem, mockHttp };
}
