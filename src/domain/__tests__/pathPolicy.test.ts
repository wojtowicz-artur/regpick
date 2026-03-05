import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { resolveOutputPathFromPolicy } from "@/domain/pathPolicy.js";
import type { RegistryItem, RegpickConfig } from "@/types.js";

const baseConfig: RegpickConfig = {
  registry: {
    sources: {},
    preferManifestTarget: true,
  },
  resolve: {
    aliases: {},
    targets: {
      "registry:icon": "src/components/ui/icons",
      "registry:file": "src/components/ui",
    },
  },
  install: {
    overwritePolicy: "prompt",
    packageManager: "auto",
    allowOutsideProject: false,
  },
  plugins: [],
};

const item: RegistryItem = {
  name: "check",
  title: "Check",
  description: "",
  type: "registry:icon",
  dependencies: [],
  devDependencies: [],
  registryDependencies: [],
  files: [
    {
      type: "registry:file",
      path: "icons/check.tsx",
      target: "src/custom/check.tsx",
    },
  ],
  sourceMeta: { type: "directory", pluginState: { baseDir: "/registry" } },
};

describe("path policy core", () => {
  it("prefers manifest target by default", () => {
    const outputRes = Effect.runSync(
      resolveOutputPathFromPolicy(item, item.files[0], "/tmp/project", baseConfig),
    );
    expect(outputRes.relativeTarget).toBe("src/custom/check.tsx");
  });

  it("uses mapped type target when preferManifestTarget is false", () => {
    const outputRes = Effect.runSync(
      resolveOutputPathFromPolicy(item, item.files[0], "/tmp/project", {
        ...baseConfig,
        registry: {
          ...baseConfig.registry,
          sources: baseConfig.registry?.sources || {},
          preferManifestTarget: false,
        },
      }),
    );
    expect(outputRes.relativeTarget).toBe("src/components/ui/check.tsx");
  });

  it("blocks writes outside project root", () => {
    expect(() =>
      Effect.runSync(
        resolveOutputPathFromPolicy(
          item,
          { ...item.files[0], target: "../outside/check.tsx" },
          "/tmp/project",
          baseConfig,
        ),
      ),
    ).toThrowError(/Refusing to write outside project/);
  });

  it("applies path resolvers over built-in targets", () => {
    const configWithResolvers: RegpickConfig = {
      ...baseConfig,
      plugins: [
        {
          type: "path-resolver",
          name: "test-resolver",
          resolve: (file: any, i: any, defaultPath: string) => {
            if (file.path.endsWith(".test.tsx")) return `tests/${defaultPath}`;
            return undefined;
          },
        },
      ],
    };

    const testFile = {
      ...item.files[0],
      path: "icons/check.test.tsx",
      target: "src/custom/check.test.tsx",
    };

    const outputRes = Effect.runSync(
      resolveOutputPathFromPolicy(item, testFile, "/tmp/project", configWithResolvers),
    );
    expect(outputRes.relativeTarget).toBe("tests/src/custom/check.test.tsx");
  });

  it("applies path resolvers to items without explicit targets", () => {
    const configWithResolvers: RegpickConfig = {
      ...baseConfig,
      plugins: [
        {
          type: "path-resolver",
          name: "test-resolver-2",
          resolve: (file: any) => {
            if (file.path.endsWith(".css")) return "styles/theme.css";
            return null;
          },
        },
      ],
    };

    const cssFile = {
      type: "registry:style" as const,
      path: "styles/test.css",
    };

    const outputRes = Effect.runSync(
      resolveOutputPathFromPolicy(item, cssFile, "/tmp/project", configWithResolvers),
    );
    expect(outputRes.relativeTarget).toBe("styles/theme.css");
  });
});
