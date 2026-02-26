import { describe, expect, it } from "vitest";

import type { RegpickConfig, RegistryItem } from "../../types.js";
import { buildInstallPlan } from "../addPlan.js";

const config: RegpickConfig = {
  registries: {},
  targetsByType: {
    "registry:icon": "src/components/ui/icons",
    "registry:file": "src/components/ui",
  },
  overwritePolicy: "prompt",
  packageManager: "auto",
  preferManifestTarget: false,
  allowOutsideProject: false,
};

const items: RegistryItem[] = [
  {
    name: "check",
    title: "Check",
    description: "",
    type: "registry:icon",
    dependencies: ["react"],
    devDependencies: ["@types/react"],
    registryDependencies: [],
    files: [{ type: "registry:file", path: "icons/check.tsx" }],
    sourceMeta: { type: "directory", baseDir: "/registry" },
  },
  {
    name: "calendar",
    title: "Calendar",
    description: "",
    type: "registry:icon",
    dependencies: ["react", "clsx"],
    devDependencies: [],
    registryDependencies: [],
    files: [{ type: "registry:file", path: "icons/calendar.tsx" }],
    sourceMeta: { type: "directory", baseDir: "/registry" },
  },
];

describe("add plan core", () => {
  it("builds deduplicated dependency plan", () => {
    const planRes = buildInstallPlan(items, "/tmp/project", config);
    expect(planRes.ok).toBe(true);
    if (planRes.ok) {
      expect(planRes.value.dependencyPlan.dependencies).toEqual(["react", "clsx"]);
      expect(planRes.value.dependencyPlan.devDependencies).toEqual(["@types/react"]);
    }
  });

  it("detects conflicts based on existing target paths", () => {
    const firstPlanRes = buildInstallPlan(items, "/tmp/project", config);
    expect(firstPlanRes.ok).toBe(true);
    if (!firstPlanRes.ok) return;
    const existingTargets = new Set([firstPlanRes.value.plannedWrites[0].absoluteTarget]);
    const planWithConflictsRes = buildInstallPlan(items, "/tmp/project", config, existingTargets);
    expect(planWithConflictsRes.ok).toBe(true);
    if (!planWithConflictsRes.ok) return;
    expect(planWithConflictsRes.value.conflicts).toHaveLength(1);
    expect(planWithConflictsRes.value.conflicts[0].itemName).toBe("check");
  });
});
