import { type RegpickConfig } from "@/domain/configModel.js";
import { type ConfigFormat } from "@/shell/config/loader.js";

export function serializeObjectToJS(obj: unknown, indentLevel = 1): string {
  if (obj === null) return "null";
  if (typeof obj === "string") return `"${obj}"`;
  if (typeof obj === "number" || typeof obj === "boolean") return String(obj);

  if (Array.isArray(obj)) {
    if (obj.length === 0) return "[]";
    const indent = "  ".repeat(indentLevel);
    const inner = obj.map((val) => serializeObjectToJS(val, indentLevel + 1)).join(`,\n${indent}`);
    return `[\n${indent}${inner}\n${"  ".repeat(indentLevel - 1)}]`;
  }

  if (typeof obj === "object") {
    const keys = Object.keys(obj);
    if (keys.length === 0) return "{}";

    const record = obj as Record<string, unknown>;
    const indent = "  ".repeat(indentLevel);
    const inner = keys
      .map((key) => {
        const isIdentifier = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key);
        const safeKey = isIdentifier ? key : `"${key}"`;
        return `${safeKey}: ${serializeObjectToJS(record[key], indentLevel + 1)}`;
      })
      .join(`,\n${indent}`);

    return `{\n${indent}${inner}\n${"  ".repeat(indentLevel - 1)}}`;
  }

  return "undefined";
}

export function generateConfigCode(config: RegpickConfig, format: ConfigFormat): string {
  if (format === "json") {
    return JSON.stringify(config, null, 2);
  }

  const objectCode = serializeObjectToJS(config, 1);

  if (format === "cjs") {
    return `const { defineConfig } = require("regpick");\n\nmodule.exports = defineConfig(${objectCode});\n`;
  }

  return `import { defineConfig } from "regpick";\n\nexport default defineConfig(${objectCode});\n`;
}
