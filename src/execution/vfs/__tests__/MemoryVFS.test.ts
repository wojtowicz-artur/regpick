import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { MemoryVFS } from "../MemoryVFS.js";

describe("MemoryVFS (Windows Path normalization)", () => {
  it("should normalize Windows paths to forward-slashes when writing and reading", async () => {
    const vfs = new MemoryVFS();
    const windowsPath = "src\\components\\button.tsx";

    // Write using windows path
    await Effect.runPromise(
      vfs.writeFile({
        path: windowsPath,
        content: "export const Button = () => <button />;",
      }),
    );

    // Read using normalized forward path
    const file1 = await Effect.runPromise(vfs.readFile("src/components/button.tsx"));
    expect(file1.content).toBe("export const Button = () => <button />;");

    // Read using windows path again internally gets mapped properly
    const file2 = await Effect.runPromise(vfs.readFile(windowsPath));
    expect(file2.content).toBe("export const Button = () => <button />;");

    // Exists checks
    const exists1 = await Effect.runPromise(vfs.exists("src/components/button.tsx"));
    expect(exists1).toBe(true);
  });
});
