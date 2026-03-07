import type { AddIntent, CliArgs } from "@/domain/models/intent.js";

export function buildAddIntent(args: CliArgs): AddIntent {
  const commandIndex = args.positionals.indexOf("add");
  const baseIndex = commandIndex > -1 ? commandIndex + 1 : 0;
  const sourceRaw = args.positionals[baseIndex];

  if (!sourceRaw) {
    throw new Error("Missing registry source for 'add' command.");
  }

  // Components can be specified as subsequent positionals or via --components flag
  const positionalComponents = args.positionals.slice(baseIndex + 1);
  const rawComponents = args.flags.components as string | undefined;
  const flagComponents = rawComponents ? rawComponents.split(",").map((c) => c.trim()) : [];

  const components = [...positionalComponents, ...flagComponents];

  return {
    source: sourceRaw,
    flags: {
      cwd: (args.flags.cwd as string) || process.cwd(),
      yes: args.flags.yes as boolean | undefined,
      all: args.flags.all as boolean | undefined,
      overwrite: args.flags.overwrite as boolean | undefined,
      components,
    },
  };
}
