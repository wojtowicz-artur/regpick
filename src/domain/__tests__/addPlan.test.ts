import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { buildInstallPlan, resolveRegistryDependencies } from "@/domain/addPlan.js";
import type { RegistryItem, RegpickConfig } from "@/types.js";

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
    sourceMeta: { type: "directory", pluginState: { baseDir: "/registry" } },
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
    sourceMeta: { type: "directory", pluginState: { baseDir: "/registry" } },
  },
];

describe("add plan core", () => {
  it("builds deduplicated dependency plan", () => {
    const planRes = Effect.runSync(buildInstallPlan(items, "/tmp/project", config));
    expect(planRes.dependencyPlan.dependencies).toEqual(["react", "clsx"]);
    expect(planRes.dependencyPlan.devDependencies).toEqual(["@types/react"]);
  });

  it("detects conflicts based on existing target paths", () => {
    const firstPlanRes = Effect.runSync(buildInstallPlan(items, "/tmp/project", config));
    const existingTargets = new Set([firstPlanRes.plannedWrites[0].absoluteTarget]);
    const planWithConflictsRes = Effect.runSync(
      buildInstallPlan(items, "/tmp/project", config, existingTargets),
    );
    expect(planWithConflictsRes.conflicts).toHaveLength(1);
    expect(planWithConflictsRes.conflicts[0].itemName).toBe("check");
  });

  describe("resolveRegistryDependencies", () => {
    it("resolves all registry dependencies", () => {
      const itemWithDeps: RegistryItem = {
        name: "button",
        title: "Button",
        description: "",
        type: "registry:component",
        dependencies: [],
        devDependencies: [],
        registryDependencies: ["icon", "utils"],
        files: [],
        sourceMeta: {
          type: "directory",
          pluginState: { baseDir: "/registry" },
        },
      };
      const iconItem: RegistryItem = {
        ...itemWithDeps,
        name: "icon",
        registryDependencies: [],
      };
      const utilsItem: RegistryItem = {
        ...itemWithDeps,
        name: "utils",
        registryDependencies: [],
      };

      const allItems = [itemWithDeps, iconItem, utilsItem];
      const { resolvedItems, missingDependencies } = resolveRegistryDependencies(
        [itemWithDeps],
        allItems,
      );

      expect(missingDependencies).toHaveLength(0);
      expect(resolvedItems).toHaveLength(3);
      expect(resolvedItems.map((i) => i.name)).toEqual(
        expect.arrayContaining(["button", "icon", "utils"]),
      );
    });

    it("returns missing dependencies", () => {
      const itemWithDeps: RegistryItem = {
        name: "button",
        title: "Button",
        description: "",
        type: "registry:component",
        dependencies: [],
        devDependencies: [],
        registryDependencies: ["icon", "utils"],
        files: [],
        sourceMeta: {
          type: "directory",
          pluginState: { baseDir: "/registry" },
        },
      };

      const allItems = [itemWithDeps];
      const { resolvedItems, missingDependencies } = resolveRegistryDependencies(
        [itemWithDeps],
        allItems,
      );

      expect(missingDependencies).toHaveLength(2);
      expect(missingDependencies).toEqual(expect.arrayContaining(["icon", "utils"]));
      expect(resolvedItems).toHaveLength(1);
      expect(resolvedItems[0].name).toBe("button");
    });
  });
});
