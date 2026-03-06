import type { CliArgs, InitIntent } from "@/domain/models/intent.js";

export function buildInitIntent(args: CliArgs): InitIntent {
  return {
    flags: {
      cwd: (args.flags.cwd as string) || process.cwd(),
      yes: args.flags.yes as boolean | undefined,
      force: args.flags.force as boolean | undefined,
    },
  };
}
