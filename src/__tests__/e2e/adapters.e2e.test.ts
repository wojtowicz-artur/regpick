import { execa } from "execa";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

describe("regpick e2e (adapters)", () => {
  const projectRoot = path.resolve(".");
  const entryPath = path.resolve("dist/index.mjs");

  beforeAll(async () => {
    // Ensure we have a fresh build before running E2E tests
    await execa("npm", ["run", "build"], { cwd: projectRoot });
  });

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
  targetsByType: {
    "registry:test": "src/test-components",
  },
  adapters: [
    {
      name: "mock-proto",
      match: ({ source }) => source.startsWith("mock-proto://"),
      resolveItemReference: async () => ({ ok: false, error: new Error("Not implemented") }),
      resolveManifest: async ({ source }, runtime) => {
        if (!source.startsWith("mock-proto://")) {
          return { ok: false, error: new Error("Not supported") };
        }
        return {
          ok: true,
          value: {
            resolvedSource: source,
            sourceMeta: { type: "mock-proto", url: "mock-proto://test" },
            items: [
              {
                name: "mock-button",
                type: "registry:test",
                sourceMeta: {
                  type: "mock-proto",
                  url: "mock-proto://button-file"
                },
                files: [
                  { path: "mock-button.ts" }
                ]
              }
            ]
          }
        };
      },
      resolveFile: async (file, item, cwd, runtime) => {
        if (file.path === "mock-button.ts") {
          return { ok: true, value: "export const MockButton = () => <button>Hello</button>;" };
        }
        return { ok: false, error: new Error("File not found") };
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
        { cwd: testDir },
      );

      // Verify file got written
      const componentPath = path.join(testDir, "src/test-components/mock-button.ts");
      const content = await fs.readFile(componentPath, "utf-8");
      expect(content).toContain("export const MockButton");

      // Verify lockfile
      const lockfilePath = path.join(testDir, "regpick-lock.json");
      const lockfileContent = JSON.parse(await fs.readFile(lockfilePath, "utf8"));
      expect(lockfileContent.components["mock-button"]).toBeDefined();
    } finally {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  }, 60000);

  it("should load adapters from external modules via string reference", async () => {
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
  match: ({ source }) => source.startsWith("external-proto://"),
  resolveManifest: async ({ source }) => {
    return {
      ok: true,
      value: {
        resolvedSource: source,
        sourceMeta: { type: "external-proto", url: source },
        items: [
          {
            name: "external-card",
            type: "registry:test",
            sourceMeta: { type: "external-proto", url: "file-ref" },
            files: [{ path: "card.ts" }]
          }
        ]
      }
    };
  },
  resolveFile: async (file) => {
    if (file.path === "card.ts") {
      return { ok: true, value: "export const Card = () => <div />;" };
    }
    return { ok: false, error: new Error("File not found") };
  }
};
`;
      await fs.writeFile(path.join(testDir, "custom-adapter.mjs"), adapterContent);

      const configContent = `
export default {
  targetsByType: {
    "registry:test": "src/test-components",
  },
  adapters: ["./custom-adapter.mjs"]
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
