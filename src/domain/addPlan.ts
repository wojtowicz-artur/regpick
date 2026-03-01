import type { AppError } from "@/core/errors.js";
import { ok, type Result } from "@/core/result.js";
import { resolveOutputPathFromPolicy } from "@/domain/pathPolicy.js";
import type {
  InstallPlan,
  PlannedWrite,
  RegistryItem,
  RegpickConfig,
} from "@/types.js";

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function buildDependencyPlan(
  selectedItems: RegistryItem[],
): InstallPlan["dependencyPlan"] {
  return {
    dependencies: unique(
      selectedItems.flatMap((item) => item.dependencies || []),
    ),
    devDependencies: unique(
      selectedItems.flatMap((item) => item.devDependencies || []),
    ),
  };
}

export function buildInstallPlan(
  selectedItems: RegistryItem[],
  cwd: string,
  config: RegpickConfig,
  existingTargets: Set<string> = new Set(),
): Result<InstallPlan, AppError> {
  const plannedWrites: PlannedWrite[] = [];
  const conflicts: PlannedWrite[] = [];

  for (const item of selectedItems) {
    for (const file of item.files) {
      const outputRes = resolveOutputPathFromPolicy(item, file, cwd, config);
      if (!outputRes.ok) return outputRes;

      const { absoluteTarget, relativeTarget } = outputRes.value;
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

  return ok({
    selectedItems,
    plannedWrites,
    dependencyPlan: buildDependencyPlan(selectedItems),
    conflicts,
  });
}
