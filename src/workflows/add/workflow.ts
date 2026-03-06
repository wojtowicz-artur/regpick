import { ConfigTag } from "@/core/context.js";
import { type AppError } from "@/core/errors.js";
import * as domain from "@/domain/addPlan.js";
import { applyAliases } from "@/domain/aliasCore.js";
import { selectItemsFromFlags } from "@/domain/selection.js";
import type { AddIntent } from "@/domain/models/intent.js";
import type { ResolvedPlan } from "@/domain/models/plan.js";
import type { JournalEntry, RegpickLockfile } from "@/domain/models/state.js";
import { resolveOutputPathFromPolicy } from "@/domain/pathPolicy.js";
import { ExecPort } from "@/execution/exec/port.js";
import { JournalPort } from "@/execution/journal/port.js";
import { LockfilePort } from "@/execution/lockfile/port.js";
import { VFSPort } from "@/execution/vfs/port.js";
import { FileSystemPort } from "@/interfaces/fs/port.js";
import { PromptPort } from "@/interfaces/prompt/port.js";
import { RegistryPort } from "@/registry/port.js";
import type { TransformPlugin } from "@/sdk/TransformPlugin.js";
import { resolvePackageManager } from "@/shell/packageManagers/resolver.js";
import { Effect } from "effect";
import crypto from "node:crypto";
import * as path from "node:path";

function resolveExistingTargets(selected: any[], cwd: string, config: any) {
  return Effect.gen(function* () {
    const fs = yield* FileSystemPort;
    const existing = new Set<string>();
    for (const item of selected) {
      for (const file of item.files) {
        const { absoluteTarget } = yield* resolveOutputPathFromPolicy(item, file, cwd, config);
        const exists = yield* fs.pathExists(absoluteTarget);
        if (exists) {
          existing.add(absoluteTarget);
        }
      }
    }
    return existing;
  });
}

function resolvePackageManagerName(cwd: string, config: any) {
  return Effect.gen(function* () {
    const fs = yield* FileSystemPort;
    return yield* resolvePackageManager(
      cwd,
      config.install?.packageManager,
      { fs: { existsSync: fs.existsSync } },
      config,
    );
  });
}

function resolveTransformPlugins(config: any) {
  return (config.plugins || []).filter((p: any) => p.type === "transform") as TransformPlugin[];
}

function getLockfilePath(cwd: string) {
  return path.join(cwd, "regpick.lock.json");
}

function buildNewLockfile(
  backup: RegpickLockfile | undefined,
  plan: any,
  vfsOut: any,
  source: string,
): RegpickLockfile {
  const lockfile: RegpickLockfile = backup || { lockfileVersion: 2, components: {} };
  const newComponents = { ...lockfile.components };

  for (const item of plan.selectedItems) {
    const writes = plan.finalWrites.filter((w: any) => w.itemName === item.name);
    const files = writes.map((w: any) => {
      const vfsFile = vfsOut.mutations.find((m: any) => m.id === w.absoluteTarget);
      const hash = vfsFile
        ? crypto.createHash("sha256").update(vfsFile.content).digest("hex")
        : undefined;
      return {
        path: w.relativeTarget,
        hash,
      };
    });

    newComponents[item.name] = {
      version: item.version || "0.0.0",
      installedAt: new Date().toISOString(),
      source: source,
      dependencies: item.dependencies,
      files,
    };
  }

  return {
    lockfileVersion: 2,
    components: newComponents,
  };
}

export const addWorkflow = (
  intent: AddIntent,
): Effect.Effect<
  void,
  AppError,
  | RegistryPort
  | PromptPort
  | VFSPort
  | ExecPort
  | LockfilePort
  | JournalPort
  | ConfigTag
  | FileSystemPort
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
    const preSelected = yield* selectItemsFromFlags(reg.items, intent);
    const selected = preSelected ? preSelected : yield* prompt.selectItems(reg.items, intent);

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
    const conflictPolicy = intent.flags.overwrite
      ? "overwrite"
      : intent.flags.yes
        ? "overwrite"
        : config.install.overwritePolicy;

    const { writes } = yield* prompt.resolveConflicts(plan.conflicts, conflictPolicy);

    if (!intent.flags.yes) {
      yield* prompt.confirmInstall(plan);
    }

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
