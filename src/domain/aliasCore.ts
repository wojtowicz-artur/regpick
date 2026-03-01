import type { RegpickConfig } from "@/types.js";

export function applyAliases(content: string, config: RegpickConfig): string {
  let result = content;
  for (const [oldAlias, newAlias] of Object.entries(config.aliases || {})) {
    const regex = new RegExp(`from ["']${oldAlias}(.*?)["']`, "g");
    result = result.replace(regex, `from "${newAlias}$1"`);
    // Also handle dynamic imports
    const dynRegex = new RegExp(`import\\(["']${oldAlias}(.*?)["']\\)`, "g");
    result = result.replace(dynRegex, `import("${newAlias}$1")`);
  }
  return result;
}
