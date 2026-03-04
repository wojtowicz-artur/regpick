import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { buildUpdatePlanForItem } from "@/domain/updatePlan.js";
import { computeTreeHash } from "@/shell/lockfile.js";
import type { LockfileItem, RegistryItem, RegpickConfig } from "@/types.js";

const config: RegpickConfig = {
  resolve: {
    aliases: {},
    targets: {
      "registry:icon": "src/components/ui/icons",
      "registry:file": "src/components/ui",
    },
  },
  registry: {
    sources: {},
    preferManifestTarget: false,
  },
  install: {
    overwritePolicy: "prompt",
    packageManager: "auto",
    allowOutsideProject: false,
  },
  plugins: [],
};

const mockItem: RegistryItem = {
  name: "button",
  title: "Button",
  description: "",
  type: "registry:file",
  dependencies: [],
  devDependencies: [],
  registryDependencies: [],
  files: [{ type: "registry:file", path: "button.tsx", target: "ui/button.tsx" }],
  sourceMeta: { type: "directory", pluginState: { baseDir: "/registry" } },
};

describe("update plan core", () => {
  it("detects updates properly comparing remoteHash", async () => {
    const lockfileItem: LockfileItem = {
      hash: "pending",
      remoteHash: "old-hash-string",
    };

    const resolvedFiles = [
      {
        file: {
          type: "registry:file",
          path: "button.tsx",
          target: "ui/button.tsx",
        },
        content: "export const Button = () => <button>Click me</button>;",
      },
    ];

    const planRes = Effect.runSync(
      buildUpdatePlanForItem(
        "button",
        mockItem,
        resolvedFiles,
        lockfileItem,
        "/tmp/project",
        config,
      ),
    );

    expect(planRes.status).toBe("requires-diff-prompt");
    expect(planRes.newHash).not.toBe("old-hash-string");
    expect(planRes.files).toHaveLength(1);
    expect(planRes.files[0].content).toBe(resolvedFiles[0].content);
  });

  it("handles pending hash by forcing update prompt", async () => {
    const lockfileItem: LockfileItem = {
      hash: "pending",
    };

    const resolvedFiles = [
      {
        file: {
          type: "registry:file",
          path: "button.tsx",
          target: "ui/button.tsx",
        },
        content: "export const Button = () => <button>Click me</button>;",
      },
    ];

    const planRes = Effect.runSync(
      buildUpdatePlanForItem(
        "button",
        mockItem,
        resolvedFiles,
        lockfileItem,
        "/tmp/project",
        config,
      ),
    );

    expect(planRes.status).toBe("requires-diff-prompt");
  });

  it("identifies as up-to-date when remoteHash matches the computed source tree hash", async () => {
    const resolvedFiles = [
      {
        file: {
          type: "registry:file",
          path: "button.tsx",
          target: "ui/button.tsx",
        },
        content: "export const Button = () => <button>Click me</button>;",
      },
      {
        file: {
          type: "registry:file",
          path: "utils.ts",
          target: "lib/utils.ts",
        },
        content: "export const cn = () => {};",
      },
    ];

    // Compute the expected hash that the CAS system will generate
    const configPathPolicyResolvedFiles = [
      {
        path: "src/components/ui/button.tsx",
        content: "export const Button = () => <button>Click me</button>;",
      },
      {
        path: "src/components/ui/utils.ts",
        content: "export const cn = () => {};",
      },
    ];
    const expectedHash = computeTreeHash(configPathPolicyResolvedFiles);

    const lockfileItem: LockfileItem = {
      hash: "local-hash-ignored",
      remoteHash: expectedHash,
    };

    const planRes = Effect.runSync(
      buildUpdatePlanForItem(
        "button",
        mockItem,
        resolvedFiles,
        lockfileItem,
        "/tmp/project",
        config,
      ),
    );

    expect(planRes.status).toBe("up-to-date");
    expect(planRes.newHash).toBe(expectedHash);
  });

  it("identifies as up-to-date when legacy lockfile hash matches the computed source tree hash", async () => {
    const resolvedFiles = [
      {
        file: {
          type: "registry:file",
          path: "button.tsx",
          target: "ui/button.tsx",
        },
        content: "export const Button = () => <button>Click me</button>;",
      },
    ];

    // Compute the expected hash for a single file
    const expectedHash = computeTreeHash([
      {
        path: "src/components/ui/button.tsx",
        content: "export const Button = () => <button>Click me</button>;",
      },
    ]);

    // Legacy lockfile representation: no remoteHash/localHash split, just 'hash'
    const lockfileItem: LockfileItem = {
      hash: expectedHash,
    };

    const planRes = Effect.runSync(
      buildUpdatePlanForItem(
        "button",
        mockItem,
        resolvedFiles,
        lockfileItem,
        "/tmp/project",
        config,
      ),
    );

    expect(planRes.status).toBe("up-to-date");
    expect(planRes.newHash).toBe(expectedHash);
  });
});
