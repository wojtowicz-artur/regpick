import { Schema as S } from "effect";
import path from "node:path";
import type { RegpickPlugin } from "../sdk/index.js";

export const OverwritePolicySchema = S.Union(
  S.Literal("prompt"),
  S.Literal("overwrite"),
  S.Literal("skip"),
);

export const PackageManagerSchema = S.String;

export const isFunction = (val: unknown) => typeof val === "function";
const FunctionType = S.declare(isFunction, {
  identifier: "Function",
}) as S.Schema<Function>;
export const FunctionSchema = FunctionType;

export const RegistryAdapterSchema = S.Struct({
  type: S.Literal("registry-adapter"),
  name: S.String,
  canHandle: FunctionSchema,
  load: FunctionSchema,
  loadFileContent: FunctionSchema,
}).pipe(S.typeSchema);

export const TransformPluginSchema = S.Struct({
  type: S.Literal("transform"),
  name: S.String,
  transform: FunctionSchema,
}).pipe(S.typeSchema);

export const PackageManagerPluginSchema = S.Struct({
  type: S.Literal("package-manager"),
  name: S.String,
  lockfiles: S.Array(S.String),
  detect: FunctionSchema,
  buildInstallCommands: FunctionSchema,
}).pipe(S.typeSchema);

export const PathResolverPluginSchema = S.Struct({
  type: S.Literal("path-resolver"),
  name: S.String,
  resolve: FunctionSchema,
}).pipe(S.typeSchema);

export const RegpickPluginSchema = S.Union(
  RegistryAdapterSchema,
  TransformPluginSchema,
  PackageManagerPluginSchema,
  PathResolverPluginSchema,
);

const BaseRegpickConfigSchema = S.Struct({
  resolve: S.optionalWith(
    S.Struct({
      targets: S.optionalWith(S.Record({ key: S.String, value: S.String }), {
        exact: true,
        default: () => ({}),
      }),
      aliases: S.optionalWith(S.Record({ key: S.String, value: S.String }), {
        exact: true,
        default: () => ({}),
      }),
    }),
    { exact: true, default: () => ({ targets: {}, aliases: {} }) },
  ),
  registry: S.optionalWith(
    S.Struct({
      sources: S.optionalWith(S.Record({ key: S.String, value: S.String }), {
        exact: true,
        default: () => ({}),
      }),
      preferManifestTarget: S.optionalWith(S.Boolean, {
        exact: true,
        default: () => true,
      }),
    }),
    {
      exact: true,
      default: () => ({ sources: {}, preferManifestTarget: true }),
    },
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
    {
      exact: true,
      default: () => ({
        packageManager: "auto" as const,
        overwritePolicy: "prompt" as const,
        allowOutsideProject: false,
      }),
    },
  ),
  plugins: S.optionalWith(S.Array(S.Union(RegpickPluginSchema, S.String)), {
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
  plugins?: (string | RegpickPlugin)[];
};

export type ResolvedRegpickConfig = Omit<BaseRegpickConfig, "plugins"> & {
  plugins?: RegpickPlugin[];
};

export type ResolutionConfig = Pick<RegpickConfig, "resolve" | "registry">;
export type InstallPolicyConfig = Pick<RegpickConfig, "install">;

export function defineConfig(config: RegpickConfig): RegpickConfig {
  return config;
}

export const DEFAULT_CONFIG: RegpickConfig = {
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

export function resolveRegistrySource(
  input: string | undefined,
  config: RegpickConfig,
): string | null {
  if (!input) {
    return null;
  }

  if (config.registry.sources[input]) {
    return String(config.registry.sources[input]);
  }

  return input;
}
