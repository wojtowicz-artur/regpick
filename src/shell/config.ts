import fs from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "unconfig";
import * as v from "valibot";

const OverwritePolicySchema = v.union([
  v.literal("prompt"),
  v.literal("overwrite"),
  v.literal("skip"),
]);

const PackageManagerSchema = v.string();

export const RegpickConfigSchema = v.object({
  registries: v.record(v.string(), v.string()),
  targetsByType: v.record(v.string(), v.string()),
  aliases: v.optional(v.record(v.string(), v.string()), {}),
  overwritePolicy: OverwritePolicySchema,
  packageManager: PackageManagerSchema,
  packageManagers: v.optional(v.array(v.any()), []),
  preferManifestTarget: v.boolean(),
  allowOutsideProject: v.boolean(),
  adapters: v.optional(v.array(v.union([v.string(), v.any()])), []),
});

export type RegpickConfig = v.InferOutput<typeof RegpickConfigSchema>;

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
  packageManagers: [],
  preferManifestTarget: true,
  allowOutsideProject: false,
  adapters: [],
};

export function getConfigPath(cwd: string): string {
  return path.join(cwd, "regpick.json");
}

export async function readConfig(cwd: string): Promise<{
  config: RegpickConfig;
  configPath: string | null;
}> {
  const { config: loadedConfig, sources } = await loadConfig<unknown>({
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

  const validConfig = v.parse(RegpickConfigSchema, loadedConfig);

  return {
    config: validConfig,
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
