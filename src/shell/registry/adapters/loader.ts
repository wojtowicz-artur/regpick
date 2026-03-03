import path from "node:path";
import * as v from "valibot";
import { RegistryAdapterSchema } from "../../config.js";
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

        const validAdapter = v.parse(RegistryAdapterSchema, resolved);
        adapters.push(validAdapter as unknown as RegistryAdapter);
      } catch (err: any) {
        console.warn(
          `[regpick] Failed to load registry adapter module: ${adapter} - ${err.message}`,
        );
      }
    } else {
      try {
        const validAdapter = v.parse(RegistryAdapterSchema, adapter);
        adapters.push(validAdapter as unknown as RegistryAdapter);
      } catch (err: any) {
        console.warn(`[regpick] Invalid registry adapter provided: ${err.message}`);
      }
    }
  }

  return adapters;
}
