import path from "node:path";

import { appError, type AppError } from "@/core/errors.js";
import { err, ok, type Result } from "@/core/result.js";
import { runSaga, type TransactionStep } from "@/core/saga.js";
import { buildRegistryItemFromFile } from "@/domain/packCore.js";
import { WriteFileStep } from "@/domain/saga/index.js";
import type { CommandContext, CommandOutcome, RegistryItem } from "@/types.js";

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
async function getFilesRecursive(
  dir: string,
  context: CommandContext,
): Promise<Result<string[], AppError>> {
  const result: string[] = [];

  async function scan(currentDir: string): Promise<Result<void, AppError>> {
    const dirRes = await context.runtime.fs.readdir(currentDir);
    if (!dirRes.ok) return dirRes;

    const fileChecks = await Promise.all(
      dirRes.value.map(async (file) => {
        const fullPath = path.join(currentDir, file);
        const statRes = await context.runtime.fs.stat(fullPath);
        if (!statRes.ok) return statRes;

        if (statRes.value.isDirectory()) {
          const scanRes = await scan(fullPath);
          if (!scanRes.ok) return scanRes;
        } else {
          if (fullPath.endsWith(".ts") || fullPath.endsWith(".tsx")) {
            result.push(fullPath);
          }
        }
        return ok(undefined);
      }),
    );

    for (const check of fileChecks) {
      if (!check.ok) return check;
    }
    return ok(undefined);
  }

  const scanRes = await scan(dir);
  if (!scanRes.ok) return err(scanRes.error);
  return ok(result);
}

/**
 * Inspects folder state and evaluates component registry targets available.
 *
 * @param context - Command context.
 * @returns Verified target scan list paths.
 */
async function queryPackState(context: CommandContext): Promise<Result<PackQueryState, AppError>> {
  const targetDirArg = context.args.positionals[1] || ".";
  const targetDir = path.resolve(context.cwd, targetDirArg);

  const statRes = await context.runtime.fs.stat(targetDir);
  if (!statRes.ok || !statRes.value.isDirectory()) {
    return err(appError("ValidationError", `Target is not a directory: ${targetDir}`));
  }

  context.runtime.prompt.info(`Scanning ${targetDir} for components...`);

  const filesRes = await getFilesRecursive(targetDir, context);
  if (!filesRes.ok) return filesRes;

  return ok({
    targetDir,
    files: filesRes.value,
  });
}

/**
 * Maps scanned directories mapping payloads against raw content sources.
 *
 * @param context - Command context.
 * @param state - Scanned folder parameters result schema.
 * @returns Final collection mapped parameters target states.
 */
async function generateRegistryItems(
  context: CommandContext,
  state: PackQueryState,
): Promise<Result<PackGeneratedRegistry, AppError>> {
  const items: RegistryItem[] = [];

  const fileResults = await Promise.all(
    state.files.map(async (file) => {
      const contentRes = await context.runtime.fs.readFile(file, "utf8");
      if (!contentRes.ok) return contentRes;

      return ok(
        buildRegistryItemFromFile({
          path: file,
          content: contentRes.value,
          targetDir: state.targetDir,
        }),
      );
    }),
  );

  for (const res of fileResults) {
    if (!res.ok) return err(res.error);
    items.push(res.value);
  }

  const outPath = path.join(context.cwd, "registry.json");

  return ok({
    items,
    outPath,
    fileCount: state.files.length,
  });
}

/**
 * Formulates atom transaction structure to commit assembled JSON configs.
 *
 * @param context - Command context.
 * @param registryData - Mapped generation structures.
 * @returns Packed execution operations flow schemas.
 */
function buildPackCommand(
  context: CommandContext,
  registryData: PackGeneratedRegistry,
): TransactionStep<any>[] {
  const registryPayload = { items: registryData.items };
  const content = JSON.stringify(registryPayload, null, 2);

  return [new WriteFileStep(registryData.outPath, content, context.runtime)];
}

/**
 * Main controller for the `pack` command.
 * Manages mapping file sources to custom targeted JSON schemas dynamically.
 *
 * @param context - Command context.
 * @returns Completion confirmation schema wrapper.
 */
export async function runPackCommand(
  context: CommandContext,
): Promise<Result<CommandOutcome, AppError>> {
  // 1. Initial State (Filesystem scan)
  const stateQ = await queryPackState(context);
  if (!stateQ.ok) return err(stateQ.error);

  if (stateQ.value.files.length === 0) {
    context.runtime.prompt.warn("No .ts or .tsx files found.");
    return ok({ kind: "noop", message: "No files found." });
  }

  // 2. Map scanned data into registry in-memory models
  const registryQ = await generateRegistryItems(context, stateQ.value);
  if (!registryQ.ok) return err(registryQ.error);

  // 3. Assemble Transaction (Ensure atomic write to registry.json)
  const sagaSteps = buildPackCommand(context, registryQ.value);

  // 4. Execute Saga
  const runRes = await runSaga(sagaSteps, (stepName, status) => {
    if (status === "failed") {
      context.runtime.prompt.error(`Failed to write registry file: ${registryQ.value.outPath}`);
    }
  });

  if (!runRes.ok) return runRes;

  context.runtime.prompt.success(
    `Packed ${registryQ.value.items.length} components into registry.json`,
  );

  return ok({
    kind: "success",
    message: `Generated registry.json`,
  });
}
