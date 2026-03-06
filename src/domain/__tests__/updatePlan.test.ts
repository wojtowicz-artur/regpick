import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { buildUpdatePlanForItem } from "@/domain/updatePlan.js";
import { computeHash } from "@/execution/lockfile/service.js";
import type {
  ComponentLockItem,
  RegistryItem,
  ResolvedRegpickConfig,
} from "@/domain/models/index.js";

const config: ResolvedRegpickConfig = {
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
  it("detects updates properly comparing file hashes", async () => {
    const lockfileItem: ComponentLockItem = {
      installedAt: "2024-01-01T00:00:00Z",
      files: [{ path: "ui/button.tsx", hash: "old-hash" }],
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
    expect(planRes.newFiles[0].hash).toBe(computeHash(resolvedFiles[0].content));
    expect(planRes.files).toHaveLength(1);
    expect(planRes.files[0].content).toBe(resolvedFiles[0].content);
  });

  it("handles pending hash by forcing update prompt", async () => {
    const lockfileItem: ComponentLockItem = {
      installedAt: "2024-01-01T00:00:00Z",
      files: [],
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

  it("identifies as up-to-date when lockfile hashes match the computed source tree hash", async () => {
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

    const configPathPolicyResolvedFiles = [
      {
        path: "src/components/ui/button.tsx",
        hash: computeHash("export const Button = () => <button>Click me</button>;"),
      },
      {
        path: "src/components/ui/utils.ts",
        hash: computeHash("export const cn = () => {};"),
      },
    ];

    const lockfileItem: ComponentLockItem = {
      installedAt: "2024-01-01T00:00:00Z",
      files: configPathPolicyResolvedFiles,
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
    expect(planRes.newFiles.length).toBe(2);
  });
});
