import { Effect, Either } from "effect";
import fsPromises from "fs/promises";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRegistryService } from "../service.js";
import {
  ShadcnRegistryAdapter,
  HttpRegistryAdapter,
  FileRegistryAdapter,
  DirectoryRegistryAdapter,
} from "../adapters/index.js";

vi.stubGlobal("fetch", vi.fn());

vi.mock("fs/promises", () => ({
  default: {
    stat: vi.fn(),
    readFile: vi.fn(),
    readdir: vi.fn(),
  },
}));

describe("RegistryService (Infra Adapters)", () => {
  beforeEach(() => {
    vi.mocked(fetch).mockClear();
    vi.mocked(fsPromises.stat).mockClear();
    vi.mocked(fsPromises.readFile).mockClear();
  });

  const mockFs = {
    existsSync: vi.fn().mockReturnValue(true),
    readFile: (p: string) => fsPromises.readFile(p, "utf-8"),
    stat: (p: string) => fsPromises.stat(p) as any,
    readdir: (p: string) => fsPromises.readdir(p),
  };

  const mockHttp = {
    getJson: async <T>(url: string) => {
      const res = await fetch(url);
      return res.json() as Promise<T>;
    },
    getText: async (url: string) => {
      const res = await fetch(url);
      return res.text();
    },
  };

  const adapterCtx = {
    cwd: "/",
    fs: mockFs as any,
    http: mockHttp,
  };

  const RegistryService = createRegistryService(
    [
      new ShadcnRegistryAdapter(),
      new HttpRegistryAdapter(),
      new FileRegistryAdapter(),
      new DirectoryRegistryAdapter(),
    ],
    adapterCtx,
  );

  const loadManifest = (src: string) =>
    Effect.runPromise(Effect.either(RegistryService.loadManifest(src)));
  const loadFileContent = (file: any, item: any) =>
    Effect.runPromise(Effect.either(RegistryService.loadFileContent(file, item)));

  it("should fetch HTTP registry using HttpRegistryAdapter", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ items: [{ name: "btn" }] })),
      json: () => Promise.resolve({ items: [{ name: "btn" }] }),
    } as any);

    const result = await loadManifest("https://ui.shadcn.test/registry.json");
    expect(Either.isRight(result)).toBe(true);
    if (Either.isRight(result)) {
      expect(result.right.items[0].name).toBe("btn");
    }
  });

  it("should load a registry from a local json file using FileRegistryAdapter", async () => {
    vi.mocked(fsPromises.stat).mockResolvedValueOnce({
      isDirectory: () => false,
    } as any);
    vi.mocked(fsPromises.readFile).mockResolvedValueOnce(
      JSON.stringify({
        items: [{ name: "local-btn" }],
      }),
    );

    const result = await loadManifest("file:///abs/path/local.json");
    expect(Either.isRight(result)).toBe(true);
    if (Either.isRight(result)) {
      expect(result.right.items[0].name).toBe("local-btn");
    }
  });

  it("should fetch file content over HTTP", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve("remote-content"),
    } as any);

    const item = {
      name: "comp",
      type: "registry:ui",
      files: [],
      sourceMeta: { originalSource: "https://test.com/registry.json" },
    };
    const file = { url: "https://test.com/utils.ts", path: "utils.ts" };

    const result = await loadFileContent(file as any, item as any);
    expect(Either.isRight(result)).toBe(true);
    if (Either.isRight(result)) {
      expect(result.right).toBe("remote-content");
    }
  });

  it("should read local file content correctly", async () => {
    vi.mocked(fsPromises.readFile).mockResolvedValueOnce("local-content");

    const item = {
      name: "comp",
      type: "registry:ui",
      files: [],
      sourceMeta: { originalSource: "file:///abs/path/registry.json" },
    };
    const file = { path: "utils.ts" };

    const result = await loadFileContent(file as any, item as any);
    expect(Either.isRight(result)).toBe(true);
    if (Either.isRight(result)) {
      expect(result.right).toBe("local-content");
      // Check if it got resolved
      expect(vi.mocked(fsPromises.readFile)).toHaveBeenCalledWith(
        path.resolve("/abs/path", "utils.ts"),
        "utf-8",
      );
    }
  });
});
