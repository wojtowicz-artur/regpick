import { AppError } from "@/core/errors.js";
import { decideInitAfterFirstWrite } from "@/domain/initCore.js";
import { type InitIntent } from "@/domain/models/intent.js";
import { FileSystemPort } from "@/interfaces/fs/port.js";
import { PromptPort } from "@/interfaces/prompt/port.js";
import { resolveTargetConfigPath, writeDefaultConfig } from "@/shell/config/loader.js";
import { Effect } from "effect";
import path from "node:path";

export const initWorkflow = (
  intent: InitIntent,
): Effect.Effect<void, AppError, FileSystemPort | PromptPort> =>
  Effect.gen(function* () {
    const fs = yield* FileSystemPort;
    const prompt = yield* PromptPort;

    const configPath = yield* resolveTargetConfigPath(intent.flags.cwd);
    const fileName = path.basename(configPath);

    const exists = yield* fs.pathExists(configPath);

    const firstWriteSucceeded = !exists;

    let decision = decideInitAfterFirstWrite(firstWriteSucceeded);

    if (decision === "ask-overwrite") {
      if (intent.flags.force) {
        decision = "overwrite";
      } else {
        const overwrite = yield* prompt
          .confirm({
            message: `File ${fileName} already exists. Overwrite?`,
            initialValue: false,
          })
          .pipe(Effect.catchAll(() => Effect.succeed(false)));

        if (!overwrite) {
          decision = "keep";
        } else {
          decision = "overwrite";
        }
      }
    }

    if (decision === "created" || decision === "overwrite") {
      yield* writeDefaultConfig(intent.flags.cwd, { overwrite: true });
      yield* prompt.success(`Successfully initialized ${fileName}`);
    } else {
      yield* prompt.info(`Skipped overwriting ${fileName}`);
    }
  });
