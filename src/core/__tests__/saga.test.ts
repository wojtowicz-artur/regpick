import { describe, expect, it, vi } from "vitest";

import { appError, type AppError } from "@/core/errors.js";
import { err, isErr, ok, type Result } from "@/core/result.js";
import { runSaga } from "@/core/saga.js";

function createMockStep(
  name: string,
  executeResult: Result<any, AppError> = ok(undefined),
  compensateResult: Result<void, AppError> = ok(undefined),
) {
  return {
    name,
    execute: vi.fn(async () => executeResult),
    compensate: vi.fn(async () => compensateResult),
  };
}

describe("Saga Runner", () => {
  it("should execute all steps successfully in order", async () => {
    const step1 = createMockStep("Step 1");
    const step2 = createMockStep("Step 2");
    const step3 = createMockStep("Step 3");

    const onProgress = vi.fn();
    const result = await runSaga([step1, step2, step3], onProgress);

    expect(isErr(result)).toBe(false);
    expect(step1.execute).toHaveBeenCalledOnce();
    expect(step2.execute).toHaveBeenCalledOnce();
    expect(step3.execute).toHaveBeenCalledOnce();

    expect(step1.compensate).not.toHaveBeenCalled();
    expect(step2.compensate).not.toHaveBeenCalled();
    expect(step3.compensate).not.toHaveBeenCalled();

    // Verify progress calls
    expect(onProgress).toHaveBeenCalledWith("Step 1", "executing");
    expect(onProgress).toHaveBeenCalledWith("Step 1", "completed");
    expect(onProgress).toHaveBeenCalledWith("Step 3", "completed");
  });

  it("should halt execution on first error and rollback previously completed steps in reverse order", async () => {
    const step1 = createMockStep("Step 1");
    const step2 = createMockStep("Step 2", err(appError("RuntimeError", "Fail!")));
    const step3 = createMockStep("Step 3");

    const onProgress = vi.fn();
    const result = await runSaga([step1, step2, step3], onProgress);

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.message).toContain('Transaction failed at step "Step 2"');
      expect(result.error.message).toContain("Successfully rolled back 1 previous steps");
    }

    // Step 1 should succeed
    expect(step1.execute).toHaveBeenCalledOnce();
    // Step 2 should fail
    expect(step2.execute).toHaveBeenCalledOnce();
    // Step 3 should not be executed
    expect(step3.execute).not.toHaveBeenCalled();

    // Only Step 1 should be compensated (as Step 2 failed and wasn't completed)
    expect(step1.compensate).toHaveBeenCalledOnce();
    expect(step2.compensate).not.toHaveBeenCalled();
    expect(step3.compensate).not.toHaveBeenCalled();

    // Check progress callbacks
    expect(onProgress).toHaveBeenCalledWith("Step 2", "executing");
    expect(onProgress).toHaveBeenCalledWith("Step 2", "failed");
    expect(onProgress).toHaveBeenCalledWith("Step 1", "compensating");
  });

  it("should continue compensating remaining steps even if a compensation fails", async () => {
    // Suppress console.error solely for this test to avoid noise
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const step1 = createMockStep("Step 1");
    const step2 = createMockStep("Step 2");
    // Step 2 compensation fails!
    step2.compensate.mockResolvedValueOnce(err(appError("RuntimeError", "Compensate fail!")));

    const step3 = createMockStep("Step 3", err(appError("RuntimeError", "Fail execution 3!")));

    const result = await runSaga([step1, step2, step3]);

    expect(isErr(result)).toBe(true);

    expect(step1.execute).toHaveBeenCalledOnce();
    expect(step2.execute).toHaveBeenCalledOnce();
    expect(step3.execute).toHaveBeenCalledOnce();

    expect(step2.compensate).toHaveBeenCalledOnce(); // called first (LIFO)
    expect(step1.compensate).toHaveBeenCalledOnce(); // called second despite step 2 error

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Saga] FATAL: Failed to compensate step "Step 2":'),
      "Compensate fail!",
    );

    consoleErrorSpy.mockRestore();
  });
});
