import path from "node:path";

import { appError, type AppError } from "../core/errors.js";
import { err, ok, type Result } from "../core/result.js";
import { buildInstallPlan } from "../domain/addPlan.js";
import { applyAliases } from "../domain/aliasCore.js";
import { selectItemsFromFlags } from "../domain/selection.js";
import { readConfig, resolveRegistrySource } from "../shell/config.js";
import {
  collectMissingDependencies,
  installDependencies,
} from "../shell/installer.js";
import { computeHash, readLockfile, writeLockfile } from "../shell/lockfile.js";
import { resolvePackageManager } from "../shell/packageManagers/resolver.js";
import { loadRegistry, resolveFileContent } from "../shell/registry.js";
import type {
  CommandContext,
  CommandOutcome,
  PlannedWrite,
  RegistryItem,
  RegpickConfig,
} from "../types.js";

async function promptForSource(
  context: CommandContext,
  config: RegpickConfig,
  positionals: string[],
): Promise<Result<string | null, AppError>> {
  const argValue = positionals[1];
  if (argValue) {
    return ok(resolveRegistrySource(argValue, config));
  }

  const aliases = Object.entries(config.registries || {}).map(
    ([alias, value]) => ({
      label: `${alias} -> ${value}`,
      value: alias,
    }),
  );

  if (aliases.length) {
    const picked = await context.runtime.prompt.multiselect({
      message: "Pick registry alias (or cancel and provide URL/path manually)",
      options: aliases,
      maxItems: 1,
      required: false,
    });

    if (context.runtime.prompt.isCancel(picked)) {
      return err(appError("UserCancelled", "Operation cancelled."));
    }

    if (Array.isArray(picked) && picked.length > 0) {
      return ok(resolveRegistrySource(String(picked[0]), config));
    }
  }

  const manual = await context.runtime.prompt.text({
    message: "Registry URL/path:",
    placeholder: "https://example.com/registry.json",
  });

  if (context.runtime.prompt.isCancel(manual)) {
    return err(appError("UserCancelled", "Operation cancelled."));
  }

  return ok(String(manual));
}

function mapOptions(
  items: RegistryItem[],
): Array<{ value: string; label: string; hint: string }> {
  return items.map((item) => ({
    value: item.name,
    label: `${item.name} (${item.type || "registry:file"})`,
    hint: item.description || `${item.files.length} file(s)`,
  }));
}

async function promptForItems(
  context: CommandContext,
  items: RegistryItem[],
): Promise<Result<RegistryItem[], AppError>> {
  if (!items.length) {
    return ok([]);
  }

  const selectedNames = await context.runtime.prompt.autocompleteMultiselect({
    message: "Select items to install",
    options: mapOptions(items),
    maxItems: 10,
    required: true,
  });

  if (context.runtime.prompt.isCancel(selectedNames)) {
    return err(appError("UserCancelled", "Operation cancelled."));
  }

  const selectedValues = Array.isArray(selectedNames) ? selectedNames : [];
  const selectedSet = new Set(
    selectedValues.map((entry: string) => String(entry)),
  );
  return ok(items.filter((item) => selectedSet.has(item.name)));
}

export async function runAddCommand(
  context: CommandContext,
): Promise<Result<CommandOutcome, AppError>> {
  const assumeYes = Boolean(context.args.flags.yes);
  const { config } = await readConfig(context.cwd);
  const sourceResult = await promptForSource(
    context,
    config,
    context.args.positionals,
  );
  if (!sourceResult.ok) {
    return sourceResult;
  }
  const source = sourceResult.value;
  if (!source) {
    return ok({ kind: "noop", message: "No registry source provided." });
  }

  const registryResult = await loadRegistry(
    source,
    context.cwd,
    context.runtime,
  );
  if (!registryResult.ok) {
    return registryResult;
  }
  const { items } = registryResult.value;
  if (!items.length) {
    context.runtime.prompt.warn("No installable items in registry.");
    return ok({ kind: "noop", message: "No installable items in registry." });
  }

  const preselected = selectItemsFromFlags(items, context);
  const promptedSelectionResult =
    preselected.ok && preselected.value
      ? preselected
      : await promptForItems(context, items);
  if (!promptedSelectionResult.ok) {
    return promptedSelectionResult;
  }
  const selectedItems = promptedSelectionResult.value;

  if (!selectedItems || !selectedItems.length) {
    context.runtime.prompt.warn("No items selected.");
    return ok({ kind: "noop", message: "No items selected." });
  }

  if (!assumeYes) {
    const proceed = await context.runtime.prompt.confirm({
      message: `Install ${selectedItems.length} item(s)?`,
      initialValue: true,
    });

    if (context.runtime.prompt.isCancel(proceed) || !proceed) {
      return err(appError("UserCancelled", "Operation cancelled."));
    }
  }

  const existingTargets = new Set<string>();
  const installPlanProbeRes = buildInstallPlan(
    selectedItems,
    context.cwd,
    config,
  );
  if (!installPlanProbeRes.ok) return installPlanProbeRes;
  const installPlanProbe = installPlanProbeRes.value;

  for (const write of installPlanProbe.plannedWrites) {
    if (await context.runtime.fs.pathExists(write.absoluteTarget)) {
      existingTargets.add(write.absoluteTarget);
    }
  }

  const installPlanRes = buildInstallPlan(
    selectedItems,
    context.cwd,
    config,
    existingTargets,
  );
  if (!installPlanRes.ok) return installPlanRes;
  const installPlan = installPlanRes.value;

  // --- UI INTERACTION PHASE: Gather Overwrite Decisions ---
  const finalWrites: PlannedWrite[] = [];
  for (const write of installPlan.plannedWrites) {
    if (existingTargets.has(write.absoluteTarget)) {
      if (assumeYes || config.overwritePolicy === "overwrite") {
        finalWrites.push(write);
      } else if (config.overwritePolicy === "skip") {
        context.runtime.prompt.warn(
          `Skipped existing file: ${write.absoluteTarget}`,
        );
      } else {
        const answer = await context.runtime.prompt.select({
          message: `File exists: ${write.absoluteTarget}`,
          options: [
            { value: "overwrite", label: "Overwrite this file" },
            { value: "skip", label: "Skip this file" },
            { value: "abort", label: "Abort installation" },
          ],
        });
        if (context.runtime.prompt.isCancel(answer) || answer === "abort") {
          return err(
            appError("UserCancelled", "Installation aborted by user."),
          );
        }
        if (answer === "overwrite") {
          finalWrites.push(write);
        }
      }
    } else {
      finalWrites.push(write);
    }
  }

  // --- UI INTERACTION PHASE: Gather Dependency Decisions ---
  const { missingDependencies, missingDevDependencies } =
    collectMissingDependencies(selectedItems, context.cwd, context.runtime);
  let shouldInstallDeps = false;
  if (missingDependencies.length || missingDevDependencies.length) {
    if (assumeYes) {
      shouldInstallDeps = true;
    } else {
      const packageManager = resolvePackageManager(
        context.cwd,
        config.packageManager,
        context.runtime,
      );
      const messageParts: string[] = [];
      if (missingDependencies.length)
        messageParts.push(`dependencies: ${missingDependencies.join(", ")}`);
      if (missingDevDependencies.length)
        messageParts.push(
          `devDependencies: ${missingDevDependencies.join(", ")}`,
        );

      const proceed = await context.runtime.prompt.confirm({
        message: `Install missing packages with ${packageManager}? (${messageParts.join(" | ")})`,
        initialValue: true,
      });

      if (context.runtime.prompt.isCancel(proceed)) {
        return err(
          appError(
            "UserCancelled",
            "Dependency installation cancelled by user.",
          ),
        );
      }
      shouldInstallDeps = Boolean(proceed);
      if (!shouldInstallDeps) {
        context.runtime.prompt.warn("Skipped dependency installation.");
      }
    }
  }

  // --- EXECUTION PHASE: Pure IO without UI interruptions ---
  let writtenFiles = 0;
  const lockfile = await readLockfile(context.cwd, context.runtime);
  const hashesAcc: Record<string, string[]> = {};

  for (const write of finalWrites) {
    const item = selectedItems.find((entry) => entry.name === write.itemName);
    if (!item) continue;

    const contentResult = await resolveFileContent(
      write.sourceFile,
      item,
      context.cwd,
      context.runtime,
    );
    if (!contentResult.ok) {
      return contentResult;
    }

    let content = applyAliases(contentResult.value, config);

    const ensureRes = await context.runtime.fs.ensureDir(
      path.dirname(write.absoluteTarget),
    );
    if (!ensureRes.ok) return ensureRes;
    const writeRes = await context.runtime.fs.writeFile(
      write.absoluteTarget,
      content,
      "utf8",
    );
    if (!writeRes.ok) return writeRes;

    // Update lockfile
    const contentHash = computeHash(content);
    if (!hashesAcc[item.name]) hashesAcc[item.name] = [];
    hashesAcc[item.name].push(contentHash);

    writtenFiles += 1;
    context.runtime.prompt.success(`Wrote ${write.relativeTarget}`);
  }

  if (writtenFiles > 0) {
    for (const [itemName, fileHashes] of Object.entries(hashesAcc)) {
      const combinedHash = computeHash(fileHashes.sort().join(""));
      lockfile.components[itemName] = {
        source: source,
        hash: combinedHash,
      };
    }
    await writeLockfile(context.cwd, lockfile, context.runtime);
  }

  if (shouldInstallDeps) {
    const packageManager = resolvePackageManager(
      context.cwd,
      config.packageManager,
      context.runtime,
    );
    const depsRes = installDependencies(
      context.cwd,
      packageManager,
      missingDependencies,
      missingDevDependencies,
      context.runtime,
    );
    if (!depsRes.ok) return depsRes;
  }

  context.runtime.prompt.info(
    `Installed ${selectedItems.length} item(s), wrote ${writtenFiles} file(s).`,
  );
  return ok({
    kind: "success",
    message: `Installed ${selectedItems.length} item(s), wrote ${writtenFiles} file(s).`,
  });
}
