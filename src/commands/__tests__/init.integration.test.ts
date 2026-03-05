import { CommandContextTag } from "@/core/context.js";
import { Runtime } from "@/core/ports.js";
import { Layer } from "effect";

import { createMockPrompt } from "@/__tests__/helpers/integration.js";
import { runInitCommand } from "@/commands/init.js";
import { type RuntimePorts } from "@/core/ports.js";
import { createRuntimePorts } from "@/shell/adapters/runtime.js";
import { Effect, Either } from "effect";
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
    const result = await Effect.runPromise(
      Effect.either(
        Effect.provide(
          runInitCommand(),
          Layer.merge(
            Layer.succeed(CommandContextTag, {
              cwd: testDir,
              args: { flags: { yes: true }, positionals: [] },
            }),
            Layer.succeed(Runtime, runtime),
          ),
        ),
      ),
    );

    // 3. Assertions
    expect(Either.isRight(result)).toBe(true);

    // Check if config file was created
    const configPath = path.join(testDir, "regpick.config.mjs");
    const exists = await fs
      .access(configPath)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);

    const configContent = await fs.readFile(configPath, "utf8");
    expect(configContent).toContain('import { defineConfig } from "regpick";');
    expect(configContent).toContain("export default defineConfig(");
    expect(configContent).toContain('packageManager: "auto"');
    expect(configContent).toContain('overwritePolicy: "prompt"');
    expect(configContent).toContain("allowOutsideProject: false");
  });

  it("should work even if package.json is missing", async () => {
    const result = await Effect.runPromise(
      Effect.either(
        Effect.provide(
          runInitCommand(),
          Layer.merge(
            Layer.succeed(CommandContextTag, {
              cwd: testDir,
              args: { flags: { yes: true }, positionals: [] },
            }),
            Layer.succeed(Runtime, runtime),
          ),
        ),
      ),
    );

    expect(Either.isRight(result)).toBe(true);
    const configPath = path.join(testDir, "regpick.config.mjs");
    const exists = await fs
      .access(configPath)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);
  });

  it("should fail gracefully if user cancels the prompt", async () => {
    // Simulate cancelling the package manager prompt
    mockPrompt.isCancel.mockImplementation((v: unknown) =>
      Effect.succeed(v === Symbol.for("cancel") || v === "cancelled"),
    );
    mockPrompt.select.mockReturnValueOnce(Effect.succeed("cancelled"));

    const result = await Effect.runPromise(
      Effect.either(
        Effect.provide(
          runInitCommand(),
          Layer.merge(
            Layer.succeed(CommandContextTag, {
              cwd: testDir,
              args: { flags: { yes: false }, positionals: [] },
            }),
            Layer.succeed(Runtime, runtime),
          ),
        ),
      ),
    );

    expect(Either.isRight(result)).toBe(false);
    if (Either.isLeft(result)) {
      expect(result.left).toMatchObject({ _tag: "UserCancelled" });
    }

    // Check that config file was NOT created
    const configPath = path.join(testDir, "regpick.config.mjs");
    const exists = await fs
      .access(configPath)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(false);
  });

  it("should complete initialization by following prompts when yes is false", async () => {
    const packageJsonContent = JSON.stringify({ name: "test-project", dependencies: {} }, null, 2);
    await fs.writeFile(path.join(testDir, "package.json"), packageJsonContent);

    mockPrompt.select.mockReturnValueOnce(Effect.succeed("npm"));
    mockPrompt.text.mockReturnValueOnce(Effect.succeed("src/custom-ui"));
    mockPrompt.select.mockReturnValueOnce(Effect.succeed("prompt"));

    const result = await Effect.runPromise(
      Effect.either(
        Effect.provide(
          runInitCommand(),
          Layer.merge(
            Layer.succeed(CommandContextTag, {
              cwd: testDir,
              args: { flags: { yes: false }, positionals: [] },
            }),
            Layer.succeed(Runtime, runtime),
          ),
        ),
      ),
    );

    expect(Either.isRight(result)).toBe(true);

    const configPath = path.join(testDir, "regpick.config.mjs");
    const configContent = await fs.readFile(configPath, "utf8");
    expect(configContent).toContain('import { defineConfig } from "regpick";');
    expect(configContent).toContain("export default defineConfig(");
    expect(configContent).toContain('packageManager: "npm"');
    expect(configContent).toContain('overwritePolicy: "prompt"');
    expect(configContent).toContain('"registry:component": "src/custom-ui"');
  });

  it("should fail with a FileSystemError when lacking filesystem permissions", async () => {
    // Restrict write permissions on the directory
    await fs.chmod(testDir, 0o500);

    const result = await Effect.runPromise(
      Effect.either(
        Effect.provide(
          runInitCommand(),
          Layer.merge(
            Layer.succeed(CommandContextTag, {
              cwd: testDir,
              args: { flags: { yes: true }, positionals: [] },
            }),
            Layer.succeed(Runtime, runtime),
          ),
        ),
      ),
    );

    expect(Either.isRight(result)).toBe(false);
    if (Either.isLeft(result)) {
      expect(result.left).toMatchObject({ _tag: "FileSystemError" });
      expect(result.left.message).toContain("Failed to write file");
    }

    expect(mockPrompt.error).toHaveBeenCalledWith(
      expect.stringContaining("Failed to write config file"),
    );

    // Restore permissions so cleanup can delete the dir
    await fs.chmod(testDir, 0o755);
  });
});
