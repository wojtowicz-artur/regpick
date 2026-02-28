import { describe, expect, it } from "vitest";

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { readConfig } from "../config.js";

describe("readConfig", () => {
  it("returns defaults and null path when no config exists", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "regpick-"));
    try {
      const { config, configPath } = await readConfig(tmp);
      expect(configPath).toBeNull();
      expect(config).toHaveProperty("registries");
      expect(config).toHaveProperty("targetsByType");
      expect(config.preferManifestTarget).toBe(true);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it("reads regpick.json and merges with defaults", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "regpick-"));
    try {
      const custom = {
        registries: { testreg: "./r" },
        overwritePolicy: "overwrite",
      };
      await fs.writeFile(
        path.join(tmp, "regpick.json"),
        JSON.stringify(custom),
        "utf8",
      );

      const { config, configPath } = await readConfig(tmp);

      expect(configPath).not.toBeNull();
      expect(configPath?.endsWith("regpick.json")).toBe(true);
      expect(config.registries.testreg).toBe("./r");
      expect(config.overwritePolicy).toBe("overwrite");
      expect(config.targetsByType).toBeDefined();
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it("finds config in parent directory when run from nested dir", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "regpick-"));
    try {
      // write config in parent
      const custom = { registries: { parentreg: "./pr" } };
      await fs.writeFile(
        path.join(tmp, "regpick.json"),
        JSON.stringify(custom),
        "utf8",
      );

      // create nested folder and run readConfig from there
      const nested = path.join(tmp, "a", "b", "c");
      await fs.mkdir(nested, { recursive: true });

      const { config, configPath } = await readConfig(nested);

      expect(configPath).not.toBeNull();
      expect(
        configPath?.endsWith(path.join(path.basename(tmp), "regpick.json")) ||
          configPath?.endsWith("regpick.json"),
      ).toBe(true);
      expect(config.registries.parentreg).toBe("./pr");
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
