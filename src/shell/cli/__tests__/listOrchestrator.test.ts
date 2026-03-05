import type { RegistryItem, RegpickLockfile } from "@/types.js";
import { describe, expect, it } from "vitest";
import { formatItemLabel } from "../listOrchestrator.js";

describe("formatItemLabel", () => {
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

  it("formats an uninstalled item without lockfile context correctly", () => {
    const output = formatItemLabel(mockItem);
    expect(output).toBe("button (registry:file, files: 1)");
  });

  it("formats an uninstalled item with empty lockfile context correctly", () => {
    const lockfile = { lockfileVersion: 2, components: {} } as RegpickLockfile;
    const output = formatItemLabel(mockItem, lockfile);
    expect(output).toBe("button (registry:file, files: 1)");
  });

  it("formats an installed item with version and date appropriately", () => {
    const lockfile = {
      lockfileVersion: 2,
      components: {
        button: {
          version: "1.2.3",
          installedAt: "2024-03-05T12:00:00Z",
          files: [],
        },
      },
    } as unknown as RegpickLockfile;
    const output = formatItemLabel(mockItem, lockfile);
    expect(output).toContain("button (registry:file, files: 1)");
    expect(output).toContain("[Installed: v1.2.3, ");
  });

  it("formats an installed item without version gracefully", () => {
    const lockfile = {
      lockfileVersion: 2,
      components: {
        button: {
          installedAt: "2024-03-05T12:00:00Z",
          files: [],
        },
      },
    } as unknown as RegpickLockfile;
    const output = formatItemLabel(mockItem, lockfile);
    expect(output).toContain("button (registry:file, files: 1)");
    expect(output).toContain("[Installed: ");
    expect(output).not.toContain("vundefined");
  });
});
