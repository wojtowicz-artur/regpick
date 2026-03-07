import { UserCancelled } from "@/core/errors.js";
import type { PlannedWrite } from "@/domain/models/plan.js";
import { Effect, Layer } from "effect";
import pc from "picocolors";
import { PromptPort } from "./port.js";

// Use dynamic import but cast error away or use static
import * as p from "@clack/prompts";

const isCancelObj = (value: unknown): value is symbol => {
  return typeof value === "symbol" && value.description === "clack:cancel";
};

// Safe wrapper for clack
const callPrompt = <T>(promise: Promise<T | symbol>) =>
  Effect.tryPromise({
    try: () => promise,
    catch: () => new UserCancelled({ message: "User cancelled" }),
  }).pipe(
    Effect.flatMap((result) => {
      if (isCancelObj(result)) {
        return Effect.fail(new UserCancelled({ message: "User cancelled" }));
      }
      return Effect.succeed(result as T);
    }),
  );

export const createClackPromptLive = () =>
  Layer.succeed(PromptPort, {
    selectItems: (items, _intent) =>
      Effect.gen(function* () {
        const selectedNames = yield* callPrompt(
          p.multiselect({
            message: "Which components would you like to install?",
            options: items.map((item) => ({
              value: item.name,
              label: item.name,
              hint: item.description,
            })),
            required: true,
          }) as Promise<string[] | symbol>,
        );

        return items.filter((item) => selectedNames.includes(item.name));
      }),

    resolveConflicts: (conflicts, policy) =>
      Effect.gen(function* () {
        if (conflicts.length === 0) return { writes: [], skipped: [] };
        if (policy === "overwrite") return { writes: conflicts, skipped: [] };
        if (policy === "skip") return { writes: [], skipped: conflicts };

        const writes: PlannedWrite[] = [];
        const skipped: PlannedWrite[] = [];

        for (const conflict of conflicts) {
          const targetPath =
            (conflict as any).absoluteTarget || (conflict as any).targetPath || "unknown";

          const result = yield* callPrompt(
            p.select({
              message: `File ${pc.cyan(targetPath)} already exists. Overwrite?`,
              options: [
                { value: "yes", label: "Yes", hint: "Overwrite the file" },
                { value: "no", label: "No", hint: "Skip this file" },
                {
                  value: "all",
                  label: "Yes to all",
                  hint: "Overwrite this and all following conflicts",
                },
                {
                  value: "none",
                  label: "No to all",
                  hint: "Skip this and all following conflicts",
                },
              ],
            }) as Promise<string | symbol>,
          );

          if (result === "all") {
            writes.push(conflict);
            writes.push(...conflicts.slice(conflicts.indexOf(conflict) + 1));
            break;
          }
          if (result === "none") {
            skipped.push(conflict);
            skipped.push(...conflicts.slice(conflicts.indexOf(conflict) + 1));
            break;
          }
          if (result === "yes") {
            writes.push(conflict);
          } else {
            skipped.push(conflict);
          }
        }

        return { writes, skipped };
      }),

    confirmInstall: (plan) =>
      Effect.gen(function* () {
        const writes = (plan as any).finalWrites ?? (plan as any).plannedWrites ?? [];
        if (writes.length === 0) return;

        const result = yield* callPrompt(
          p.confirm({
            message: `Proceed with installation?`,
            initialValue: true,
          }) as Promise<boolean | symbol>,
        );

        if (!result) {
          yield* Effect.fail(new UserCancelled({ message: "User cancelled" }));
        }
      }),

    confirmDependencyInstall: (deps, devDeps, packageManager) =>
      callPrompt(
        p.confirm({
          message: `Install dependencies using ${packageManager}?`,
          initialValue: true,
        }) as Promise<boolean | symbol>,
      ),

    intro: (message) => Effect.sync(() => p.intro(message)),
    outro: (message) => Effect.sync(() => p.outro(message)),
    info: (message) => Effect.sync(() => p.log.info(message)),
    warn: (message) => Effect.sync(() => p.log.warn(message)),
    error: (message) => Effect.sync(() => p.log.error(message)),
    success: (message) => Effect.sync(() => p.log.success(message)),
    log: (message) => Effect.sync(() => console.log(message)),

    text: (options) => callPrompt(p.text(options) as Promise<string | symbol>),
    confirm: (options) => callPrompt(p.confirm(options) as Promise<boolean | symbol>),
    select: (options) => callPrompt(p.select(options) as Promise<string | symbol>),
    multiselect: (options) => callPrompt(p.multiselect(options) as Promise<string[] | symbol>),
  });
