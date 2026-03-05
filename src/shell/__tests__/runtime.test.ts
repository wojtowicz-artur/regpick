import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { FileSystemPort } from "@/core/ports.js";
import { createFileSystemLive } from "@/shell/adapters/runtime.js";

describe("createFileSystemLive", () => {
  it("should handle reading and writing text files with encoding", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "regpick-fs-test-"));
    const tmpFile = path.join(tmpDir, "test.txt");

    try {
      const program = Effect.gen(function* () {
        const fsPort = yield* FileSystemPort;
        yield* fsPort.writeFile(tmpFile, "hello text", "utf8");
        const content = yield* fsPort.readFile(tmpFile, "utf8");
        return content;
      }).pipe(Effect.provide(createFileSystemLive()));

      const result = await Effect.runPromise(program);
      expect(result).toBe("hello text");
      expect(typeof result).toBe("string");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("should handle reading and writing binary files without encoding", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "regpick-fs-test-bin-"));
    const tmpFile = path.join(tmpDir, "test.bin");

    try {
      const binaryData = new Uint8Array([0x00, 0xff, 0x42, 0x88]);

      const program = Effect.gen(function* () {
        const fsPort = yield* FileSystemPort;

        yield* fsPort.writeFile(tmpFile, binaryData);

        const content = yield* fsPort.readFile(tmpFile);
        return content;
      }).pipe(Effect.provide(createFileSystemLive()));

      const result = await Effect.runPromise(program);

      expect(Buffer.isBuffer(result) || result instanceof Uint8Array).toBe(true);
      expect(result).toHaveLength(4);
      expect(result[0]).toBe(0x00);
      expect(result[1]).toBe(0xff);
      expect(result[2]).toBe(0x42);
      expect(result[3]).toBe(0x88);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
