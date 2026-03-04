import { DEFAULT_CONFIG, RegpickConfigSchema, type RegpickConfig } from "@/domain/configModel.js";
import { generateConfigCode } from "@/shell/config/generator.js";
import { Effect, Schema as S } from "effect";
import fs from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "unconfig";

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

export function resolveTargetConfigPath(cwd: string): Effect.Effect<string, Error> {
  return Effect.gen(function* () {
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
                return (config as any).regpick;
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

    const ext = path.extname(filePath);
    let format: ConfigFormat = "mjs";
    if (ext === ".ts") format = "ts";
    else if (ext === ".cjs") format = "cjs";
    else if (ext === ".json") format = "json";

    const content = generateConfigCode(config, format);

    yield* Effect.tryPromise(() => fs.writeFile(filePath, content, "utf-8"));

    return { filePath, written: true };
  });
}
