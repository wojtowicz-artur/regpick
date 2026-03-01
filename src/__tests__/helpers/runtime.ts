import { ok } from "@/core/result";
import { type RuntimePorts } from "@/shell/runtime/ports";
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
    getJson: vi.fn(async (_url: string) => {
      return ok({});
    }),
    getText: vi.fn(async (_url: string) => {
      return ok("");
    }),
  };

  const runtime: RuntimePorts = {
    fs: {
      existsSync: (filePath: string) => fileSystem.exists(filePath),
      pathExists: async (filePath: string) => fileSystem.exists(filePath),
      ensureDir: async () => ok(undefined),
      writeFile: async (filePath: string, content: string) => {
        fileSystem.writeFile(filePath, content);
        return ok(undefined);
      },
      readFile: async (filePath: string) => {
        const content = fileSystem.readFile(filePath);
        return content !== null
          ? ok(content)
          : {
              error: { message: `File not found: ${filePath}`, code: "ENOENT" },
            };
      },
      readJsonSync: (filePath: string) => {
        const content = fileSystem.readFile(filePath);
        if (content === null)
          return {
            error: { message: `File not found: ${filePath}`, code: "ENOENT" },
          };
        try {
          return ok(JSON.parse(content));
        } catch {
          return { error: { message: "Invalid JSON", code: "JSON_ERR" } };
        }
      },
      writeJson: async (filePath: string, value: unknown) => {
        fileSystem.writeFile(filePath, JSON.stringify(value, null, 2));
        return ok(undefined);
      },
      stat: async (filePath: string) => {
        if (!fileSystem.exists(filePath))
          return { error: { message: "Not found", code: "ENOENT" } };
        return ok({
          isDirectory: () => false,
          isFile: () => true,
          size: 0,
        } as any);
      },
      readdir: async () => ok([]),
    },
    http: mockHttp,
    prompt: {
      intro: async () => {},
      outro: async () => {},
      cancel: async () => {},
      isCancel: async (v) => v === Symbol.for("cancel"),
      info: async () => {},
      warn: async () => {},
      error: async () => {},
      success: async () => {},
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
    },
    process: {
      run: (_command: string, _args: string[], _cwd: string) => ({ status: 0 }),
    },
  };

  return { runtime, fs: fileSystem, mockHttp };
}
export { ok };
