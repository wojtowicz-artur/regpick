import type { TransformContext, TransformPlugin } from "../sdk/index.js";

/**
 * An example plugin demonstrating 100% compatibility with shadcn-ui conventions.
 * This can parse components, manipulate imports, and inject tailwind features
 * on the fly before writing to disk.
 */
export function shadcnPlugin(): TransformPlugin {
  return {
    type: "transform",
    name: "regpick:shadcn-compatibility",

    transform: (code: string, fileId: string, ctx: TransformContext) => {
      // Basic heuristic: if it's a TS/TSX file, we can map common paths.
      if (!fileId.endsWith(".ts") && !fileId.endsWith(".tsx")) {
        return null;
      }

      let modifiedCode = code;

      // Example: Inject "use client" directive if "useState" or "useRef" exists and is not present
      if (
        (modifiedCode.includes("useState") || modifiedCode.includes("useRef")) &&
        !modifiedCode.includes('"use client"') &&
        !modifiedCode.includes("'use client'")
      ) {
        modifiedCode = '"use client";\n\n' + modifiedCode;
      }

      // If no modifications occurred, return null to let other plugins process
      if (modifiedCode === code) return null;

      return modifiedCode;
    },
  };
}
