import { AppError } from "@/core/errors.js";
import { DEFAULT_CONFIG } from "@/domain/configModel.js";
import { decideInitAfterFirstWrite } from "@/domain/initCore.js";
import { type InitIntent } from "@/domain/models/intent.js";
import { FileSystemPort } from "@/interfaces/fs/port.js";
import { PromptPort } from "@/interfaces/prompt/port.js";
import { Effect } from "effect";
import path from "node:path";

const CONFIG_FILE_NAME = "regpick.json";

export const initWorkflow = (
  intent: InitIntent,
): Effect.Effect<void, AppError, FileSystemPort | PromptPort> =>
  Effect.gen(function* () {
    const fs = yield* FileSystemPort;
    const prompt = yield* PromptPort;

    const configPath = path.join(intent.flags.cwd, CONFIG_FILE_NAME);

    const exists = yield* fs.pathExists(configPath);

    const firstWriteSucceeded = !exists;

    let decision = decideInitAfterFirstWrite(firstWriteSucceeded);

    if (decision === "ask-overwrite") {
      if (intent.flags.force) {
        decision = "overwrite";
      } else {
        const overwrite = yield* prompt
          .confirm({
            message: `File ${CONFIG_FILE_NAME} already exists. Overwrite?`,
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
      yield* fs.writeFile(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2), "utf-8");
      yield* prompt.success(`Successfully initialized ${CONFIG_FILE_NAME}`);
    } else {
      yield* prompt.info(`Skipped overwriting ${CONFIG_FILE_NAME}`);
    }
  });
