import { AppError } from "@/core/errors.js";
import { type PackIntent } from "@/domain/models/intent.js";
import type { RegistryItem } from "@/domain/models/registry.js";
import { buildRegistryItemFromFile } from "@/domain/packCore.js";
import { FileSystemPort } from "@/interfaces/fs/port.js";
import { PromptPort } from "@/interfaces/prompt/port.js";
import { Effect } from "effect";
import path from "node:path";

export const packWorkflow = (
  intent: PackIntent,
): Effect.Effect<void, AppError, FileSystemPort | PromptPort> =>
  Effect.gen(function* () {
    const fs = yield* FileSystemPort;
    const prompt = yield* PromptPort;

    const sourcePath = path.resolve(intent.flags.cwd, intent.source);

    yield* prompt.info(`Packing components from: ${sourcePath}`);

    const stat = yield* fs.stat(sourcePath).pipe(Effect.catchAll(() => Effect.succeed(null)));

    if (!stat || !stat.isDirectory()) {
      yield* prompt.error(`Source directory not found: ${sourcePath}`);
      return;
    }

    const files = yield* fs.readdir(sourcePath);
    const tsFiles = files.filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));

    if (tsFiles.length === 0) {
      yield* prompt.warn("No .ts or .tsx files found to pack.");
      return;
    }

    const items: RegistryItem[] = [];

    for (const file of tsFiles) {
      const fullPath = path.join(sourcePath, file);
      const rawContent = yield* fs.readFile(fullPath);
      const content =
        typeof rawContent === "string" ? rawContent : new TextDecoder().decode(rawContent);
      const item = buildRegistryItemFromFile({
        path: fullPath,
        content,
        targetDir: sourcePath,
      });
      items.push(item);
    }

    const outputPath = path.resolve(intent.flags.cwd, intent.output || "registry.json");
    yield* fs.writeFile(
      outputPath,
      JSON.stringify(
        {
          name: "Packed Registry",
          description: "Auto-generated registry",
          items,
        },
        null,
        2,
      ),
      "utf-8",
    );

    yield* prompt.success(`Packed ${items.length} items to ${outputPath}`);
  });
