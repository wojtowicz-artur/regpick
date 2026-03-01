import { describe, expect, it } from "vitest";

import { appError, toAppError } from "@/core/errors.js";
import { err, isErr, isOk, ok } from "@/core/result.js";

describe("result and error model", () => {
  it("creates ok/err results", () => {
    const success = ok(42);
    const failure = err(appError("ValidationError", "invalid"));
    expect(isOk(success)).toBe(true);
    expect(isErr(failure)).toBe(true);
  });

  it("normalizes unknown to AppError", () => {
    const converted = toAppError(new Error("boom"), "RuntimeError");
    expect(converted.kind).toBe("RuntimeError");
    expect(converted.message).toBe("boom");
  });
});
