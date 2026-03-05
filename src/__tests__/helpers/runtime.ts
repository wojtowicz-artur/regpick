import {
  FileSystemPort,
  HttpPort,
  ProcessPort,
  PromptPort,
  type RuntimePorts,
} from "@/core/ports.js";
import { Context, Effect, Layer } from "effect";
import * as path from "path";
import { vi } from "vitest";

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

export function createMockRuntime(initialFiles: Record<string, string> = {}) {
  const fileSystem = new MemoryFileSystem();
  for (const [filePath, content] of Object.entries(initialFiles)) {
    fileSystem.writeFile(filePath, content);
  }

  const mockHttp = {
    getJson: vi.fn<Context.Tag.Service<HttpPort>["getJson"]>(() => Effect.succeed({} as any)),
    getText: vi.fn<Context.Tag.Service<HttpPort>["getText"]>(() => Effect.succeed("")),
  };

  const fsService: Context.Tag.Service<FileSystemPort> = {
    pathExists: (filePath: string) => Effect.succeed(fileSystem.exists(filePath)),
    existsSync: (filePath: string) => fileSystem.exists(filePath),
    ensureDir: () => Effect.succeed(undefined),
    remove: (_filePath: string) => Effect.succeed(undefined),
    writeFile: (_filePath: string, _content: string) => Effect.succeed(undefined),
    readFile: (_filePath: string) => Effect.succeed({ isDirectory: () => false } as any),
    readdir: () => Effect.succeed([]),
    readJsonSync: () => Effect.succeed({} as any),
    writeJson: () => Effect.succeed(undefined),
    stat: () => Effect.succeed({ isDirectory: () => false, isFile: () => true }),
  };

  const httpService = mockHttp as unknown as Context.Tag.Service<HttpPort>;

  const promptService: Context.Tag.Service<PromptPort> = {
    intro: () => Effect.void,
    outro: () => Effect.void,
    cancel: () => Effect.void,
    isCancel: (v: unknown) => Effect.succeed(v === Symbol.for("cancel")),
    info: () => Effect.void,
    warn: () => Effect.void,
    error: () => Effect.void,
    success: () => Effect.void,
    log: () => Effect.void,
    text: vi
      .fn()
      .mockImplementation(
        async (options: Parameters<Context.Tag.Service<PromptPort>["text"]>[0]) =>
          options.defaultValue || "",
      ),
    confirm: vi.fn().mockImplementation(async () => true),
    select: vi
      .fn()
      .mockImplementation(
        async (options: Parameters<Context.Tag.Service<PromptPort>["select"]>[0]) =>
          options.options[0].value,
      ),
    multiselect: vi
      .fn()
      .mockImplementation(
        async (options: Parameters<Context.Tag.Service<PromptPort>["multiselect"]>[0]) =>
          options.options.map((o) => o.value),
      ),
    autocompleteMultiselect: vi
      .fn()
      .mockImplementation(
        async (
          options: Parameters<Context.Tag.Service<PromptPort>["autocompleteMultiselect"]>[0],
        ) => options.options.map((o) => o.value),
      ),
  };

  const processService: Context.Tag.Service<ProcessPort> = {
    run: (_command: string, _args: string[], _cwd: string) => ({ status: 0 }),
  };

  const runtime: RuntimePorts = {
    fs: fsService,
    http: httpService,
    prompt: promptService,
    process: processService,
  };

  const RuntimeLive = Layer.mergeAll(
    Layer.succeed(FileSystemPort, fsService),
    Layer.succeed(HttpPort, httpService),
    Layer.succeed(PromptPort, promptService),
    Layer.succeed(ProcessPort, processService),
  );

  return {
    runtime,
    fs: fileSystem,
    mockHttp,
    fsService,
    httpService,
    promptService,
    processService,
    RuntimeLive,
  };
}
