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
        console.log(addResult.stdout);
        console.error(addResult.stderr);

        // 3. Verify results
        const utilPath = path.join(testDir, "src/formatDate.ts"); // written to default fallback or util path
        const exists = await fs
          .access(utilPath)
          .then(() => true)
          .catch(() => false);
        expect(exists).toBe(true);

        const lockfilePath = path.join(testDir, "regpick-lock.json");
        const lockfileContent = JSON.parse(await fs.readFile(lockfilePath, "utf8"));
        expect(lockfileContent.components["format-date"]).toBeDefined();
      } finally {
        await fs.rm(testDir, { recursive: true, force: true });
      }
    },
    60000,
  );
});
