import { JournalEntry } from "@/domain/models/index.js";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import { determineRecoveryAction, executeRecovery, RecoveryPorts } from "../recovery.js";

describe("Recovery Executor", () => {
  const createMockEntry = (overrides: Partial<JournalEntry>): JournalEntry => ({
    id: "test-recovery-1",
    command: "add",
    status: "pending",
    currentStep: "write_journal",
    lastCompletedStep: "write_journal",
    plannedFiles: ["/test/file1.ts", "/test/file2.ts"],
    lockfilePath: "/test/regpick.lock.json",
    lockfileBackup: { lockfileVersion: 2, components: {} },
    ...overrides,
  });

  describe("determineRecoveryAction", () => {
    it("1. should return cleanup_journal if status is not pending", () => {
      const entry = createMockEntry({ status: "completed" as any });
      expect(determineRecoveryAction(entry)).toBe("cleanup_journal");
    });

    it("2. should return rollback_files if crashed at write_journal", () => {
      const entry = createMockEntry({ lastCompletedStep: "write_journal" });
      expect(determineRecoveryAction(entry)).toBe("rollback_files");
    });

    it("3. should return rollback_full if crashed at commit_files", () => {
      const entry = createMockEntry({ lastCompletedStep: "commit_files" });
      expect(determineRecoveryAction(entry)).toBe("rollback_full");
    });

    it("4. should return none for safe steps", () => {
      const entry = createMockEntry({
        lastCompletedStep: "collect_intent" as any,
      });
      expect(determineRecoveryAction(entry)).toBe("none");
    });
  });

  describe("executeRecovery", () => {
    it("should rollback files and keep lockfile if action is rollback_files", async () => {
      const ports: RecoveryPorts = {
        removeFile: vi.fn(() => Effect.succeed(undefined)),
        restoreLockfile: vi.fn(() => Effect.succeed(undefined)),
        deleteJournalEntry: vi.fn(() => Effect.succeed(undefined)),
      };

      const entry = createMockEntry({ lastCompletedStep: "write_journal" });

      await Effect.runPromise(executeRecovery(entry, ports));

      expect(ports.removeFile).toHaveBeenCalledWith("/test/file1.ts");
      expect(ports.removeFile).toHaveBeenCalledWith("/test/file2.ts");
      expect(ports.restoreLockfile).not.toHaveBeenCalled();
      expect(ports.deleteJournalEntry).toHaveBeenCalledWith("test-recovery-1");
    });

    it("should rollback files and restore lockfile if action is rollback_full", async () => {
      const ports: RecoveryPorts = {
        removeFile: vi.fn(() => Effect.succeed(undefined)),
        restoreLockfile: vi.fn(() => Effect.succeed(undefined)),
        deleteJournalEntry: vi.fn(() => Effect.succeed(undefined)),
      };

      const entry = createMockEntry({ lastCompletedStep: "commit_files" });

      await Effect.runPromise(executeRecovery(entry, ports));

      expect(ports.removeFile).toHaveBeenCalledWith("/test/file1.ts");
      expect(ports.restoreLockfile).toHaveBeenCalledWith(
        "/test/regpick.lock.json",
        entry.lockfileBackup,
      );
      expect(ports.deleteJournalEntry).toHaveBeenCalledWith("test-recovery-1");
    });
  });
});
