import { PipelineRenderer } from "@/core/pipeline.js";
import { MemoryVFS } from "@/core/vfs.js";
import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import { shadcnPlugin } from "../shadcnPlugin.js";

describe("shadcnPlugin", () => {
  it("should add 'use client' automatically to React files using states", async () => {
    const plugin = shadcnPlugin();
    const vfs = new MemoryVFS();
    const pipeline = new PipelineRenderer([plugin]);

    const files = [
      {
        id: "/components/ui/button.tsx",
        code: "import { useState } from 'react';\n\nexport const Button = () => { const [a] = useState(); return <button/> }",
      },
      {
        id: "/lib/utils.ts",
        code: "export function cn(...inputs) { return twMerge(clsx(inputs)); }",
      },
    ];

    await Effect.runPromise(pipeline.run({ vfs, cwd: "/", runtime: {} as any }, files));

    const btnOutput = await vfs.readFile("/components/ui/button.tsx");
    expect(btnOutput).toContain('"use client";');
    expect(btnOutput).toContain("useState");

    const utilsOutput = await vfs.readFile("/lib/utils.ts");
    expect(utilsOutput).not.toContain('"use client";');
  });
});
