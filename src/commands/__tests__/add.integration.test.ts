import mockRegistry from "@/__tests__/fixtures/shadcn-registry.json";
import { createMockHttp, createMockPrompt } from "@/__tests__/helpers/integration";
import { runAddCommand } from "@/commands/add";
import { ok } from "@/core/result";
import { createRuntimePorts, type RuntimePorts } from "@/shell/runtime/ports";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("add integration with shadcn compatibility", () => {
  let testDir: string;
  let runtime: RuntimePorts;
  let mockHttp: ReturnType<typeof createMockHttp>;
  let mockPrompt: ReturnType<typeof createMockPrompt>;

  beforeEach(async () => {
    testDir = path.join(
      tmpdir(),
      `regpick-add-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await fs.mkdir(testDir, { recursive: true });

    // Base runtime with real FS but mocked Prompt and HTTP
    const baseRuntime = createRuntimePorts();
    mockHttp = createMockHttp();
    mockPrompt = createMockPrompt();

    runtime = {
      ...baseRuntime,
      http: mockHttp,
      prompt: mockPrompt,
    };
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
    vi.resetAllMocks();
  });

  it("should install a component from a shadcn-compatible registry", async () => {
    // 1. Setup environment
    await fs.writeFile(path.join(testDir, "package.json"), JSON.stringify({ dependencies: {} }));
    await fs.writeFile(
      path.join(testDir, "regpick.json"),
      JSON.stringify({ targetsByType: { "registry:ui": "components/ui" } }),
    );

    // 2. Setup mock network responses
    mockHttp.getJson.mockImplementation(async (url: string) => {
      if (url === "https://example.com/registry.json") {
        return ok(mockRegistry);
      }
      return ok({});
    });

    mockHttp.getText.mockImplementation(async (url: string) => {
      if (url.includes("button.tsx")) {
        return ok("export function Button() { return <button /> }");
      }
      return ok("");
    });

    // 3. Run add command
    const result = await runAddCommand({
      cwd: testDir,
      runtime,
      args: {
        flags: { yes: true },
        positionals: ["add", "https://example.com/registry.json", "button"],
      },
    });

    // 4. Assertions
    expect(result.ok).toBe(true);

    // Verify file existence in real FS
    const targetPath = path.join(testDir, "components/ui/button.tsx");
    const exists = await fs
      .access(targetPath)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);

    const content = await fs.readFile(targetPath, "utf8");
    expect(content).toContain("export function Button");

    // Verify lockfile update
    const lockfilePath = path.join(testDir, "regpick-lock.json");
    const lockfileExists = await fs
      .access(lockfilePath)
      .then(() => true)
      .catch(() => false);
    expect(lockfileExists).toBe(true);
    const lockfileContent = await fs.readFile(lockfilePath, "utf8");
    const lockfileData = JSON.parse(lockfileContent);
    expect(lockfileData.components).toMatchObject(
      expect.objectContaining({
        button: expect.any(Object),
      }),
    );

    // Verify network calls
    expect(mockHttp.getJson).toHaveBeenCalledWith("https://example.com/registry.json");
    expect(mockHttp.getText).toHaveBeenCalledWith(expect.stringContaining("button.tsx"));
  });

  it("should resolve registry dependencies (chained installation)", async () => {
    // 1. Setup environment
    await fs.writeFile(path.join(testDir, "package.json"), JSON.stringify({ dependencies: {} }));
    await fs.writeFile(
      path.join(testDir, "regpick.json"),
      JSON.stringify({ targetsByType: { "registry:ui": "components/ui" } }),
    );

    mockHttp.getJson.mockResolvedValue(ok(mockRegistry));
    mockHttp.getText.mockImplementation(async (url: string) => {
      if (url.includes("card.tsx")) return ok("CardContent");
      if (url.includes("button.tsx")) return ok("ButtonContent");
      return ok("");
    });

    // 2. Run add card
    const result = await runAddCommand({
      cwd: testDir,
      runtime,
      args: {
        flags: { yes: true },
        positionals: ["add", "https://example.com/registry.json", "card"],
      },
    });

    // 3. Assertions
    expect(result.ok).toBe(true);
    // Verify BOTH files were installed
    const cardPath = path.join(testDir, "components/ui/card.tsx");
    const buttonPath = path.join(testDir, "components/ui/button.tsx");

    expect(
      await fs
        .access(cardPath)
        .then(() => true)
        .catch(() => false),
    ).toBe(true);
    expect(
      await fs
        .access(buttonPath)
        .then(() => true)
        .catch(() => false),
    ).toBe(true);

    // Verify network calls
    expect(mockHttp.getJson).toHaveBeenCalledWith("https://example.com/registry.json");
    expect(mockHttp.getText).toHaveBeenCalledWith(expect.stringContaining("card.tsx"));
    expect(mockHttp.getText).toHaveBeenCalledWith(expect.stringContaining("button.tsx"));
  });

  it("should prompt for dependency installation and handle cancellation when yes is false", async () => {
    await fs.writeFile(path.join(testDir, "package.json"), JSON.stringify({ dependencies: {} }));
    await fs.writeFile(
      path.join(testDir, "regpick.json"),
      JSON.stringify({
        targetsByType: { "registry:ui": "components/ui" },
        packageManager: "npm",
      }),
    );

    const fakeRegistryWithDeps = {
      ...mockRegistry,
      items: [
        {
          name: "button",
          dependencies: ["clsx", "tailwind-merge"],
          files: [{ path: "ui/button.tsx", content: "export function Button() {}" }],
        },
      ],
    };

    mockHttp.getJson.mockResolvedValue(ok(fakeRegistryWithDeps));
    // simulate file found
    mockHttp.getText.mockResolvedValue(ok("fake text"));

    // allow installation confirm but deny dependency install
    mockPrompt.confirm.mockResolvedValueOnce(true); // "Install 1 item(s)?"
    mockPrompt.confirm.mockResolvedValueOnce(Symbol.for("cancel")); // "Install missing packages with npm?"

    const result = await runAddCommand({
      cwd: testDir,
      runtime,
      args: {
        flags: { yes: false },
        positionals: ["add", "https://example.com/registry.json", "button"],
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatchObject({
        kind: "UserCancelled",
        message: expect.stringContaining("Dependency installation cancelled"),
      });
    }
  });

  it("should exit when regpick config is missing", async () => {
    // missing regpick.json
    await fs.writeFile(path.join(testDir, "package.json"), JSON.stringify({ dependencies: {} }));

    const result = await runAddCommand({
      cwd: testDir,
      runtime,
      args: {
        flags: { yes: true },
        positionals: ["add", "https://example.com/registry.json", "button"],
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatchObject({
        kind: "ValidationError",
        message: "No config file found",
      });
    }
  });

  it("should handle network errors during registry fetch", async () => {
    await fs.writeFile(path.join(testDir, "package.json"), JSON.stringify({ dependencies: {} }));
    await fs.writeFile(
      path.join(testDir, "regpick.json"),
      JSON.stringify({ targetsByType: { "registry:ui": "components/ui" } }),
    );

    mockHttp.getJson.mockResolvedValueOnce({
      ok: false,
      error: {
        kind: "RuntimeError",
        message: "HTTP error! status: 500 when fetching JSON",
      },
    });

    const result = await runAddCommand({
      cwd: testDir,
      runtime,
      args: {
        flags: { yes: true },
        positionals: ["add", "https://example.com/registry.json", "button"],
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("RuntimeError");
      expect(result.error.message).toContain("HTTP error! status: 500");
    }
  });

  it("should handle file write errors correctly and abort multi-component installs", async () => {
    await fs.writeFile(path.join(testDir, "package.json"), JSON.stringify({ dependencies: {} }));
    await fs.writeFile(
      path.join(testDir, "regpick.json"),
      JSON.stringify({ targetsByType: { "registry:ui": "components/ui" } }),
    );

    mockHttp.getJson.mockResolvedValue(ok(mockRegistry));
    mockHttp.getText.mockImplementation(async (url: string) => {
      if (url.includes("card.tsx")) return ok("CardContent");
      if (url.includes("button.tsx")) return ok("ButtonContent");
      return ok("");
    });

    // Make the UI directory read-only to crash the install
    const uiDir = path.join(testDir, "components", "ui");
    await fs.mkdir(uiDir, { recursive: true });
    await fs.chmod(uiDir, 0o500);

    const result = await runAddCommand({
      cwd: testDir,
      runtime,
      args: {
        flags: { yes: true },
        positionals: ["add", "https://example.com/registry.json", "card"],
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("RuntimeError");
    }

    // Restore permissions so cleanup works
    await fs.chmod(uiDir, 0o755);
  });

  it("should abort if registry manifest is corrupted or has unsupported structure", async () => {
    await fs.writeFile(path.join(testDir, "package.json"), JSON.stringify({ dependencies: {} }));
    await fs.writeFile(
      path.join(testDir, "regpick.json"),
      JSON.stringify({ targetsByType: { "registry:ui": "components/ui" } }),
    );

    // Send malformed data that isn't an array of items or proper registry object
    mockHttp.getJson.mockResolvedValue(ok({ unexpectedField: "invalid dataset" }));

    const result = await runAddCommand({
      cwd: testDir,
      runtime,
      args: {
        flags: { yes: true },
        positionals: ["add", "https://example.com/registry.json", "button"],
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("RegistryError");
      expect(result.error.message).toContain("Unsupported manifest structure");
    }
  });
});
