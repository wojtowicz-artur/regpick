import type { CliArgs, ListIntent } from "@/domain/models/intent.js";

export function buildListIntent(args: CliArgs): ListIntent {
  return {
    source: args.positionals[1] as string | undefined,
    flags: {
      cwd: (args.flags.cwd as string) || process.cwd(),
    },
  };
}
