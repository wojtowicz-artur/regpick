import path from "node:path";

import { appError, type AppError } from "@/core/errors.js";
import { err, ok, type Result } from "@/core/result.js";
import { buildRegistryItemFromFile } from "@/domain/packCore.js";
import type { CommandContext, CommandOutcome, RegistryItem } from "@/types.js";

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

export async function runPackCommand(
  context: CommandContext,
): Promise<Result<CommandOutcome, AppError>> {
  const targetDirArg = context.args.positionals[1] || ".";
  const targetDir = path.resolve(context.cwd, targetDirArg);

  const statRes = await context.runtime.fs.stat(targetDir);
  if (!statRes.ok || !statRes.value.isDirectory()) {
    return err(appError("ValidationError", `Target is not a directory: ${targetDir}`));
  }

  context.runtime.prompt.info(`Scanning ${targetDir} for components...`);

  const filesRes = await getFilesRecursive(targetDir, context);
  if (!filesRes.ok) return filesRes;

  const files = filesRes.value;
  if (files.length === 0) {
    context.runtime.prompt.warn("No .ts or .tsx files found.");
    return ok({ kind: "noop", message: "No files found." });
  }

  const items: RegistryItem[] = [];

  const fileResults = await Promise.all(
    files.map(async (file) => {
      const contentRes = await context.runtime.fs.readFile(file, "utf8");
      if (!contentRes.ok) return contentRes;

      return ok(
        buildRegistryItemFromFile({
          path: file,
          content: contentRes.value,
          targetDir,
        }),
      );
    }),
  );

  for (const res of fileResults) {
    if (!res.ok) return err(res.error);
    items.push(res.value);
  }

  const registry = { items };
  const outPath = path.join(context.cwd, "registry.json");
  const writeRes = await context.runtime.fs.writeJson(outPath, registry, {
    spaces: 2,
  });
  if (!writeRes.ok) return err(writeRes.error);

  context.runtime.prompt.success(`Packed ${items.length} components into registry.json`);
  return ok({ kind: "success", message: `Generated registry.json` });
}
