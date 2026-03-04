import { CommandContextTag } from "@/core/context.js";
import { appError, type AppError } from "@/core/errors.js";
import { Runtime } from "@/core/ports.js";
import { buildRegistryItemFromFile } from "@/domain/packCore.js";
import type { RegistryItem } from "@/types.js";
import { Effect } from "effect";
import path from "node:path";

export type PackQueryState = {
  targetDir: string;
  files: string[];
};

export type PackGeneratedRegistry = {
  items: RegistryItem[];
  outPath: string;
  fileCount: number;
};

/**
 * Recursively searches a target directory for TypeScript component modules.
 *
 * @param dir - Target base directory payload.
 * @returns Matched typescript files within the target space.
 */
export const getFilesRecursive = (
  dir: string,
): Effect.Effect<string[], AppError, Runtime | CommandContextTag> =>
  Effect.gen(function* () {
    const runtime = yield* Runtime;
    const result: string[] = [];

    const scan = (currentDir: string): Effect.Effect<void, AppError> =>
      Effect.gen(function* () {
        const files = yield* runtime.fs.readdir(currentDir);

        yield* Effect.forEach(
          files,
          (file) =>
            Effect.gen(function* () {
              const fullPath = path.join(currentDir, file);
              const stat = yield* runtime.fs.stat(fullPath);
              if (stat.isDirectory()) {
                yield* scan(fullPath);
              } else if (
                fullPath.endsWith(".ts") ||
                fullPath.endsWith(".tsx")
              ) {
                result.push(fullPath);
              }
            }),
          { concurrency: 1 },
        );
      });

    yield* scan(dir);
    return result;
  });

/**
 * Inspects folder state and evaluates component registry targets available.
 *
 * @returns Verified target scan list paths.
 */
export const queryPackState = (): Effect.Effect<
  PackQueryState,
  AppError,
  Runtime | CommandContextTag
> =>
  Effect.gen(function* () {
    const runtime = yield* Runtime;
    const context = yield* CommandContextTag;
    const targetDirArg = context.args.positionals[1] || ".";
    const targetDir = path.resolve(context.cwd, targetDirArg);

    const stat = yield* runtime.fs.stat(targetDir);
    if (!stat.isDirectory()) {
      yield* Effect.fail(
        appError("ValidationError", `Target is not a directory: ${targetDir}`),
      );
    }

    yield* runtime.prompt.info(`Scanning ${targetDir} for components...`);

    const files = yield* getFilesRecursive(targetDir);

    return {
      targetDir,
      files,
    };
  });

/**
 * Maps scanned directories mapping payloads against raw content sources.
 *
 * @param state - Scanned folder parameters result schema.
 * @returns Final collection mapped parameters target states.
 */
export const generateRegistryItems = (
  state: PackQueryState,
): Effect.Effect<
  PackGeneratedRegistry,
  AppError,
  Runtime | CommandContextTag
> =>
  Effect.gen(function* () {
    const runtime = yield* Runtime;
    const context = yield* CommandContextTag;
    const items = yield* Effect.forEach(
      state.files,
      (file) =>
        Effect.gen(function* () {
          const content = yield* runtime.fs.readFile(file, "utf8");
          return buildRegistryItemFromFile({
            path: file,
            content,
            targetDir: state.targetDir,
          });
        }),
      { concurrency: 10 },
    );

    const outPath = path.join(context.cwd, "registry.json");

    return {
      items: Array.from(items),
      outPath,
      fileCount: state.files.length,
    };
  });
