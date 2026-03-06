import { InstallError } from "@/core/errors.js";
import { ExecPort } from "./port.js";
import { Effect } from "effect";
import { spawnSync } from "child_process";
import type { ResolvedRegpickConfig } from "@/domain/models/index.js";
import { resolvePackageManager } from "@/shell/packageManagers/resolver.js";
import { getPackageManagerPlugin } from "@/shell/packageManagers/strategy.js";
import fs from "node:fs";

export const createExecService = (cwd: string, config: ResolvedRegpickConfig) =>
  ExecPort.of({
    installPackages: (cwd, deps, devDeps) =>
      Effect.gen(function* () {
        const pmName = yield* resolvePackageManager(
          cwd,
          config.install?.packageManager,
          { fs: { existsSync: fs.existsSync } },
          config,
        );

        const plugin = getPackageManagerPlugin(pmName, config);
        if (!plugin) {
          return yield* Effect.fail(
            new InstallError({ message: `Package manager plugin not found for ${pmName}` }),
          );
        }

        const commands = plugin.buildInstallCommands(deps, devDeps);

        for (const cmd of commands) {
          yield* Effect.try({
            try: () => {
              const res = spawnSync(cmd.command, cmd.args, { cwd, stdio: "inherit", shell: true });
              if (res.error) {
                throw res.error;
              }
              if (res.status !== 0) {
                throw new Error(`Command failed with status ${res.status}`);
              }
            },
            catch: (e) =>
              new InstallError({ message: `Failed to execute ${cmd.command}`, cause: e }),
          });
        }
      }),
  });
