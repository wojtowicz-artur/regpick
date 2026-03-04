import { describe, expect, it } from "vitest";
import { computeHash, computeTreeHash } from "../services/lockfile.js";

describe("lockfile hasashing mechanisms (CAS)", () => {
  describe("computeHash", () => {
    it("computes a standard SHA-256 hash for a simple string", () => {
      const input = "test-content";
      const hash1 = computeHash(input);
      const hash2 = computeHash(input);
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // hex representation of sha256 is 64 chars
    });
  });

  describe("computeTreeHash", () => {
    it("generates deterministic hashes regardless of input array order", () => {
      const filesA = [
        { path: "b.txt", content: "b-content" },
        { path: "a.txt", content: "a-content" },
        { path: "c.txt", content: "c-content" },
      ];

      const filesB = [
        { path: "c.txt", content: "c-content" },
        { path: "b.txt", content: "b-content" },
        { path: "a.txt", content: "a-content" },
      ];

      const hashA = computeTreeHash(filesA);
      const hashB = computeTreeHash(filesB);

      expect(hashA).toBe(hashB);
    });

    it("produces different hashes when paths are changed", () => {
      const hash1 = computeTreeHash([{ path: "a.txt", content: "content" }]);
      const hash2 = computeTreeHash([{ path: "b.txt", content: "content" }]);
      expect(hash1).not.toBe(hash2);
    });

    it("produces different hashes when contents are changed", () => {
      const hash1 = computeTreeHash([{ path: "a.txt", content: "content-a" }]);
      const hash2 = computeTreeHash([{ path: "a.txt", content: "content-b" }]);
      expect(hash1).not.toBe(hash2);
    });

    it("safely handles an empty array correctly", () => {
      const hash = computeTreeHash([]);
      expect(hash).toHaveLength(64);
      // It should match the sha256 of an empty string
      const emptySha256 = computeHash("");
      expect(hash).toBe(emptySha256);
    });

    it("handles complex pathings accurately", () => {
      const files1 = [
        { path: "src/utils/cn.ts", content: "export const cn = () => {}" },
        {
          path: "src/components/button.tsx",
          content: "export const Button = () => <button />",
        },
      ];
      const hash = computeTreeHash(files1);
      expect(hash).toHaveLength(64);
    });
  });
});
