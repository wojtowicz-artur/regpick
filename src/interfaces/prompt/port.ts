import type { UserCancelled } from "@/core/errors.js";
import type { AddIntent } from "@/domain/models/intent.js";
import type { InstallPlan, OverwritePolicy, PlannedWrite } from "@/domain/models/plan.js";
import type { RegistryItem } from "@/domain/models/registry.js";
import { Context, Effect } from "effect";

export type ResolvedConflicts = {
  writes: PlannedWrite[];
  skipped: PlannedWrite[];
};

export class PromptPort extends Context.Tag("PromptPort")<
  PromptPort,
  {
    // SEMANTYCZNE
    selectItems(
      items: RegistryItem[],
      intent: AddIntent,
    ): Effect.Effect<RegistryItem[], UserCancelled>;

    resolveConflicts(
      conflicts: PlannedWrite[],
      policy: OverwritePolicy,
    ): Effect.Effect<ResolvedConflicts, UserCancelled>;

    confirmInstall(plan: InstallPlan): Effect.Effect<void, UserCancelled>;

    confirmDependencyInstall(
      deps: string[],
      devDeps: string[],
      packageManager: string,
    ): Effect.Effect<boolean, UserCancelled>;

    // GENERYCZNE
    intro(message: string): Effect.Effect<void, never>;
    outro(message: string): Effect.Effect<void, never>;
    info(message: string): Effect.Effect<void, never>;
    warn(message: string): Effect.Effect<void, never>;
    error(message: string): Effect.Effect<void, never>;
    success(message: string): Effect.Effect<void, never>;
    log(message: string): Effect.Effect<void, never>;

    text(options: {
      message: string;
      placeholder?: string;
      defaultValue?: string;
    }): Effect.Effect<string, UserCancelled>;

    confirm(options: {
      message: string;
      initialValue?: boolean;
    }): Effect.Effect<boolean, UserCancelled>;

    select(options: {
      message: string;
      options: Array<{ value: string; label: string; hint?: string }>;
    }): Effect.Effect<string, UserCancelled>;

    multiselect(options: {
      message: string;
      options: Array<{ value: string; label: string; hint?: string }>;
      required?: boolean;
    }): Effect.Effect<string[], UserCancelled>;
  }
>() {}
