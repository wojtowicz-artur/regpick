import type { CliArgs, PackIntent } from "@/domain/models/intent.js";

export function buildPackIntent(args: CliArgs): PackIntent {
  const commandIndex = args.positionals.indexOf("pack");
  const sourceRaw = args.positionals[commandIndex > -1 ? commandIndex + 1 : 0];
  const outputRaw = args.positionals[commandIndex > -1 ? commandIndex + 2 : 1];

  if (!sourceRaw) throw new Error("Missing source directory for 'pack'");

  return {
    source: sourceRaw,
    output: outputRaw || "registry", // default output dir
    flags: {
      cwd: (args.flags.cwd as string) || process.cwd(),
    },
  };
}
