import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import { resolvePackageManager } from "@/shell/packageManagers/resolver.js";

describe("resolvePackageManager", () => {
  const dummyRuntime = {
    fs: {
      existsSync: vi.fn(),
    },
  };

  it("returns configured pm if not auto", async () => {
    const result = await resolvePackageManager("/test", "yarn", dummyRuntime as any);
    expect(result).toBe("yarn");
  });

  it("detects pnpm via plugin", async () => {
    vi.mocked(dummyRuntime.fs.existsSync).mockImplementation((p: string) => {
      return path.basename(p) === "pnpm-lock.yaml";
    });
    const result = await resolvePackageManager("/test", "auto", dummyRuntime as any);
    expect(result).toBe("pnpm");
  });

  it("detects yarn via plugin", async () => {
    vi.mocked(dummyRuntime.fs.existsSync).mockImplementation((p: string) => {
      return path.basename(p) === "yarn.lock";
    });
    const result = await resolvePackageManager("/test", "auto", dummyRuntime as any);
    expect(result).toBe("yarn");
  });

  it("detects bun via plugin", async () => {
    vi.mocked(dummyRuntime.fs.existsSync).mockImplementation((p: string) => {
      return path.basename(p) === "bun.lockb";
    });
    const result = await resolvePackageManager("/test", "auto", dummyRuntime as any);
    expect(result).toBe("bun");
  });

  it("falls back to npm if no plugin detects", async () => {
    vi.mocked(dummyRuntime.fs.existsSync).mockReturnValue(false);
    const result = await resolvePackageManager("/test", "auto", dummyRuntime as any);
    expect(result).toBe("npm");
  });
});
