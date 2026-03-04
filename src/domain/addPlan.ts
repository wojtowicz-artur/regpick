import type { AppError } from "@/core/errors.js";
import { resolveOutputPathFromPolicy } from "@/domain/pathPolicy.js";
import type {
  InstallPlan,
  PlannedWrite,
  RegistryItem,
  RegpickConfig,
} from "@/types.js";
import { Array, Effect } from "effect";

function buildDependencyPlan(
  selectedItems: RegistryItem[],
): InstallPlan["dependencyPlan"] {
  return {
    dependencies: Array.dedupe(
      selectedItems.flatMap((item) => item.dependencies || []).filter(Boolean),
    ),
    devDependencies: Array.dedupe(
      selectedItems
        .flatMap((item) => item.devDependencies || [])
        .filter(Boolean),
    ),
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

    if (
      current.registryDependencies &&
      current.registryDependencies.length > 0
    ) {
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
    resolvedItems: Array.fromIterable(allResolvedItems.values()),
    missingDependencies: Array.dedupe(missingDependencies.filter(Boolean)),
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
        const { absoluteTarget, relativeTarget } =
          yield* resolveOutputPathFromPolicy(item, file, cwd, config);
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

export type InteractiveAddState = {
  selectedItems: RegistryItem[];
  plannedWrites: PlannedWrite[];
  existingTargets: Set<string>;
  missingDependencies: string[];
  missingDevDependencies: string[];
};

export type ApprovedAddPlan = {
  selectedItems: RegistryItem[];
  shouldInstallDeps: boolean;
  finalWrites: PlannedWrite[];
  dependencyPlan: { dependencies: string[]; devDependencies: string[] };
};

export type OverwriteResolution = "overwrite" | "skip" | "abort";

export function computeFinalWrites(
  plannedWrites: PlannedWrite[],
  existingTargets: Set<string>,
  resolutions: Map<string, OverwriteResolution>,
  assumeYes: boolean,
  overwritePolicy: "prompt" | "overwrite" | "skip" = "prompt",
): PlannedWrite[] {
  const finalWrites: PlannedWrite[] = [];

  for (const write of plannedWrites) {
    if (existingTargets.has(write.absoluteTarget)) {
      if (assumeYes || overwritePolicy === "overwrite") {
        finalWrites.push(write);
      } else if (overwritePolicy === "skip") {
        continue;
      } else {
        const res = resolutions.get(write.absoluteTarget);
        if (res === "overwrite") {
          finalWrites.push(write);
        }
      }
    } else {
      finalWrites.push(write);
    }
  }

  return finalWrites;
}
