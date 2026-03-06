import type { AddIntent, CliArgs } from "@/domain/models/intent.js";

export function buildAddIntent(args: CliArgs): AddIntent {
  // Command: regpick add [source]
  // We assume "add" is positionals[0] if it was passed to parseArgs, or maybe just the source is [0] depending on slice.
  // Standardly: positionals = ["add", "url"] or positionals = ["url"] if we parsed after command picking.
  // Let's assume index 0 is command, index 1 is source, or index 0 is source if we pre-sliced.
  const commandIndex = args.positionals.indexOf("add");
  const sourceRaw = args.positionals[commandIndex > -1 ? commandIndex + 1 : 0];

  if (!sourceRaw) {
    throw new Error("Missing registry source for 'add' command.");
  }

  const rawComponents = args.flags.components as string | undefined;
  const components = rawComponents ? rawComponents.split(",").map((c) => c.trim()) : [];

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
