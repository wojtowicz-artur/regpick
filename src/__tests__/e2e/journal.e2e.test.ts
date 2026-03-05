import type { JournalEntry } from "@/types.js";
import { execa } from "execa";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("regpick e2e (journal rollback)", () => {
  const entryPath = path.resolve("dist/index.mjs");

  it("should detect incomplete operations on boot and rollback planned files", async () => {
    const testDir = path.join(tmpdir(), `regpick-journal-e2e-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });

    try {
      // 1. Initialize a basic environment
      await fs.writeFile(
        path.join(testDir, "package.json"),
        JSON.stringify({ name: "e2e-journal-test", version: "1.0.0" }),
      );
      await execa("node", [entryPath, "init", "--yes"], { cwd: testDir });

      // 2. Simulate a crash during an "add" command
      // We pretend a file was copied, but the command crashed before clearing the journal.
      const mockComponentPath = path.join(testDir, "mock-component.ts");
      await fs.writeFile(mockComponentPath, "export const Button = () => {};");

      const journalDir = path.join(testDir, "node_modules", ".cache", "regpick");
      await fs.mkdir(journalDir, { recursive: true });

      const mockEntry: JournalEntry = {
        id: "mock-crash-uuid",
        command: "add",
        status: "pending",
        plannedFiles: [mockComponentPath],
        lockfileBackup: { lockfileVersion: 2, components: {} }, // Simulate lockfile rollback
      };

      await fs.writeFile(path.join(journalDir, "journal.json"), JSON.stringify(mockEntry, null, 2));

      // Verify the simulated state
      expect(await fs.stat(mockComponentPath).catch(() => null)).not.toBeNull();

      // 3. Run ANY command to trigger the global app boot process (e.g., list)
      const listResult = await execa("node", [entryPath, "list"], {
        cwd: testDir,
        reject: false,
      });

      // 4. Assertions
      console.log(listResult.stderr, listResult.stdout);
      expect(listResult.stdout + listResult.stderr).toContain(
        "Previous incomplete operation detected and rolled back",
      );

      // The rollback should have DELETED the planned un-committed files
      const componentFilesExists = await fs
        .stat(mockComponentPath)
        .then(() => true)
        .catch(() => false);
      expect(componentFilesExists).toBe(false);

      // The journal file itself should be cleaned up
      const journalCleared = await fs
        .stat(path.join(journalDir, "journal.json"))
        .then(() => true)
        .catch(() => false);
      expect(journalCleared).toBe(false);
    } finally {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  }, 30000);
});
