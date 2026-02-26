import type { CliArgs, FlagValue } from "../../types.js";

function parseValue(rawValue: string): FlagValue {
  if (rawValue === "true") {
    return true;
  }
  if (rawValue === "false") {
    return false;
  }
  return rawValue;
}

export function parseCliArgs(argv: string[]): CliArgs {
  const flags: Record<string, FlagValue> = {};
  const positionals: string[] = [];

  for (const token of argv) {
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const withoutPrefix = token.slice(2);
    const separatorIndex = withoutPrefix.indexOf("=");

    if (separatorIndex === -1) {
      flags[withoutPrefix] = true;
      continue;
    }

    const key = withoutPrefix.slice(0, separatorIndex);
    const value = withoutPrefix.slice(separatorIndex + 1);
    flags[key] = parseValue(value);
  }

  return { flags, positionals };
}
