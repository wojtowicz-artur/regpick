import { describe, expect, it } from "vitest";

import type { RegistryItem } from "../../types.js";
import {
  resolveListSourceDecision,
  resolveRegistrySourceFromAliases,
} from "../listCore.js";

describe("list core", () => {
  it("resolves alias to configured source", () => {
    expect(resolveRegistrySourceFromAliases("tebra", { tebra: "./registry" })).toBe("./registry");
  });

  it("uses provided input first", () => {
    const decision = resolveListSourceDecision("tebra", { tebra: "./registry" });
    expect(decision).toEqual({ source: "./registry", requiresPrompt: false });
  });

  it("uses first alias when input is missing", () => {
    const decision = resolveListSourceDecision(undefined, { alpha: "./a", beta: "./b" });
    expect(decision).toEqual({ source: "./a", requiresPrompt: false });
  });

  it("requires prompt when no input and no aliases", () => {
    const decision = resolveListSourceDecision(undefined, {});
    expect(decision).toEqual({ source: null, requiresPrompt: true });
  });

});
