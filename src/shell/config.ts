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

export const isFunction = (val: unknown) => typeof val === "function";
export const FunctionSchema = v.custom<Function>(isFunction, "Expected a function");

export const PluginSchema = v.objectWithRest(
  {
    name: v.string(),
    start: v.optional(FunctionSchema),
    resolveId: v.optional(FunctionSchema),
    load: v.optional(FunctionSchema),
    transform: v.optional(FunctionSchema),
    finish: v.optional(FunctionSchema),
    onError: v.optional(FunctionSchema),
  },
  v.any(),
);

export const RegistryAdapterSchema = v.objectWithRest(
  {
    name: v.string(),
    match: FunctionSchema,
    resolveManifest: FunctionSchema,
    resolveItemReference: FunctionSchema,
    resolveFile: FunctionSchema,
  },
  v.any(),
);

export const PackageManagerPluginSchema = v.objectWithRest(
  {
    name: v.string(),
    lockfiles: v.array(v.string()),
    detect: FunctionSchema,
    buildInstallCommands: FunctionSchema,
  },
  v.any(),
);

export const PathResolverPluginSchema = v.objectWithRest(
  {
    name: v.string(),
    resolvePath: FunctionSchema,
  },
  v.any(),
);

export const RegpickConfigSchema = v.pipe(
  v.object({
    resolve: v.optional(
      v.object({
        targets: v.optional(v.record(v.string(), v.string()), {}),
        aliases: v.optional(v.record(v.string(), v.string()), {}),
      }),
      {},
    ),
    registry: v.optional(
      v.object({
        sources: v.optional(v.record(v.string(), v.string()), {}),
        preferManifestTarget: v.optional(v.boolean(), true),
      }),
      {},
    ),
    install: v.optional(
      v.object({
        packageManager: v.optional(PackageManagerSchema, "auto"),
        overwritePolicy: v.optional(OverwritePolicySchema, "prompt"),
        allowOutsideProject: v.optional(v.boolean(), false),
      }),
      {},
    ),
    plugins: v.optional(
      v.array(
        v.union([
          PluginSchema,
          RegistryAdapterSchema,
          PackageManagerPluginSchema,
          PathResolverPluginSchema,
          v.string(),
        ]),
      ),
      [],
    ),
  }),
  v.forward(
    v.custom((input) => {
      if (!input.install?.allowOutsideProject) {
        const targets = input.resolve?.targets || {};
        for (const target of Object.values(targets)) {
          if (typeof target === "string" && (target.startsWith("..") || path.isAbsolute(target))) {
            return false;
          }
        }
      }
      return true;
    }, "Target paths outside project are disallowed when install.allowOutsideProject is false"),
    ["resolve", "targets"],
  ),
);

export type RegpickConfig = v.InferOutput<typeof RegpickConfigSchema>;

export function defineConfig(config: RegpickConfig): RegpickConfig {
  return config;
}

const DEFAULT_CONFIG: RegpickConfig = {
  resolve: {
    targets: {
      "registry:icon": "src/components/ui/icons",
      "registry:component": "src/components/ui",
      "registry:file": "src/components/ui",
    },
    aliases: {},
  },
  registry: {
    sources: {
      tebra: "./tebra-icon-registry/registry",
    },
    preferManifestTarget: true,
  },
  install: {
    overwritePolicy: "prompt",
    packageManager: "auto",
    allowOutsideProject: false,
  },
  plugins: [],
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

  if (config.registry?.sources?.[input]) {
    return String(config.registry.sources[input]);
  }

  return input;
}
