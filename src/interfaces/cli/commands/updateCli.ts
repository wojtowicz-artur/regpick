import type { CliArgs, UpdateIntent } from "@/domain/models/intent.js";

export function buildUpdateIntent(args: CliArgs): UpdateIntent {
  return {
    flags: {
      cwd: (args.flags.cwd as string) || process.cwd(),
      yes: args.flags.yes as boolean | undefined,
      all: args.flags.all as boolean | undefined,
    },
  };
}
