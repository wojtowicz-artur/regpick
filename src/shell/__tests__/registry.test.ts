import { createMockRuntime } from "@/__tests__/helpers/runtime.js";
import { Effect, Either } from "effect";
import { pathToFileURL } from "node:url";

import { loadRegistry, resolveFileContent } from "@/shell/services/registry.js";

import * as path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DirectoryPlugin } from "@/shell/plugins/builtin/directory.js";
import { FilePlugin } from "@/shell/plugins/builtin/file.js";
import { HttpPlugin } from "@/shell/plugins/builtin/http.js";

describe("registry loader", () => {
  let mockRuntime: ReturnType<typeof createMockRuntime>;
  const mockPlugins = [HttpPlugin(), FilePlugin(), DirectoryPlugin()];

  beforeEach(() => {
    mockRuntime = createMockRuntime();

    // Setup basic mock implementations
    mockRuntime.runtime.http.getJson = vi.fn();
    mockRuntime.runtime.http.getText = vi.fn();
    mockRuntime.runtime.fs.stat = vi.fn();
    mockRuntime.runtime.fs.readFile = vi.fn();
    mockRuntime.runtime.fs.readdir = vi.fn();
  });

  it("should normalize GitHub blob/tree URLs to raw.githubusercontent.com", async () => {
    vi.mocked(mockRuntime.runtime.http.getText).mockReturnValue(
      Effect.succeed(
        JSON.stringify({
          name: "gh-registry",
          items: [{ name: "comp", files: [{ path: "comp.ts", content: "x" }] }],
        }),
      ),
    );

    const result = await Effect.runPromise(
      Effect.either(
        loadRegistry(
          "https://github.com/user/repo/blob/main/registry.json",
          "/test",
          mockRuntime.runtime,
          mockPlugins,
        ),
      ),
    );

    expect(mockRuntime.runtime.http.getText).toHaveBeenCalledWith(
      "https://raw.githubusercontent.com/user/repo/main/registry.json",
    );
    expect(Either.isRight(result)).toBe(true);
  });

  it("should load a registry from a local json file", async () => {
    vi.mocked(mockRuntime.runtime.fs.stat).mockReturnValue(
      Effect.succeed({ isDirectory: () => false } as any),
    );
    vi.mocked(mockRuntime.runtime.fs.readFile).mockReturnValue(
      Effect.succeed(
        JSON.stringify({
          items: [
            {
              name: "local-comp",
              type: "registry:component",
              files: [{ path: "f.ts", content: "ok" }],
            },
          ],
        }),
      ),
    );

    const result = await Effect.runPromise(
      Effect.either(
        loadRegistry("/abs/path/local.json", "/test", mockRuntime.runtime, mockPlugins),
      ),
    );
    expect(Either.isRight(result)).toBe(true);
    if (Either.isRight(result)) {
      expect(result.right.items[0].name).toBe("local-comp");
    }
  });

  it("should resolve a directory registry containing multiple json files", async () => {
    vi.mocked(mockRuntime.runtime.fs.stat).mockReturnValue(
      Effect.succeed({ isDirectory: () => true } as any),
    );
    vi.mocked(mockRuntime.runtime.fs.readdir).mockReturnValue(
      Effect.succeed(["button.json", "input.json", "not.txt"]),
    );

    vi.mocked(mockRuntime.runtime.fs.readFile).mockImplementation((filePath: string) => {
      if (filePath.endsWith("button.json")) {
        return Effect.succeed(
          JSON.stringify({
            name: "button",
            files: [{ path: "b.ts", content: "b" }],
          }),
        );
      }
      return Effect.succeed(
        JSON.stringify({
          name: "input",
          files: [{ path: "i.ts", content: "i" }],
        }),
      );
    });

    const result = await Effect.runPromise(
      Effect.either(loadRegistry("/abs/dir", "/test", mockRuntime.runtime, mockPlugins)),
    );

    expect(Either.isRight(result)).toBe(true);
    if (Either.isRight(result)) {
      expect(result.right.items).toHaveLength(2);
      expect(result.right.items.map((i) => i.name).sort()).toEqual(["button", "input"]);
      expect(result.right.source).toBe(pathToFileURL(path.resolve("/abs/dir")).toString());
    }
  });

  it("should fetch related file content over HTTP using baseUrl", async () => {
    vi.mocked(mockRuntime.runtime.http.getText).mockReturnValue(Effect.succeed("remote-content"));

    const item = {
      name: "net-comp",
      type: "registry:component" as const,
      dependencies: [],
      files: [],
      sourceMeta: {
        type: "http" as const,
        originalSource: "https://example.com/registry/",
      },
    };

    const file = { path: "utils.ts", type: "registry:file" };

    const result = await Effect.runPromise(
      Effect.either(
        resolveFileContent(file as any, item as any, "/test", mockRuntime.runtime, mockPlugins),
      ),
    );
    expect(Either.isRight(result)).toBe(true);
    if (Either.isRight(result)) expect(result.right).toBe("remote-content");

    expect(mockRuntime.runtime.http.getText).toHaveBeenCalledWith(
      "https://example.com/registry/utils.ts",
    );
  });
});
