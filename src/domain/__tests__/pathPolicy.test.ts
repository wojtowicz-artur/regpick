import { describe, expect, it } from "vitest";

import type { RegpickConfig, RegistryItem } from "../../types.js";
import { resolveOutputPathFromPolicy } from "../pathPolicy.js";

const baseConfig: RegpickConfig = {
  registries: {},
  targetsByType: {
    "registry:icon": "src/components/ui/icons",
    "registry:file": "src/components/ui",
  },
  overwritePolicy: "prompt",
  packageManager: "auto",
  preferManifestTarget: true,
  allowOutsideProject: false,
};

const item: RegistryItem = {
  name: "check",
  title: "Check",
  description: "",
  type: "registry:icon",
  dependencies: [],
  devDependencies: [],
  registryDependencies: [],
  files: [{ type: "registry:file", path: "icons/check.tsx", target: "src/custom/check.tsx" }],
  sourceMeta: { type: "directory", baseDir: "/registry" },
};

describe("path policy core", () => {
  it("prefers manifest target by default", () => {
    const outputRes = resolveOutputPathFromPolicy(item, item.files[0], "/tmp/project", baseConfig);
    expect(outputRes.ok).toBe(true);
    if (outputRes.ok) {
      expect(outputRes.value.relativeTarget).toBe("src/custom/check.tsx");
    }
  });

  it("uses mapped type target when preferManifestTarget is false", () => {
    const outputRes = resolveOutputPathFromPolicy(
      item,
      item.files[0],
      "/tmp/project",
      { ...baseConfig, preferManifestTarget: false },
    );
    expect(outputRes.ok).toBe(true);
    if (outputRes.ok) {
      expect(outputRes.value.relativeTarget).toBe("src/components/ui/check.tsx");
    }
  });

  it("blocks writes outside project root", () => {
    const outputRes = resolveOutputPathFromPolicy(
      item,
      { ...item.files[0], target: "../outside/check.tsx" },
      "/tmp/project",
      baseConfig,
    );
    expect(outputRes.ok).toBe(false);
    if (!outputRes.ok) {
      expect(outputRes.error.message).toMatch(/Refusing to write outside project/);
    }
  });
});
