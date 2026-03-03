import { appError, type AppError } from "@/core/errors.js";
import { err, ok, type Result } from "@/core/result.js";
import { buildRegistryItemFromFile } from "@/domain/packCore.js";
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
const getFilesRecursive = (
  dir: string,
  context: CommandContext,
): Effect.Effect<string[], AppError> =>
  Effect.gen(function* () {
    const result: string[] = [];

    const scan = (currentDir: string): Effect.Effect<void, AppError> =>
      Effect.gen(function* () {
        const files = yield* context.runtime.fs.readdir(currentDir);

        yield* Effect.forEach(
          files,
          (file) =>
            Effect.gen(function* () {
              const fullPath = path.join(currentDir, file);
              const stat = yield* context.runtime.fs.stat(fullPath);
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
const queryPackState = (context: CommandContext): Effect.Effect<PackQueryState, AppError> =>
  Effect.gen(function* () {
    const targetDirArg = context.args.positionals[1] || ".";
    const targetDir = path.resolve(context.cwd, targetDirArg);

    const stat = yield* context.runtime.fs.stat(targetDir);
    if (!stat.isDirectory()) {
      yield* Effect.fail(appError("ValidationError", `Target is not a directory: ${targetDir}`));
    }

    yield* context.runtime.prompt.info(`Scanning ${targetDir} for components...`);

    const files = yield* getFilesRecursive(targetDir, context);

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
): Effect.Effect<PackGeneratedRegistry, AppError> =>
  Effect.gen(function* () {
    const items = yield* Effect.forEach(
      state.files,
      (file) =>
        Effect.gen(function* () {
          const content = yield* context.runtime.fs.readFile(file, "utf8");
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
function runPackCommandEff(context: CommandContext): Effect.Effect<CommandOutcome, AppError> {
  return Effect.gen(function* () {
    const state = yield* queryPackState(context);

    if (state.files.length === 0) {
      yield* context.runtime.prompt.warn("No .ts or .tsx files found.");
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

    yield* Effect.catchAll(context.runtime.fs.writeFile(registry.outPath, content, "utf8"), (e) =>
      Effect.gen(function* () {
        yield* context.runtime.prompt.error(`Failed to write registry file: ${registry.outPath}`);
        return yield* Effect.fail(e);
      }),
    );

    yield* context.runtime.prompt.success(
      `Packed ${registry.items.length} components into registry.json`,
    );

    return {
      kind: "success",
      message: `Generated registry.json`,
    } as CommandOutcome;
  });
}

export async function runPackCommand(
  context: CommandContext,
): Promise<Result<CommandOutcome, AppError>> {
  const res = await Effect.runPromise(Effect.either(runPackCommandEff(context)));
  return res._tag === "Right" ? ok(res.right as CommandOutcome) : err(res.left as AppError);
}
