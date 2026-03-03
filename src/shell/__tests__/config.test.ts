import { describe, expect, it } from "vitest";

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { readConfig } from "@/shell/config.js";

describe("readConfig", () => {
  it("returns defaults and null path when no config exists", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "regpick-"));
    try {
      const { config, configPath } = await readConfig(tmp);
      expect(configPath).toBeNull();
      expect(config).toHaveProperty("registry");
      expect(config).toHaveProperty("resolve");
      expect(config.registry?.preferManifestTarget ?? true).toBe(true);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it("reads regpick.json and merges with defaults", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "regpick-"));
    try {
      const custom = {
        registry: { sources: { testreg: "./r" } },
        install: { overwritePolicy: "overwrite" },
      };
      await fs.writeFile(path.join(tmp, "regpick.json"), JSON.stringify(custom), "utf8");

      const { config, configPath } = await readConfig(tmp);

      expect(configPath).not.toBeNull();
      expect(configPath?.endsWith("regpick.json")).toBe(true);
      expect((config.registry?.sources || {}).testreg).toBe("./r");
      expect(config.install?.overwritePolicy || "prompt").toBe("overwrite");
      expect(config.resolve?.targets || {}).toBeDefined();
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it("finds config in parent directory when run from nested dir", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "regpick-"));
    try {
      // write config in parent
      const custom = { registry: { sources: { parentreg: "./pr" } } };
      await fs.writeFile(path.join(tmp, "regpick.json"), JSON.stringify(custom), "utf8");

      // create nested folder and run readConfig from there
      const nested = path.join(tmp, "a", "b", "c");
      await fs.mkdir(nested, { recursive: true });

      const { config, configPath } = await readConfig(nested);

      expect(configPath).not.toBeNull();
      expect(
        configPath?.endsWith(path.join(path.basename(tmp), "regpick.json")) ||
          configPath?.endsWith("regpick.json"),
      ).toBe(true);
      expect((config.registry?.sources || {}).parentreg).toBe("./pr");
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
