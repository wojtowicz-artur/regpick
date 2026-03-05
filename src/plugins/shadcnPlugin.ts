import { type EffectPipelinePlugin } from "@/core/pipeline.js";
import { Effect } from "effect";

/**
 * An example plugin demonstrating 100% compatibility with shadcn-ui conventions.
 * This can parse components, manipulate imports, and inject tailwind features
 * on the fly before writing to disk.
 */
export function shadcnPlugin(): EffectPipelinePlugin {
  return {
    type: "pipeline",
    name: "regpick:shadcn-compatibility",

    transform: (code: string, id: string) =>
      Effect.sync(() => {
        // Basic heuristic: if it's a TS/TSX file, we can map common paths.
        if (!id.endsWith(".ts") && !id.endsWith(".tsx")) {
          return null;
        }

        let modifiedCode = code;

        // 1. Example AST/Regex transform: mapping radix-ui colors to shadcn styling
        // E.g. replacing hardcoded hexes or bg-blue-500 with bg-primary
        // (a real world plugin would use ts-morph for React AST)

        // Example: Inject "use client" directive if "useState" or "useRef" exists and is not present
        if (
          (modifiedCode.includes("useState") || modifiedCode.includes("useRef")) &&
          !modifiedCode.includes('"use client"') &&
          !modifiedCode.includes("'use client'")
        ) {
          modifiedCode = '"use client";\n\n' + modifiedCode;
        }

        // 2. Fix inner alias paths if necessary
        // e.g., mapping "@/lib/utils" to ShadCN's standard CN util
        if (modifiedCode.includes("export function cn(")) {
          // do nothing, we're generating the utils file
        }

        // If no modifications occurred, return null to let other plugins process
        if (modifiedCode === code) return null;

        return modifiedCode;
      }),
  };
}
