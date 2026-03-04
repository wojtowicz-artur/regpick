import type { AppError } from "@/core/errors.js";
import { resolveOutputPathFromPolicy } from "@/domain/pathPolicy.js";
import type { InstallPlan, PlannedWrite, RegistryItem, RegpickConfig } from "@/types.js";
import { Effect } from "effect";

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function buildDependencyPlan(selectedItems: RegistryItem[]): InstallPlan["dependencyPlan"] {
  return {
    dependencies: unique(selectedItems.flatMap((item) => item.dependencies || [])),
    devDependencies: unique(selectedItems.flatMap((item) => item.devDependencies || [])),
  };
}

export function resolveRegistryDependencies(
  selectedItems: RegistryItem[],
  allItems: RegistryItem[],
): { resolvedItems: RegistryItem[]; missingDependencies: string[] } {
  const allResolvedItems = new Map<string, RegistryItem>();
  const toResolve = [...selectedItems];
  const missingDependencies: string[] = [];

  while (toResolve.length > 0) {
    const current = toResolve.shift()!;
    if (allResolvedItems.has(current.name)) continue;
    allResolvedItems.set(current.name, current);

    if (current.registryDependencies && current.registryDependencies.length > 0) {
      for (const depName of current.registryDependencies) {
        if (allResolvedItems.has(depName)) continue;
        const found = allItems.find((i) => i.name === depName);
        if (found) {
          toResolve.push(found);
        } else {
          missingDependencies.push(depName);
        }
      }
    }
  }

  return {
    resolvedItems: Array.from(allResolvedItems.values()),
    missingDependencies: unique(missingDependencies),
  };
}

export const buildInstallPlan = (
  selectedItems: RegistryItem[],
  cwd: string,
  config: RegpickConfig,
  existingTargets: Set<string> = new Set(),
): Effect.Effect<InstallPlan, AppError> =>
  Effect.gen(function* () {
    const plannedWrites: PlannedWrite[] = [];
    const conflicts: PlannedWrite[] = [];

    for (const item of selectedItems) {
      for (const file of item.files) {
        const { absoluteTarget, relativeTarget } = yield* resolveOutputPathFromPolicy(
          item,
          file,
          cwd,
          config,
        );
        const planned: PlannedWrite = {
          itemName: item.name,
          sourceFile: file,
          absoluteTarget,
          relativeTarget,
        };
        plannedWrites.push(planned);
        if (existingTargets.has(absoluteTarget)) {
          conflicts.push(planned);
        }
      }
    }

    return yield* Effect.succeed({
      selectedItems,
      plannedWrites,
      dependencyPlan: buildDependencyPlan(selectedItems),
      conflicts,
    });
  });
