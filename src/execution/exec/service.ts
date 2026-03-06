import { InstallError } from "@/core/errors.js";
import { ExecPort } from "./port.js";
import { Effect } from "effect";
import { spawnSync } from "child_process";
import type { ResolvedRegpickConfig } from "@/domain/models/index.js";

export const createExecService = (cwd: string, config: ResolvedRegpickConfig) =>
  ExecPort.of({
    installPackages: (cwd, deps, devDeps) =>
      Effect.try({
        try: () => {
          if (deps.length > 0) {
            spawnSync("npm", ["install", ...deps], { cwd, stdio: "inherit", shell: true });
          }
          if (devDeps.length > 0) {
            spawnSync("npm", ["install", "-D", ...devDeps], { cwd, stdio: "inherit", shell: true });
          }
        },
        catch: (e) => new InstallError({ message: "Failed to install packages", cause: e }),
      }),
  });
