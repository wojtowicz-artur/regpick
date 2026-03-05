import type { RuntimePorts } from "@/core/ports.js";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { computeHash, readLockfile } from "../services/lockfile.js";

describe("lockfile read/write mechanisms", () => {
  it("returns default lockfile when decoding fails for any reason (dropped V1)", async () => {
    const invalidLockfileData = {
      lockfileVersion: 1, // V1 schema should be fully rejected
      components: {
        button: {
          // missing installedAt, path/hash schema changed drastically
          files: [],
        },
      },
    };

    const runMock = {
      fs: {
        pathExists: () => Effect.succeed(true),
        readJsonSync: () => Effect.succeed(invalidLockfileData),
      } as any,
    } as RuntimePorts;

    const program = readLockfile("/dummy", runMock);
    const result = await Effect.runPromise(program);

    expect(result.lockfileVersion).toBe(2);
    expect(result.components).toEqual({});
  });

  it("decodes valid V2 lockfile correctly", async () => {
    const validData = {
      lockfileVersion: 2,
      components: {
        button: {
          installedAt: "2024-03-01T00:00:00Z",
          version: "1.0.0",
          files: [{ path: "button.tsx", hash: "abc123hash" }],
        },
      },
    };

    const runMock = {
      fs: {
        pathExists: () => Effect.succeed(true),
        readJsonSync: () => Effect.succeed(validData),
      } as any,
    } as RuntimePorts;

    const program = readLockfile("/dummy", runMock);
    const result = await Effect.runPromise(program);

    expect(result.lockfileVersion).toBe(2);
    expect(result.components["button"].installedAt).toBe("2024-03-01T00:00:00Z");
    expect(result.components["button"].files[0].hash).toBe("abc123hash");
  });
});

describe("lockfile hashing mechanisms (CAS)", () => {
  describe("computeHash", () => {
    it("computes a standard SHA-256 hash for a simple string", () => {
      const input = "test-content";
      const hash1 = computeHash(input);
      const hash2 = computeHash(input);
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // hex representation of sha256 is 64 chars
    });
  });
});
