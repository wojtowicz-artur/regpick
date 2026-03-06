import { RegistryError } from "@/core/errors.js";
import { Registry, RegistryItem } from "@/domain/models/registry.js";
import { Effect } from "effect";

// Adapter specifically for standardizing Shadcn format.
// Many sources just use the base format, but if we need a specific parser, we put it here.
export function normalizeShadcnRegistry(
  data: any,
  source: string,
): Effect.Effect<Registry, RegistryError> {
  return Effect.try({
    try: () => {
      const items = (data.items || []).map(
        (item: any) =>
          ({
            name: item.name,
            title: item.title,
            description: item.description,
            type: item.type || "registry:ui",
            dependencies: item.dependencies || [],
            devDependencies: item.devDependencies || [],
            registryDependencies: item.registryDependencies || [],
            files: item.files || [],
            sourceMeta: { originalSource: source, ...item },
          }) as RegistryItem,
      );

      return {
        source,
        items,
      };
    },
    catch: (error) =>
      new RegistryError({
        message: "Failed to normalize Shadcn format",
        cause: error as Error,
      }),
  });
}
