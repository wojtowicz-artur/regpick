import fs from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "unconfig";

import type { RegpickConfig } from "@/types.js";

const DEFAULT_CONFIG: RegpickConfig = {
  registries: {
    tebra: "./tebra-icon-registry/registry",
  },
  targetsByType: {
    "registry:icon": "src/components/ui/icons",
    "registry:component": "src/components/ui",
    "registry:file": "src/components/ui",
  },
  aliases: {},
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
  const { config, sources } = await loadConfig<RegpickConfig>({
    sources: [
      {
        files: ["regpick", ".regpickrc", "regpickrc"],
        extensions: ["json", "js", "ts", "mjs", "cjs", ""],
      },
      {
        files: "package.json",
        extensions: [],
        rewrite(config: any) {
          return config?.regpick;
        },
      },
    ],
    defaults: DEFAULT_CONFIG,
    merge: true,
    cwd,
  });

  return {
    config,
    configPath: sources[0] || null,
  };
}

export async function writeDefaultConfig(
  cwd: string,
  { overwrite = false }: { overwrite?: boolean } = {},
): Promise<{ filePath: string; written: boolean }> {
  return writeConfig(cwd, DEFAULT_CONFIG, { overwrite });
}

export async function writeConfig(
  cwd: string,
  config: RegpickConfig,
  { overwrite = false }: { overwrite?: boolean } = {},
): Promise<{ filePath: string; written: boolean }> {
  const filePath = getConfigPath(cwd);

  let exists = false;
  try {
    await fs.access(filePath);
    exists = true;
  } catch {}

  if (exists && !overwrite) {
    return { filePath, written: false };
  }

  await fs.writeFile(filePath, JSON.stringify(config, null, 2), "utf8");
  return { filePath, written: true };
}

export function resolveRegistrySource(
  input: string | undefined,
  config: RegpickConfig,
): string | null {
  if (!input) {
    return null;
  }

  if (config.registries[input]) {
    return String(config.registries[input]);
  }

  return input;
}
