import path from "node:path";
import pc from "picocolors";
import * as diff from "diff";

import { appError, type AppError } from "../core/errors.js";
import { err, ok, type Result } from "../core/result.js";
import type { CommandContext, CommandOutcome, RegistryItem } from "../types.js";
import { readLockfile, computeHash, writeLockfile } from "../shell/lockfile.js";
import { loadRegistry, resolveFileContent } from "../shell/registry.js";
import { resolveOutputPathFromPolicy } from "../domain/pathPolicy.js";
import { readConfig } from "../shell/config.js";

function printDiff(oldContent: string, newContent: string) {
  const changes = diff.diffLines(oldContent, newContent);
  for (const part of changes) {
    const color = part.added ? pc.green : part.removed ? pc.red : pc.gray;
    const prefix = part.added ? "+ " : part.removed ? "- " : "  ";
    const lines = part.value.replace(/\n$/, "").split("\n");
    for (const line of lines) {
      console.log(color(`${prefix}${line}`));
    }
  }
}

export async function runUpdateCommand(
  context: CommandContext,
): Promise<Result<CommandOutcome, AppError>> {
  const lockfile = await readLockfile(context.cwd, context.runtime);
  const componentNames = Object.keys(lockfile.components);

  if (componentNames.length === 0) {
    context.runtime.prompt.info("No components installed. Nothing to update.");
    return ok({ kind: "noop", message: "No components to update." });
  }

  const { config } = await readConfig(context.cwd);

  // Group by source
  const bySource: Record<string, string[]> = {};
  for (const name of componentNames) {
    const source = lockfile.components[name].source;
    if (source) {
      if (!bySource[source]) bySource[source] = [];
      bySource[source].push(name);
    }
  }

  let updatedCount = 0;

  for (const [source, itemsToUpdate] of Object.entries(bySource)) {
    const registryRes = await loadRegistry(source, context.cwd, context.runtime);
    if (!registryRes.ok) {
      context.runtime.prompt.warn(`Failed to load registry ${source}`);
      continue;
    }

    const registryItems = registryRes.value.items;
    
    for (const itemName of itemsToUpdate) {
      const registryItem = registryItems.find(i => i.name === itemName);
      if (!registryItem) continue;

      // Get remote contents
      const remoteContents: string[] = [];
      const remoteFiles: { target: string; content: string }[] = [];
      
      for (const file of registryItem.files) {
        const contentRes = await resolveFileContent(file, registryItem, context.cwd, context.runtime);
        if (!contentRes.ok) continue;

        let content = contentRes.value;
        for (const [oldAlias, newAlias] of Object.entries(config.aliases || {})) {
          const regex = new RegExp(`from ["']${oldAlias}(.*?)["']`, "g");
          content = content.replace(regex, `from "${newAlias}$1"`);
          const dynRegex = new RegExp(`import\\(["']${oldAlias}(.*?)["']\\)`, "g");
          content = content.replace(dynRegex, `import("${newAlias}$1")`);
        }

        remoteContents.push(content);
        
        const outputRes = resolveOutputPathFromPolicy(registryItem, file, context.cwd, config);
        if (outputRes.ok) {
           remoteFiles.push({ target: outputRes.value.absoluteTarget, content: content });
        }
      }
      
      const newHash = computeHash(remoteContents.sort().join(""));
      const currentHash = lockfile.components[itemName].hash;

      if (newHash !== currentHash) {
        context.runtime.prompt.info(`Update available for ${itemName}`);
        
        const action = await context.runtime.prompt.select({
          message: `What do you want to do with ${itemName}?`,
          options: [
            { value: "diff", label: "Show diff" },
            { value: "update", label: "Update" },
            { value: "skip", label: "Skip" }
          ]
        });

        if (context.runtime.prompt.isCancel(action) || action === "skip") {
          continue;
        }

        if (action === "diff") {
          for (const rf of remoteFiles) {
             const localContentRes = await context.runtime.fs.readFile(rf.target, "utf8");
             const localContent = localContentRes.ok ? localContentRes.value : "";
             console.log(pc.bold(`\nDiff for ${rf.target}:`));
             printDiff(localContent, rf.content);
          }
          
          const confirm = await context.runtime.prompt.confirm({
             message: `Update ${itemName} now?`,
             initialValue: true
          });
          
          if (context.runtime.prompt.isCancel(confirm) || !confirm) {
             continue;
          }
        }

        // Apply update
        for (const rf of remoteFiles) {
          const ensureRes = await context.runtime.fs.ensureDir(path.dirname(rf.target));
          if (!ensureRes.ok) return ensureRes;
          const writeRes = await context.runtime.fs.writeFile(rf.target, rf.content, "utf8");
          if (!writeRes.ok) return writeRes;
        }

        lockfile.components[itemName].hash = newHash;
        updatedCount++;
        context.runtime.prompt.success(`Updated ${itemName}`);
      }
    }
  }

  if (updatedCount > 0) {
    await writeLockfile(context.cwd, lockfile, context.runtime);
    return ok({ kind: "success", message: `Updated ${updatedCount} components.` });
  }

  return ok({ kind: "noop", message: "All components are up to date." });
}
