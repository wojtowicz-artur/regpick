import { appError, type AppError } from "@/core/errors.js";
import { DEFAULT_CONFIG, RegpickConfigSchema, type RegpickConfig } from "@/domain/configModel.js";
import { generateConfigCode } from "@/shell/config/generator.js";
import { Effect, Schema as S } from "effect";
import fs from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "unconfig";

export type ConfigFormat = "ts" | "mjs" | "cjs" | "js" | "json";

export function detectConfigFormat(cwd: string): Effect.Effect<ConfigFormat, AppError> {
  return Effect.gen(function* () {
    const tsExists = yield* Effect.tryPromise({
      try: () => fs.access(path.join(cwd, "tsconfig.json")),
      catch: () => false,
    }).pipe(
      Effect.map(() => true),
      Effect.catchAll(() => Effect.succeed(false)),
    );

    if (tsExists) return "ts";

    const pkgType = yield* Effect.tryPromise({
      try: () => fs.readFile(path.join(cwd, "package.json"), "utf-8"),
      catch: () => false,
    }).pipe(
      Effect.flatMap((raw) =>
        Effect.try({
          try: () => JSON.parse(raw as string),
          catch: () => false,
        }),
      ),
      Effect.map((pkg: any) => (typeof pkg?.type === "string" ? pkg.type : null)),
      Effect.catchAll(() => Effect.succeed(null)),
    );

    if (pkgType === "module") return "mjs";
    if (pkgType === "commonjs") return "cjs";

    return "mjs";
  });
}

export function resolveTargetConfigPath(cwd: string): Effect.Effect<string, AppError> {
  return Effect.gen(function* () {
    const { sources } = yield* Effect.tryPromise({
      try: () =>
        loadConfig<unknown>({
          sources: [
            {
              files: ["regpick", ".regpickrc", "regpickrc"],
              extensions: ["json", "js", "ts", "mjs", "cjs", ""],
            },
          ],
          cwd,
        }),
      catch: (e: unknown) => appError("ConfigError", "Failed to resolve config sources", e),
    });

    if (sources.length > 0) {
      return sources[0];
    }

    const format = yield* detectConfigFormat(cwd);
    return path.join(cwd, `regpick.config.${format}`);
  });
}

export function readConfig(
  cwd: string,
): Effect.Effect<{ config: RegpickConfig; configPath: string | null }, AppError> {
  return Effect.gen(function* () {
    const { config: loadedConfig, sources } = yield* Effect.tryPromise({
      try: () =>
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
                  return (config as Record<string, unknown>).regpick;
                }
                return undefined;
              },
            },
          ],
          defaults: DEFAULT_CONFIG,
          merge: true,
          cwd,
        }),
      catch: (e) => appError("ConfigError", "Failed to load config", e),
    });

    const validConfig = yield* S.decodeUnknown(RegpickConfigSchema)(loadedConfig).pipe(
      Effect.mapError((e) => appError("ConfigError", `Config validation failed: ${e.message}`, e)),
    );

    return {
      config: validConfig as unknown as RegpickConfig,
      configPath: sources[0] || null,
    };
  });
}

export function writeDefaultConfig(
  cwd: string,
  { overwrite = false }: { overwrite?: boolean } = {},
): Effect.Effect<{ filePath: string; written: boolean }, AppError> {
  return writeConfig(cwd, DEFAULT_CONFIG, { overwrite });
}

export function writeConfig(
  cwd: string,
  config: RegpickConfig,
  { overwrite = false }: { overwrite?: boolean } = {},
): Effect.Effect<{ filePath: string; written: boolean }, AppError> {
  return Effect.gen(function* () {
    const filePath = yield* resolveTargetConfigPath(cwd);

    const exists = yield* Effect.tryPromise({
      try: () => fs.access(filePath),
      catch: () => false,
    }).pipe(
      Effect.map(() => true),
      Effect.catchAll(() => Effect.succeed(false)),
    );

    if (exists && !overwrite) {
      return { filePath, written: false };
    }

    const ext = path.extname(filePath);
    let format: ConfigFormat = "mjs";
    if (ext === ".ts") format = "ts";
    else if (ext === ".cjs") format = "cjs";
    else if (ext === ".json") format = "json";

    const content = generateConfigCode(config, format);

    yield* Effect.tryPromise({
      try: () => fs.writeFile(filePath, content, "utf-8"),
      catch: (e) => appError("ConfigError", `Failed to write config to ${filePath}`, e),
    });

    return { filePath, written: true };
  });
}
