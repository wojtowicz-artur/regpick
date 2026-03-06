import { ConfigTag } from "@/core/context.js";
import { type AppError } from "@/core/errors.js";
import * as domain from "@/domain/addPlan.js";
import { applyAliases } from "@/domain/aliasCore.js";
import type { AddIntent } from "@/domain/models/intent.js";
import type { ResolvedPlan } from "@/domain/models/plan.js";
import type { JournalEntry } from "@/domain/models/state.js";
import { ExecPort } from "@/execution/exec/port.js";
import { JournalPort } from "@/execution/journal/port.js";
import { LockfilePort } from "@/execution/lockfile/port.js";
import { VFSPort } from "@/execution/vfs/port.js";
import { PromptPort } from "@/interfaces/prompt/port.js";
import { RegistryPort } from "@/registry/port.js";
import { Effect } from "effect";
import crypto from "node:crypto";
import * as path from "node:path";

// TODO: stubbed or imported missing domain logic
function resolveExistingTargets(selected: any[], cwd: string, config: any) {
  return Effect.succeed(new Set<string>());
}

function resolvePackageManagerName(cwd: string, config: any) {
  return Effect.succeed("npm");
}

function resolveTransformPlugins(config: any) {
  return [];
}

function getLockfilePath(cwd: string) {
  return path.join(cwd, "regpick.lock.json");
}

function buildNewLockfile(backup: any, plan: any, vfsOut: any, source: string): any {
  const lockfile = backup || { lockfileVersion: 2, components: {} };
  if (!lockfile.components) lockfile.components = {};
  for (const item of plan.selectedItems) {
    lockfile.components[item.name] = {
      version: item.version || "0.0.0",
      type: item.type,
      source: source,
    };
  }
  return lockfile;
}

export const addWorkflow = (
  intent: AddIntent,
): Effect.Effect<
  void,
  AppError,
  RegistryPort | PromptPort | VFSPort | ExecPort | LockfilePort | JournalPort | ConfigTag
> =>
  Effect.gen(function* () {
    const registry = yield* RegistryPort;
    const prompt = yield* PromptPort;
    const vfsPort = yield* VFSPort;
    const exec = yield* ExecPort;
    const lf = yield* LockfilePort;
    const journal = yield* JournalPort;
    const config = yield* ConfigTag;

    // ── collect_intent ────────────────────────────────────────────────────────
    // Już wykonany – intent pochodzi z addCli.ts

    // ── load_registry ─────────────────────────────────────────────────────────
    const reg = yield* registry.loadManifest(intent.source);

    // ── select_scope ──────────────────────────────────────────────────────────
    const selected = yield* prompt.selectItems(reg.items, intent);

    // ── build_plan ────────────────────────────────────────────────────────────
    const lockfileBackup = yield* lf
      .read(intent.flags.cwd)
      .pipe(Effect.catchAll(() => Effect.succeed(undefined)));
    const existingTargets = yield* resolveExistingTargets(selected, intent.flags.cwd, config);
    const plan = yield* domain.buildInstallPlan(
      selected,
      intent.flags.cwd,
      config,
      existingTargets as any,
    );

    // ── resolve_conflicts ─────────────────────────────────────────────────────
    const { writes, skipped } = yield* prompt.resolveConflicts(
      plan.conflicts,
      config.install.overwritePolicy,
    );
    yield* prompt.confirmInstall(plan);

    // ── resolve deps ──────────────────────────────────────────────────────────
    const pmName = yield* resolvePackageManagerName(intent.flags.cwd, config);
    const shouldInstallDeps =
      intent.flags.yes ||
      (plan.dependencyPlan.dependencies.length > 0 || plan.dependencyPlan.devDependencies.length > 0
        ? yield* prompt.confirmDependencyInstall(
            plan.dependencyPlan.dependencies,
            plan.dependencyPlan.devDependencies,
            pmName,
          )
        : false);

    const resolvedPlan: ResolvedPlan = {
      selectedItems: selected,
      finalWrites: [
        ...plan.plannedWrites.filter((pw) => !existingTargets.has(pw.absoluteTarget)),
        ...writes,
      ],
      dependencyPlan: plan.dependencyPlan,
      shouldInstallDeps,
    };

    // ── hydrate_files ─────────────────────────────────────────────────────────
    const rawFiles = yield* Effect.forEach(
      resolvedPlan.finalWrites,
      (write) =>
        Effect.gen(function* () {
          const item = resolvedPlan.selectedItems.find((i) => i.name === write.itemName)!;
          const content = yield* registry.loadFileContent(write.sourceFile, item);
          return {
            id: write.absoluteTarget,
            content: applyAliases(content, config),
          };
        }),
      { concurrency: "unbounded" },
    );

    // ── transform_files ───────────────────────────────────────────────────────
    const transformPlugins = resolveTransformPlugins(config);
    const vfsOutput = yield* vfsPort.transform(rawFiles as any, transformPlugins, {
      cwd: intent.flags.cwd,
      config,
    });

    // ── BARIERA: write_journal ────────────────────────────────────────────────
    // INV-06: pierwsza mutacja
    const journalEntry: JournalEntry = {
      id: crypto.randomUUID(),
      command: "add",
      status: "pending",
      currentStep: "write_journal",
      lastCompletedStep: "transform_files",
      plannedFiles: resolvedPlan.finalWrites.map((w) => w.absoluteTarget),
      lockfileBackup: lockfileBackup as any,
      lockfilePath: getLockfilePath(intent.flags.cwd),
    };
    yield* journal.write(journalEntry, intent.flags.cwd);

    // ── commit_files ──────────────────────────────────────────────────────────
    yield* vfsPort.flush(vfsOutput, intent.flags.cwd);
    yield* journal.updateStep(journalEntry.id, "commit_files", intent.flags.cwd);

    // ── commit_lockfile ───────────────────────────────────────────────────────
    const newLockfile = buildNewLockfile(lockfileBackup, resolvedPlan, vfsOutput, reg.source);
    yield* lf.write(intent.flags.cwd, newLockfile);
    yield* journal.updateStep(journalEntry.id, "commit_lockfile", intent.flags.cwd);

    // ── reconcile_deps ────────────────────────────────────────────────────────
    if (resolvedPlan.shouldInstallDeps) {
      yield* exec.installPackages(
        intent.flags.cwd,
        resolvedPlan.dependencyPlan.dependencies,
        resolvedPlan.dependencyPlan.devDependencies,
      );
    }

    // ── finalize ──────────────────────────────────────────────────────────────
    // INV-07: ostatnia operacja
    yield* journal.clear(intent.flags.cwd);
  });
