import { Effect } from "effect";
import { pathToFileURL } from "node:url";

import { ok } from "@/core/result.js";
import { loadRegistry, resolveFileContent } from "@/shell/registry.js";
import { createRuntimePorts } from "@/shell/runtime/ports.js";
import * as path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DirectoryPlugin } from "@/shell/plugins/builtin/directory.js";
import { FilePlugin } from "@/shell/plugins/builtin/file.js";
import { HttpPlugin } from "@/shell/plugins/builtin/http.js";

describe("registry loader", () => {
  let mockRuntime: ReturnType<typeof createRuntimePorts>;
  const mockPlugins = [HttpPlugin(), FilePlugin(), DirectoryPlugin()];

  beforeEach(() => {
    mockRuntime = createRuntimePorts();

    // Setup basic mock implementations
    mockRuntime.http.getJson = vi.fn();
    mockRuntime.http.getText = vi.fn();
    mockRuntime.fs.stat = vi.fn();
    mockRuntime.fs.readFile = vi.fn();
    mockRuntime.fs.readdir = vi.fn();
  });

  it("should normalize GitHub blob/tree URLs to raw.githubusercontent.com", async () => {
    vi.mocked(mockRuntime.http.getText).mockReturnValue(
      Effect.succeed(
        JSON.stringify({
          name: "gh-registry",
          items: [{ name: "comp", files: [{ path: "comp.ts", content: "x" }] }],
        }),
      ),
    );

    const result = await loadRegistry(
      "https://github.com/user/repo/blob/main/registry.json",
      "/test",
      mockRuntime,
      mockPlugins,
    );

    expect(mockRuntime.http.getText).toHaveBeenCalledWith(
      "https://raw.githubusercontent.com/user/repo/main/registry.json",
    );
    expect(result.ok).toBe(true);
  });

  it("should load a registry from a local json file", async () => {
    vi.mocked(mockRuntime.fs.stat).mockReturnValue(
      Effect.succeed({ isDirectory: () => false } as any),
    );
    vi.mocked(mockRuntime.fs.readFile).mockReturnValue(
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

    const result = await loadRegistry("/abs/path/local.json", "/test", mockRuntime, mockPlugins);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.items[0].name).toBe("local-comp");
    }
  });

  it("should resolve a directory registry containing multiple json files", async () => {
    vi.mocked(mockRuntime.fs.stat).mockReturnValue(
      Effect.succeed({ isDirectory: () => true } as any),
    );
    vi.mocked(mockRuntime.fs.readdir).mockReturnValue(
      Effect.succeed(["button.json", "input.json", "not.txt"]),
    );

    vi.mocked(mockRuntime.fs.readFile).mockImplementation((filePath: string) => {
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

    const result = await loadRegistry("/abs/dir", "/test", mockRuntime, mockPlugins);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.items).toHaveLength(2);
      expect(result.value.items.map((i) => i.name).sort()).toEqual(["button", "input"]);
      expect(result.value.source).toBe(pathToFileURL(path.resolve("/abs/dir")).toString());
    }
  });

  it("should fetch related file content over HTTP using baseUrl", async () => {
    vi.mocked(mockRuntime.http.getText).mockReturnValue(Effect.succeed("remote-content"));

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

    const result = await resolveFileContent(file, item as any, "/test", mockRuntime, mockPlugins);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe("remote-content");

    expect(mockRuntime.http.getText).toHaveBeenCalledWith("https://example.com/registry/utils.ts");
  });
});
