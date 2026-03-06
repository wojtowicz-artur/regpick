import type { CliArgs, ListIntent } from "@/domain/models/intent.js";

export function buildListIntent(args: CliArgs): ListIntent {
  return {
    flags: {
      cwd: (args.flags.cwd as string) || process.cwd(),
    },
  };
}
