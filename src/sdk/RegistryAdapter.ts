export interface AdapterContext {
  cwd: string;
  fs: {
    existsSync(path: string): boolean;
    readFile(path: string, encoding?: BufferEncoding): Promise<string | Uint8Array>;
    stat(path: string): Promise<{ isDirectory(): boolean; isFile(): boolean }>;
    readdir(path: string): Promise<string[]>;
  };
  http: {
    getJson<T = unknown>(url: string, timeoutMs?: number): Promise<T>;
    getText(url: string, timeoutMs?: number): Promise<string>;
  };
}

export interface RawRegistryData {
  items: unknown[];
  source: string;
}

export interface RegistryAdapter {
  readonly type: "registry-adapter";
  readonly name: string;
  /** INV-08: czysta heurystyka, zero I/O */
  canHandle(source: string): boolean;
  load(source: string, ctx: AdapterContext): Promise<RawRegistryData>;
  loadFileContent(
    file: { path?: string; url?: string; content?: string },
    item: { sourceMeta: { originalSource?: string } },
    ctx: AdapterContext,
  ): Promise<string>;
}
