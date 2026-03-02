import path from "node:path";
import type { RegistryAdapter } from "./types.js";

export async function loadAdapters(
  configuredAdapters: (string | any)[],
  cwd: string,
): Promise<RegistryAdapter[]> {
  const adapters: RegistryAdapter[] = [];

  for (const adapter of configuredAdapters) {
    if (typeof adapter === "string") {
      try {
        let importPath = adapter;
        if (adapter.startsWith(".") || adapter.startsWith("/")) {
          importPath = path.resolve(cwd, adapter);
        }

        const imported = await import(importPath);
        const resolved = imported.default || imported.adapter || imported;
        if (typeof resolved.name === "string" && typeof resolved.match === "function") {
          adapters.push(resolved as RegistryAdapter);
        }
      } catch {
        console.warn(`[regpick] Failed to load registry adapter module: ${adapter}`);
      }
    } else if (
      adapter &&
      typeof adapter === "object" &&
      typeof adapter.name === "string" &&
      typeof adapter.match === "function"
    ) {
      adapters.push(adapter);
    }
  }

  return adapters;
}
