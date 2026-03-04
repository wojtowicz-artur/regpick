import { Effect, Schema as S } from "effect";
import fs from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "unconfig";

const OverwritePolicySchema = S.Union(
  S.Literal("prompt"),
  S.Literal("overwrite"),
  S.Literal("skip"),
);

const PackageManagerSchema = S.String;

export const isFunction = (val: unknown) => typeof val === "function";
const FunctionType = S.declare(isFunction, {
  identifier: "Function",
}) as S.Schema<Function>;
export const FunctionSchema = FunctionType;

export const PluginSchema = S.Struct({
  name: S.String,
  start: S.optionalWith(FunctionSchema, { exact: true }),
  resolveId: S.optionalWith(FunctionSchema, { exact: true }),
  load: S.optionalWith(FunctionSchema, { exact: true }),
  transform: S.optionalWith(FunctionSchema, { exact: true }),
  finish: S.optionalWith(FunctionSchema, { exact: true }),
  onError: S.optionalWith(FunctionSchema, { exact: true }),
}).pipe(S.typeSchema);

export const PackageManagerPluginSchema = S.Struct({
  name: S.String,
  lockfiles: S.Array(S.String),
  detect: FunctionSchema,
  buildInstallCommands: FunctionSchema,
}).pipe(S.typeSchema);

export const PathResolverPluginSchema = S.Struct({
  name: S.String,
  resolvePath: FunctionSchema,
}).pipe(S.typeSchema);

const BaseRegpickConfigSchema = S.Struct({
  resolve: S.optionalWith(
    S.Struct({
      targets: S.optionalWith(S.Record({ key: S.String, value: S.String }), {
        exact: true,
        default: () => ({}) as any,
      }),
      aliases: S.optionalWith(S.Record({ key: S.String, value: S.String }), {
        exact: true,
        default: () => ({}) as any,
      }),
    }),
    { exact: true, default: () => ({}) as any },
  ),
  registry: S.optionalWith(
    S.Struct({
      sources: S.optionalWith(S.Record({ key: S.String, value: S.String }), {
        exact: true,
        default: () => ({}) as any,
      }),
      preferManifestTarget: S.optionalWith(S.Boolean, {
        exact: true,
        default: () => true,
      }),
    }),
    { exact: true, default: () => ({}) as any },
  ),
  install: S.optionalWith(
    S.Struct({
      packageManager: S.optionalWith(PackageManagerSchema, {
        exact: true,
        default: () => "auto",
      }),
      overwritePolicy: S.optionalWith(OverwritePolicySchema, {
        exact: true,
        default: () => "prompt",
      }),
      allowOutsideProject: S.optionalWith(S.Boolean, {
        exact: true,
        default: () => false,
      }),
    }),
    { exact: true, default: () => ({}) as any },
  ),
  plugins: S.optionalWith(S.Array(S.Union(S.Any, S.String)), {
    exact: true,
    default: () => [],
  }),
});

export const RegpickConfigSchema = BaseRegpickConfigSchema.pipe(
  S.filter(
    (input) => {
      if (!input.install?.allowOutsideProject) {
        const targets = input.resolve?.targets || {};
        for (const target of Object.values(targets)) {
          if (typeof target === "string" && (target.startsWith("..") || path.isAbsolute(target))) {
            return false;
          }
        }
      }
      return true;
    },
    {
      message: () =>
        "Target paths outside project are disallowed when install.allowOutsideProject is false",
    },
  ),
);

type BaseRegpickConfig = S.Schema.Type<typeof RegpickConfigSchema>;
export type RegpickConfig = Omit<BaseRegpickConfig, "plugins"> & {
  plugins?: (string | import("../types.js").RegpickPlugin)[];
};

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

export type ConfigFormat = "ts" | "mjs" | "cjs" | "js" | "json";

export function detectConfigFormat(cwd: string): Effect.Effect<ConfigFormat, Error> {
  return Effect.gen(function* () {
    const tsExists = yield* Effect.tryPromise(() =>
      fs.access(path.join(cwd, "tsconfig.json")),
    ).pipe(
      Effect.map(() => true),
      Effect.catchAll(() => Effect.succeed(false)),
    );

    if (tsExists) return "ts";

    const pkgType = yield* Effect.tryPromise(() =>
      fs.readFile(path.join(cwd, "package.json"), "utf-8"),
    ).pipe(
      Effect.flatMap((raw) => Effect.try(() => JSON.parse(raw))),
      Effect.map((pkg) => pkg.type as string),
      Effect.catchAll(() => Effect.succeed(null)),
    );

    if (pkgType === "module") return "mjs";
    if (pkgType === "commonjs") return "cjs";

    return "mjs";
  });
}

function serializeObjectToJS(obj: unknown, indentLevel = 1): string {
  if (obj === null) return "null";
  if (typeof obj === "string") return `"${obj}"`;
  if (typeof obj === "number" || typeof obj === "boolean") return String(obj);

  if (Array.isArray(obj)) {
    if (obj.length === 0) return "[]";
    const indent = "  ".repeat(indentLevel);
    const inner = obj.map((val) => serializeObjectToJS(val, indentLevel + 1)).join(`,\n${indent}`);
    return `[\n${indent}${inner}\n${"  ".repeat(indentLevel - 1)}]`;
  }

  if (typeof obj === "object") {
    const keys = Object.keys(obj);
    if (keys.length === 0) return "{}";

    const record = obj as Record<string, unknown>;
    const indent = "  ".repeat(indentLevel);
    const inner = keys
      .map((key) => {
        const isIdentifier = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key);
        const safeKey = isIdentifier ? key : `"${key}"`;
        return `${safeKey}: ${serializeObjectToJS(record[key], indentLevel + 1)}`;
      })
      .join(`,\n${indent}`);

    return `{\n${indent}${inner}\n${"  ".repeat(indentLevel - 1)}}`;
  }

  return "undefined";
}

export function generateConfigCode(config: RegpickConfig, format: ConfigFormat): string {
  if (format === "json") {
    return JSON.stringify(config, null, 2);
  }

  const objectCode = serializeObjectToJS(config, 1);

  if (format === "cjs") {
    return `const { defineConfig } = require("regpick");\n\nmodule.exports = defineConfig(${objectCode});\n`;
  }

  return `import { defineConfig } from "regpick";\n\nexport default defineConfig(${objectCode});\n`;
}

export function resolveTargetConfigPath(cwd: string): Effect.Effect<string, Error> {
  return Effect.gen(function* () {
    // Check if unconfig finds an existing config
    const { sources } = yield* Effect.tryPromise(() =>
      loadConfig<unknown>({
        sources: [
          {
            files: ["regpick", ".regpickrc", "regpickrc"],
            extensions: ["json", "js", "ts", "mjs", "cjs", ""],
          },
        ],
        cwd,
      }),
    );

    if (sources.length > 0) {
      return sources[0];
    }

    const format = yield* detectConfigFormat(cwd);
    return path.join(cwd, `regpick.config.${format}`);
  });
}

export function readConfig(
  cwd: string,
): Effect.Effect<{ config: RegpickConfig; configPath: string | null }, Error> {
  return Effect.gen(function* () {
    const { config: loadedConfig, sources } = yield* Effect.tryPromise(() =>
      loadConfig<unknown>({
        sources: [
          {
            files: ["regpick", ".regpickrc", "regpickrc"],
            extensions: ["json", "js", "ts", "mjs", "cjs", ""],
          },
          {
            files: "package.json",
            extensions: [],
            rewrite(config: unknown) {
              if (typeof config === "object" && config !== null && "regpick" in config) {
                return config.regpick;
              }
              return undefined;
            },
          },
        ],
        defaults: DEFAULT_CONFIG,
        merge: true,
        cwd,
      }),
    );

    const validConfig = yield* Effect.try(() =>
      S.decodeUnknownSync(RegpickConfigSchema)(loadedConfig),
    );

    return {
      config: validConfig as RegpickConfig,
      configPath: sources[0] || null,
    };
  });
}

export function writeDefaultConfig(
  cwd: string,
  { overwrite = false }: { overwrite?: boolean } = {},
): Effect.Effect<{ filePath: string; written: boolean }, Error> {
  return writeConfig(cwd, DEFAULT_CONFIG, { overwrite });
}

export function writeConfig(
  cwd: string,
  config: RegpickConfig,
  { overwrite = false }: { overwrite?: boolean } = {},
): Effect.Effect<{ filePath: string; written: boolean }, Error> {
  return Effect.gen(function* () {
    const filePath = yield* resolveTargetConfigPath(cwd);

    const exists = yield* Effect.tryPromise(() => fs.access(filePath)).pipe(
      Effect.map(() => true),
      Effect.catchAll(() => Effect.succeed(false)),
    );

    if (exists && !overwrite) {
      return { filePath, written: false };
    }

    const ext = path.extname(filePath).slice(1);
    const format = ["ts", "mjs", "cjs", "js", "json"].includes(ext)
      ? (ext as ConfigFormat)
      : "json";

    yield* Effect.tryPromise(() =>
      fs.writeFile(filePath, generateConfigCode(config, format), "utf8"),
    );

    return { filePath, written: true };
  });
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
