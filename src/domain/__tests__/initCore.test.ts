import { describe, expect, it } from "vitest";

import {
  decideInitAfterFirstWrite,
  decideInitAfterOverwritePrompt,
} from "@/domain/initCore.js";

describe("init core", () => {
  it("returns created when first write succeeds", () => {
    expect(decideInitAfterFirstWrite(true)).toBe("created");
  });

  it("asks for overwrite when first write does not happen", () => {
    expect(decideInitAfterFirstWrite(false)).toBe("ask-overwrite");
  });

  it("returns cancelled when prompt is cancelled", () => {
    expect(decideInitAfterOverwritePrompt(true, false)).toBe("cancelled");
  });

  it("returns overwrite when user confirms overwrite", () => {
    expect(decideInitAfterOverwritePrompt(false, true)).toBe("overwrite");
  });

  it("returns keep when user rejects overwrite", () => {
    expect(decideInitAfterOverwritePrompt(false, false)).toBe("keep");
  });
});
