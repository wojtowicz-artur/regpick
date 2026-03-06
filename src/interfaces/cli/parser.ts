import type { CliArgs } from "@/domain/models/intent.js";
import { parseArgs } from "node:util";

export function parseCliArgs(args: string[]): CliArgs {
  const { values, positionals } = parseArgs({
    args,
    options: {
      cwd: { type: "string" },
      yes: { type: "boolean", short: "y" },
      all: { type: "boolean", short: "a" },
      force: { type: "boolean", short: "f" },
      overwrite: { type: "boolean" },
      components: { type: "string" }, // expected format: a,b,c
      help: { type: "boolean", short: "h" },
    },
    strict: false,
    allowPositionals: true,
  });

  const flags: Record<string, string | boolean> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) {
      flags[key] = value as string | boolean;
    }
  }

  return { flags, positionals };
}
