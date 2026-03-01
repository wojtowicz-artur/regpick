import path from "node:path";
import type { RegistryItem } from "@/types.js";

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

export function buildRegistryItemFromFile(file: { path: string; content: string; targetDir: string }): RegistryItem {
  const dependencies = extractDependencies(file.content);
  const relativePath = path.relative(file.targetDir, file.path).replace(/\\/g, "/");
  const name = path.basename(file.path, path.extname(file.path));

  return {
    name,
    title: name,
    description: "Packed component",
    type: "registry:component",
    dependencies,
    devDependencies: [],
    registryDependencies: [],
    files: [
      {
        path: relativePath,
        type: "registry:component",
      },
    ],
  } as any;
}
