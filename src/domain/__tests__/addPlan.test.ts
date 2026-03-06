import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { buildInstallPlan, resolveRegistryDependencies } from "@/domain/addPlan.js";
import type { RegistryItem, ResolvedRegpickConfig } from "@/domain/models/index.js";

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
    it("resolves all registry dependencies", async () => {
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
      const { resolvedItems, missingDependencies } = await Effect.runPromise(
        resolveRegistryDependencies([itemWithDeps], allItems),
      );

      expect(missingDependencies).toHaveLength(0);
      expect(resolvedItems).toHaveLength(3);
      expect(resolvedItems.map((i) => i.name)).toEqual(
        expect.arrayContaining(["button", "icon", "utils"]),
      );
    });

    it("returns missing dependencies", async () => {
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
      const { resolvedItems, missingDependencies } = await Effect.runPromise(
        resolveRegistryDependencies([itemWithDeps], allItems),
      );

      expect(missingDependencies).toHaveLength(2);
      expect(missingDependencies).toEqual(expect.arrayContaining(["icon", "utils"]));
      expect(resolvedItems).toHaveLength(1);
      expect(resolvedItems[0].name).toBe("button");
    });

    it("handles diamond dependencies efficiently (no false cycles)", async () => {
      // D is the base component
      const itemD: RegistryItem = {
        name: "D",
        title: "D",
        description: "",
        type: "registry:component",
        dependencies: [],
        devDependencies: [],
        registryDependencies: [],
        files: [],
        sourceMeta: {
          type: "directory",
          pluginState: { baseDir: "/registry" },
        },
      };

      // B and C both depend on D
      const itemB: RegistryItem = {
        ...itemD,
        name: "B",
        registryDependencies: ["D"],
      };
      const itemC: RegistryItem = {
        ...itemD,
        name: "C",
        registryDependencies: ["D"],
      };

      // A depends on both B and C
      const itemA: RegistryItem = {
        ...itemD,
        name: "A",
        registryDependencies: ["B", "C"],
      };

      const allItems = [itemA, itemB, itemC, itemD];

      const { resolvedItems, missingDependencies } = await Effect.runPromise(
        resolveRegistryDependencies([itemA], allItems),
      );

      expect(missingDependencies).toHaveLength(0);
      expect(resolvedItems).toHaveLength(4);
      expect(resolvedItems.map((i) => i.name)).toEqual(
        expect.arrayContaining(["A", "B", "C", "D"]),
      );
    });

    it("handles deep/wide trees simulating larger loads without overflowing", async () => {
      const allItems: RegistryItem[] = [];
      const dependencies: string[] = [];

      // Create 100 middle components, all depending on a single base component
      const baseItem: RegistryItem = {
        name: "base",
        title: "Base",
        description: "",
        type: "registry:component",
        dependencies: [],
        devDependencies: [],
        registryDependencies: [],
        files: [],
        sourceMeta: {
          type: "directory",
          pluginState: { baseDir: "/registry" },
        },
      };
      allItems.push(baseItem);

      for (let i = 0; i < 100; i++) {
        const name = `mid-${i}`;
        dependencies.push(name);
        allItems.push({
          ...baseItem,
          name,
          registryDependencies: ["base"],
        });
      }

      // Root component depending on all 100 middle components
      const rootItem: RegistryItem = {
        ...baseItem,
        name: "root",
        registryDependencies: dependencies,
      };
      allItems.push(rootItem);

      // Effect runner shouldn't crash or take overly long
      const { resolvedItems, missingDependencies } = await Effect.runPromise(
        resolveRegistryDependencies([rootItem], allItems),
      );

      expect(missingDependencies).toHaveLength(0);
      expect(resolvedItems).toHaveLength(102); // 1 root + 100 mid + 1 base
    });
  });
});
