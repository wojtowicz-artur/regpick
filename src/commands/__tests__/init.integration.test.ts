import { createMockPrompt } from "@/__tests__/helpers/integration.ts";
import { runInitCommand } from "@/commands/init.ts";
import { createRuntimePorts, type RuntimePorts } from "@/shell/runtime/ports.ts";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("init integration", () => {
  let testDir: string;
  let runtime: RuntimePorts;
  let mockPrompt: ReturnType<typeof createMockPrompt>;

  beforeEach(async () => {
    testDir = path.join(
      tmpdir(),
      `regpick-init-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await fs.mkdir(testDir, { recursive: true });

    // Use real FS but mock prompt to avoid hanging in tests
    const baseRuntime = createRuntimePorts();
    mockPrompt = createMockPrompt();
    runtime = {
      ...baseRuntime,
      prompt: mockPrompt,
    };
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
    vi.resetAllMocks();
  });

  it("should create regpick.json in a new project", async () => {
    // 1. Setup environment with a package.json
    const packageJsonContent = JSON.stringify({ name: "test-project", dependencies: {} }, null, 2);
    await fs.writeFile(path.join(testDir, "package.json"), packageJsonContent);

    // 2. Run the command
    const result = await runInitCommand({
      cwd: testDir,
      runtime,
      args: { flags: { yes: true }, positionals: [] },
    });

    // 3. Assertions
    expect(result.ok).toBe(true);

    // Check if config file was created
    const configPath = path.join(testDir, "regpick.json");
    const exists = await fs
      .access(configPath)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);

    const configContent = await fs.readFile(configPath, "utf8");
    const configData = JSON.parse(configContent);
    expect(configData).toMatchObject({
      packageManager: "auto",
    });
  });

  it("should work even if package.json is missing", async () => {
    const result = await runInitCommand({
      cwd: testDir,
      runtime,
      args: { flags: { yes: true }, positionals: [] },
    });

    expect(result.ok).toBe(true);
    const configPath = path.join(testDir, "regpick.json");
    const exists = await fs
      .access(configPath)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);
  });

  it("should fail gracefully if user cancels the prompt", async () => {
    // Simulate cancelling the package manager prompt
    mockPrompt.isCancel.mockImplementation(
      async (v: unknown) => v === Symbol.for("cancel") || v === "cancelled",
    );
    mockPrompt.select.mockResolvedValueOnce("cancelled");

    const result = await runInitCommand({
      cwd: testDir,
      runtime,
      args: { flags: { yes: false }, positionals: [] },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatchObject({ kind: "UserCancelled" });
    }

    // Check that config file was NOT created
    const configPath = path.join(testDir, "regpick.json");
    const exists = await fs
      .access(configPath)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(false);
  });

  it("should complete initialization by following prompts when yes is false", async () => {
    const packageJsonContent = JSON.stringify({ name: "test-project", dependencies: {} }, null, 2);
    await fs.writeFile(path.join(testDir, "package.json"), packageJsonContent);

    mockPrompt.select.mockResolvedValueOnce("npm");
    mockPrompt.text.mockResolvedValueOnce("src/custom-ui");
    mockPrompt.select.mockResolvedValueOnce("prompt");

    const result = await runInitCommand({
      cwd: testDir,
      runtime,
      args: { flags: { yes: false }, positionals: [] },
    });

    expect(result.ok).toBe(true);

    const configPath = path.join(testDir, "regpick.json");
    const configContent = await fs.readFile(configPath, "utf8");
    const configData = JSON.parse(configContent);
    expect(configData).toMatchObject({
      packageManager: "npm",
      overwritePolicy: "prompt",
      targetsByType: expect.objectContaining({
        "registry:component": "src/custom-ui",
      }),
    });
  });

  it("should fail with a RuntimeError when lacking filesystem permissions", async () => {
    // Restrict write permissions on the directory
    await fs.chmod(testDir, 0o500);

    const result = await runInitCommand({
      cwd: testDir,
      runtime,
      args: { flags: { yes: true }, positionals: [] },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatchObject({ kind: "RuntimeError" });
      expect(result.error.message).toContain("Failed to write config file");
    }

    expect(mockPrompt.error).toHaveBeenCalledWith(
      expect.stringContaining("Failed to write config file"),
    );

    // Restore permissions so cleanup can delete the dir
    await fs.chmod(testDir, 0o755);
  });
});
