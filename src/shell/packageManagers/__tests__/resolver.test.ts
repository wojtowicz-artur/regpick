import { describe, expect, it } from "vitest";

import { appError } from "@/core/errors.js";
import { err, ok } from "@/core/result.js";
import { resolvePackageManager } from "@/shell/packageManagers/resolver.js";
import type { RuntimePorts } from "@/shell/runtime/ports.js";

function runtimeWithLockfiles(lockfiles: string[]): RuntimePorts {
  return {
    fs: {
      existsSync: (filePath: string) => lockfiles.some((lock) => filePath.endsWith(lock)),
      pathExists: async () => false,
      ensureDir: async () => ok(undefined),
      remove: async () => ok(undefined),
      writeFile: async () => ok(undefined),
      readFile: async () => ok(""),
      readJsonSync: <T>() => ok({} as T),
      writeJson: async () => ok(undefined),
      stat: async () => err(appError("RuntimeError", "not implemented")),
      readdir: async () => ok([]),
    },
    http: {
      getJson: async <T>() => ok({} as T),
      getText: async () => ok(""),
    },
    prompt: {
      intro: async () => undefined,
      outro: async () => undefined,
      cancel: async () => undefined,
      isCancel: async () => false,
      info: async () => undefined,
      warn: async () => undefined,
      error: async () => undefined,
      success: async () => undefined,
      text: async () => "",
      confirm: async () => true,
      select: async () => "overwrite",
      multiselect: async () => [],
      autocompleteMultiselect: async () => [],
    },
    process: {
      run: () => ({ status: 0 }),
    },
  };
}

describe("package manager resolver", () => {
  it("prefers configured manager over lockfiles", () => {
    const runtime = runtimeWithLockfiles(["pnpm-lock.yaml"]);
    expect(resolvePackageManager("/tmp/project", "yarn", runtime)).toBe("yarn");
  });

  it("resolves lockfile-based manager", () => {
    expect(
      resolvePackageManager("/tmp/project", "auto", runtimeWithLockfiles(["pnpm-lock.yaml"])),
    ).toBe("pnpm");
    expect(resolvePackageManager("/tmp/project", "auto", runtimeWithLockfiles(["yarn.lock"]))).toBe(
      "yarn",
    );
    expect(
      resolvePackageManager("/tmp/project", "auto", runtimeWithLockfiles(["package-lock.json"])),
    ).toBe("npm");
  });

  it("falls back to npm when no lockfile exists", () => {
    expect(resolvePackageManager("/tmp/project", "auto", runtimeWithLockfiles([]))).toBe("npm");
  });
});
