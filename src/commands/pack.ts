import { appError, type AppError } from "@/core/errors.js";
import { buildRegistryItemFromFile } from "@/domain/packCore.js";
import { Runtime } from "@/shell/runtime/ports.js";
import type { CommandContext, CommandOutcome, RegistryItem } from "@/types.js";
import { Effect } from "effect";
import path from "node:path";

type PackQueryState = {
  targetDir: string;
  files: string[];
};

type PackGeneratedRegistry = {
  items: RegistryItem[];
  outPath: string;
  fileCount: number;
};

/**
 * Recursively searches a target directory for TypeScript component modules.
 *
 * @param dir - Target base directory payload.
 * @param context - Command context.
 * @returns Matched typescript files within the target space.
 */
const getFilesRecursive = (dir: string): Effect.Effect<string[], AppError, Runtime> =>
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
              } else if (fullPath.endsWith(".ts") || fullPath.endsWith(".tsx")) {
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
 * @param context - Command context.
 * @returns Verified target scan list paths.
 */
const queryPackState = (
  context: CommandContext,
): Effect.Effect<PackQueryState, AppError, Runtime> =>
  Effect.gen(function* () {
    const runtime = yield* Runtime;
    const targetDirArg = context.args.positionals[1] || ".";
    const targetDir = path.resolve(context.cwd, targetDirArg);

    const stat = yield* runtime.fs.stat(targetDir);
    if (!stat.isDirectory()) {
      yield* Effect.fail(appError("ValidationError", `Target is not a directory: ${targetDir}`));
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
 * @param context - Command context.
 * @param state - Scanned folder parameters result schema.
 * @returns Final collection mapped parameters target states.
 */
const generateRegistryItems = (
  context: CommandContext,
  state: PackQueryState,
): Effect.Effect<PackGeneratedRegistry, AppError, Runtime> =>
  Effect.gen(function* () {
    const runtime = yield* Runtime;
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

/**
 * Main controller for the `pack` command.
 * Manages mapping file sources to custom targeted JSON schemas dynamically.
 *
 * @param context - Command context.
 * @returns Completion confirmation schema wrapper.
 */
export function runPackCommand(
  context: CommandContext,
): Effect.Effect<CommandOutcome, AppError, Runtime> {
  return Effect.gen(function* () {
    const runtime = yield* Runtime;
    const state = yield* queryPackState(context);

    if (state.files.length === 0) {
      yield* runtime.prompt.warn("No .ts or .tsx files found.");
      return { kind: "noop", message: "No files found." } as CommandOutcome;
    }

    const registry = yield* generateRegistryItems(context, state);

    const content = JSON.stringify(
      {
        name: "my-registry",
        items: registry.items,
      },
      null,
      2,
    );

    yield* Effect.catchAll(runtime.fs.writeFile(registry.outPath, content, "utf8"), (e) =>
      Effect.gen(function* () {
        yield* runtime.prompt.error(`Failed to write registry file: ${registry.outPath}`);
        return yield* Effect.fail(e);
      }),
    );

    yield* runtime.prompt.success(`Packed ${registry.items.length} components into registry.json`);

    return {
      kind: "success",
      message: `Generated registry.json`,
    } as CommandOutcome;
  });
}
