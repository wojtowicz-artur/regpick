import type { InstallError } from "@/core/errors.js";
import { Context, Effect } from "effect";

export class ExecPort extends Context.Tag("ExecPort")<
  ExecPort,
  {
    installPackages(
      cwd: string,
      deps: string[],
      devDeps: string[],
    ): Effect.Effect<void, InstallError>;
  }
>() {}
