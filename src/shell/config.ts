import path from "node:path";
import fs from "fs-extra";
import { cosmiconfig } from "cosmiconfig";

import type { RegpickConfig } from "../types.js";

const DEFAULT_CONFIG: RegpickConfig = {
  registries: {
    tebra: "./tebra-icon-registry/registry",
  },
  targetsByType: {
    "registry:icon": "src/components/ui/icons",
    "registry:component": "src/components/ui",
    "registry:file": "src/components/ui",
  },
  overwritePolicy: "prompt",
  packageManager: "auto",
  preferManifestTarget: true,
  allowOutsideProject: false,
};

export function getConfigPath(cwd: string): string {
  return path.join(cwd, "regpick.json");
}

export async function readConfig(cwd: string): Promise<{
  config: RegpickConfig;
  configPath: string | null;
}> {
  const explorer = cosmiconfig("regpick", {
    searchPlaces: ["regpick.json", ".regpickrc", ".regpickrc.json"],
  });

  const result = await explorer.search(cwd);

  if (!result || !result.config) {
    return {
      config: { ...DEFAULT_CONFIG },
      configPath: null,
    };
  }

  const config = result.config as Partial<RegpickConfig>;

  return {
    config: {
      ...DEFAULT_CONFIG,
      ...config,
      registries: {
        ...DEFAULT_CONFIG.registries,
        ...(config.registries || {}),
      },
      targetsByType: {
        ...DEFAULT_CONFIG.targetsByType,
        ...(config.targetsByType || {}),
      },
    },
    configPath: result.filepath,
  };
}

export async function writeDefaultConfig(
  cwd: string,
  { overwrite = false }: { overwrite?: boolean } = {},
): Promise<{ filePath: string; written: boolean }> {
  const filePath = getConfigPath(cwd);
  const exists = await fs.pathExists(filePath);

  if (exists && !overwrite) {
    return { filePath, written: false };
  }

  await fs.writeJson(filePath, DEFAULT_CONFIG, { spaces: 2 });
  return { filePath, written: true };
}

export function resolveRegistrySource(input: string | undefined, config: RegpickConfig): string | null {
  if (!input) {
    return null;
  }

  if (config.registries[input]) {
    return String(config.registries[input]);
  }

  return input;
}
