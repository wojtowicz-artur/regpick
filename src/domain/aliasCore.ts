import type { RegpickConfig } from "@/domain/models/index.js";

export function applyAliases(content: string, config: Pick<RegpickConfig, "resolve">): string {
  let result = content;
  for (const [oldAlias, newAlias] of Object.entries(config.resolve.aliases)) {
    const regex = new RegExp(`from ["']${oldAlias}(.*?)["']`, "g");
    result = result.replace(regex, `from "${newAlias}$1"`);
    // Also handle dynamic imports
    const dynRegex = new RegExp(`import\\(["']${oldAlias}(.*?)["']\\)`, "g");
    result = result.replace(dynRegex, `import("${newAlias}$1")`);
  }
  return result;
}
