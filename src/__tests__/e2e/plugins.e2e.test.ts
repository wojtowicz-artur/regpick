import { execa } from "execa";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("regpick e2e (plugins)", () => {
  const entryPath = path.resolve("dist/index.mjs");

  it("should install a component using an inline custom adapter defined in regpick.mjs", async () => {
    const testDir = path.join(tmpdir(), `regpick-adapter-e2e-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });

    try {
      // Write minimal package.json
      await fs.writeFile(
        path.join(testDir, "package.json"),
        JSON.stringify({ name: "e2e-test", version: "1.0.0" }),
      );

      // Write regpick.mjs with our custom adapter
      const configContent = `
export default {
  resolve: { targets: {
    "registry:test": "src/test-components" },
  },
  plugins: [
    {
      name: "mock-proto",
      resolveId: async (source, importer) => {
        if (source.startsWith("mock-proto://")) return source;
        if (source === "mock-button.ts") return source;
        return null;
      },
      load: async (id) => {
        if (id === "mock-proto://my-custom-registry") {
            return { items: [{ name: "mock-button", type: "registry:test", files: [{ path: "mock-button.ts" }] }] };
        }
        if (id === "mock-button.ts") {
            return "export const MockButton = () => <button>Hello</button>;";
        }
        return null;
      }
    }
  ]
};
`;
      await fs.writeFile(path.join(testDir, "regpick.mjs"), configContent);

      // Test list command to verify adapter loads the manifest
      const listResult = await execa(
        "node",
        [entryPath, "list", "mock-proto://my-custom-registry"],
        { cwd: testDir },
      );
      expect(listResult.stdout).toContain("mock-button");

      // Test add command
      await execa(
        "node",
        [entryPath, "add", "mock-proto://my-custom-registry", "mock-button", "--yes"],
        { cwd: testDir, reject: false },
      );

      // Verify file got written
      const componentPath = path.join(testDir, "src/test-components/mock-button.ts");
      const content = await fs.readFile(componentPath, "utf-8");
      expect(content).toContain("export const MockButton");

      // Verify lockfile source tracking
      const lockfilePath = path.join(testDir, "regpick-lock.json");
      let lockfileContent = JSON.parse(await fs.readFile(lockfilePath, "utf8"));
      expect(lockfileContent.components["mock-button"]).toBeDefined();
      expect(lockfileContent.components["mock-button"].source).toBe(
        "mock-proto://my-custom-registry",
      );

      // Test update command: update the adapter mock behavior to simulate a new version
      const configContentUpdated = configContent.replace(
        "export const MockButton = () => <button>Hello</button>;",
        "export const MockButton = () => <button>Hello Updated</button>;",
      );
      await fs.writeFile(path.join(testDir, "regpick.mjs"), configContentUpdated);

      // Run update - assuming it finds the mock-proto://my-custom-registry source from lockfile gracefully
      const updateRes = await execa("node", [entryPath, "update", "--yes"], {
        cwd: testDir,
        reject: false,
      });
      if (updateRes.exitCode !== 0) {
        console.error("UPDATE FAILED", updateRes.stdout, updateRes.stderr);
        throw new Error("Update crashed");
      }

      const contentUpdated = await fs.readFile(componentPath, "utf-8");
      expect(contentUpdated).toContain(
        "export const MockButton = () => <button>Hello Updated</button>;",
      );
    } finally {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  }, 60000);

  it("should load plugins from external modules via string reference", async () => {
    const testDir = path.join(tmpdir(), `regpick-adapter-e2e-external-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });

    try {
      await fs.writeFile(
        path.join(testDir, "package.json"),
        JSON.stringify({ name: "e2e-test-external", version: "1.0.0" }),
      );

      // create custom adapter module
      const adapterContent = `
export default {
  name: "external-proto",
  resolveId: async (source, importer) => {
      if (source.startsWith("external-proto://") || source === 'card.ts') return source;
      return null;
  },
  load: async (id) => {
      if (id.startsWith("external-proto://")) {
          return { items: [{ name: "external-card", type: "registry:test", files: [{ path: "card.ts" }] }] };
      }
      if (id === "card.ts") return "export const Card = () => <div />;";
      return null;
  }
};
`;
      await fs.writeFile(path.join(testDir, "custom-adapter.mjs"), adapterContent);

      const configContent = `
export default {
  resolve: { targets: {
    "registry:test": "src/test-components" },
  },
  plugins: ["./custom-adapter.mjs"]
};
`;
      await fs.writeFile(path.join(testDir, "regpick.mjs"), configContent);

      const listResult = await execa("node", [entryPath, "list", "external-proto://test"], {
        cwd: testDir,
      });
      expect(listResult.stdout).toContain("external-card");

      const addResult = await execa(
        "node",
        [entryPath, "add", "external-proto://test", "external-card", "--yes"],
        { cwd: testDir },
      );
      console.log(addResult.stdout);

      const componentPath = path.join(testDir, "src/test-components/card.ts");
      const content = await fs.readFile(componentPath, "utf-8");
      expect(content).toContain("export const Card");
    } finally {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  }, 60000);
});
