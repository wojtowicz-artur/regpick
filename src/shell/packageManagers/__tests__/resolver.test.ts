import { Effect } from "effect";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import { resolvePackageManager } from "@/shell/packageManagers/resolver.js";

describe("resolvePackageManager", () => {
  const dummyRuntime = {
    fs: {
      existsSync: vi.fn(),
      pathExists: vi.fn(),
      ensureDir: vi.fn(),
      remove: vi.fn(),
      writeFile: vi.fn(),
      readFile: vi.fn(),
      readJsonSync: vi.fn(),
      writeJson: vi.fn(),
      stat: vi.fn(),
      readdir: vi.fn(),
    },
    http: {
      getJson: vi.fn(),
      getText: vi.fn(),
    },
    prompt: {
      intro: vi.fn(),
      outro: vi.fn(),
      cancel: vi.fn(),
      isCancel: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
      log: vi.fn(),
      text: vi.fn(),
      confirm: vi.fn(),
      select: vi.fn(),
      multiselect: vi.fn(),
      autocompleteMultiselect: vi.fn(),
      spinner: vi.fn(),
    },
    process: {
      run: vi.fn(),
    },
  };

  it("returns configured pm if not auto", async () => {
    const result = await Effect.runPromise(
      resolvePackageManager("/test", "yarn", dummyRuntime as any),
    );
    expect(result).toBe("yarn");
  });

  it("detects pnpm via plugin", async () => {
    vi.mocked(dummyRuntime.fs.existsSync).mockImplementation((p: string) => {
      return path.basename(p) === "pnpm-lock.yaml";
    });
    const result = await Effect.runPromise(
      resolvePackageManager("/test", "auto", dummyRuntime as any),
    );
    expect(result).toBe("pnpm");
  });

  it("detects yarn via plugin", async () => {
    vi.mocked(dummyRuntime.fs.existsSync).mockImplementation((p: string) => {
      return path.basename(p) === "yarn.lock";
    });
    const result = await Effect.runPromise(
      resolvePackageManager("/test", "auto", dummyRuntime as any),
    );
    expect(result).toBe("yarn");
  });

  it("detects bun via plugin", async () => {
    vi.mocked(dummyRuntime.fs.existsSync).mockImplementation((p: string) => {
      return path.basename(p) === "bun.lockb";
    });
    const result = await Effect.runPromise(
      resolvePackageManager("/test", "auto", dummyRuntime as any),
    );
    expect(result).toBe("bun");
  });

  it("falls back to npm if no plugin detects", async () => {
    vi.mocked(dummyRuntime.fs.existsSync).mockReturnValue(false);
    const result = await Effect.runPromise(
      resolvePackageManager("/test", "auto", dummyRuntime as any),
    );
    expect(result).toBe("npm");
  });
});
