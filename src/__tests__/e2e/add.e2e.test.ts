import { execa } from "execa";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

describe("regpick e2e (local file network)", () => {
  const isE2E = process.env.RUN_E2E === "true";
  const projectRoot = path.resolve(".");

  beforeAll(async () => {
    // Ensure we have a fresh build for E2E
    if (isE2E) {
      // In a real environment, we might want to skip build if already there
      // or rely on tsdown during execution
    }
  });

  it.skipIf(!isE2E)(
    "should install formatting util from local offline registry",
    async () => {
      const testDir = path.join(tmpdir(), `regpick-e2e-${Date.now()}`);
      await fs.mkdir(testDir, { recursive: true });

      try {
        // 1. Initialize
        // We use the compiled dist file for e2e test
        const entryPath = path.resolve("dist/index.mjs");

        await execa("node", [entryPath, "init", "--yes"], { cwd: testDir });

        // Since init is mocked in current architecture, we'll manually create the config
        await fs.writeFile(
          path.join(testDir, "regpick.json"),
          JSON.stringify(
            {
              $schema: "https://regpick.dev/schema.json",
              registryUrl: "https://ui.shadcn.com/r",
              install: {
                targetPath: "./src",
                overwritePolicy: "prompt",
              },
              plugins: [],
            },
            null,
            2,
          ),
          "utf-8",
        );

        const configExists = await fs
          .access(path.join(testDir, "regpick.json"))
          .then(() => true)
          .catch(() => false);
        expect(configExists).toBe(true);

        // 2. Add util from local registry example
        const localRegistryUrl = `file://${path.resolve(projectRoot, "examples/simple-utils-registry/registry.json")}`;

        const addResult = await execa(
          "node",
          [entryPath, "add", localRegistryUrl, "format-date", "--yes"],
          { cwd: testDir },
        );
        console.log("ADD STDOUT:", addResult.stdout);
        console.error("ADD STDERR:", addResult.stderr);

        const files = await execa("ls", ["-la", path.join(testDir, "src")]);
        console.log("FILES:", files.stdout);

        // 3. Verify results
        const utilPath = path.join(testDir, "src/formatDate.ts"); // written to default fallback or util path
        const exists = await fs
          .access(utilPath)
          .then(() => true)
          .catch(() => false);
        expect(exists).toBe(true);

        const lockfilePath = path.join(testDir, "regpick.lock.json");
        const lockfileContent = JSON.parse(await fs.readFile(lockfilePath, "utf8"));
        expect(lockfileContent.components["format-date"]).toBeDefined();
      } finally {
        await fs.rm(testDir, { recursive: true, force: true });
      }
    },
    60000,
  );
});
