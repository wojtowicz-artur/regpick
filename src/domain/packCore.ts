export function extractDependencies(content: string): string[] {
  const importRegex = /import\s+[\s\S]*?from\s+["']([^"']+)["']/g;
  const dynamicImportRegex = /import\(["']([^"']+)["']\)/g;
  
  const deps = new Set<string>();
  
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const specifier = match[1];
    if (
      !specifier.startsWith(".") &&
      !specifier.startsWith("/") &&
      !specifier.startsWith("~") &&
      !specifier.startsWith("@/") &&
      !specifier.startsWith("@\\")
    ) {
      const parts = specifier.split("/");
      if (specifier.startsWith("@") && parts.length > 1) {
        deps.add(`${parts[0]}/${parts[1]}`);
      } else {
        deps.add(parts[0]);
      }
    }
  }
  while ((match = dynamicImportRegex.exec(content)) !== null) {
    const specifier = match[1];
    if (
      !specifier.startsWith(".") &&
      !specifier.startsWith("/") &&
      !specifier.startsWith("~") &&
      !specifier.startsWith("@/") &&
      !specifier.startsWith("@\\")
    ) {
      const parts = specifier.split("/");
      if (specifier.startsWith("@") && parts.length > 1) {
        deps.add(`${parts[0]}/${parts[1]}`);
      } else {
        deps.add(parts[0]);
      }
    }
  }

  return Array.from(deps);
}
