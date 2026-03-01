import { type AppError, appError } from "./errors.js";
import { type Result, err, isErr, ok } from "./result.js";

/**
 * Represents a single atomic operation in a saga transaction.
 */
export interface TransactionStep<T = void> {
  name: string;
  /**
   * Executes the step.
   * Return ok() if successful, or err() if it fails.
   */
  execute(): Promise<Result<T, AppError>>;
  /**
   * Compensates (rolls back) the step.
   * This is only called if execute() previously returned ok()
   * but a subsequent step in the saga failed.
   */
  compensate(): Promise<Result<void, AppError>>;
}

/**
 * Runs a saga (a sequence of transaction steps).
 * If any step fails, it halts execution and runs the compensate() methods
 * of all successfully executed steps in reverse order.
 *
 * @param steps The steps to execute
 * @param onProgress Optional callback for logging progress
 */
export async function runSaga(
  steps: TransactionStep<any>[],
  onProgress?: (
    stepName: string,
    status: "executing" | "completed" | "compensating" | "failed" | "interrupted",
  ) => void,
): Promise<Result<void, AppError>> {
  const completedSteps: TransactionStep<any>[] = [];
  let isCompensating = false;

  return new Promise<Result<void, AppError>>(async (resolve) => {
    const handleSigint = async () => {
      if (isCompensating) {
        return;
      }
      isCompensating = true;
      onProgress?.("Interrupted by user (SIGINT). Gracefully rolling back...", "interrupted");
      await compensate(completedSteps, onProgress);
      process.exit(130);
    };

    if (process.env.NODE_ENV !== "test") {
      process.on("SIGINT", handleSigint);
    }

    for (const step of steps) {
      if (isCompensating) break;

      onProgress?.(step.name, "executing");
      const result = await step.execute();

      if (isCompensating) {
        break;
      }

      if (isErr(result)) {
        isCompensating = true;
        onProgress?.(step.name, "failed");
        await compensate(completedSteps, onProgress);

        if (process.env.NODE_ENV !== "test") {
          process.off("SIGINT", handleSigint);
        }

        return resolve(
          err(
            appError(
              result.error.kind,
              `Transaction failed at step "${step.name}". Successfully rolled back ${completedSteps.length} previous steps.\nOriginal error: ${result.error.message}`,
              result.error,
            ),
          ),
        );
      }

      onProgress?.(step.name, "completed");
      completedSteps.push(step);
    }

    if (process.env.NODE_ENV !== "test") {
      process.off("SIGINT", handleSigint);
    }

    if (isCompensating) {
      // Process will exit from handleSigint
      return;
    }

    resolve(ok(undefined));
  });
}

/**
 * Internal helper to run compensations in reverse order.
 */
async function compensate(
  completedSteps: TransactionStep<any>[],
  onProgress?: (
    stepName: string,
    status: "executing" | "completed" | "compensating" | "failed" | "interrupted",
  ) => void,
): Promise<void> {
  // LIFO: last executed step gets compensated first
  for (let i = completedSteps.length - 1; i >= 0; i--) {
    const step = completedSteps[i];
    onProgress?.(step.name, "compensating");

    const rollbackResult = await step.compensate();

    if (isErr(rollbackResult)) {
      // If a compensation fails, we log it and continue trying to roll back others.
      // We don't return the error here because we want to attempt a full rollback.
      console.error(
        `[Saga] FATAL: Failed to compensate step "${step.name}":`,
        rollbackResult.error.message,
      );
    }
  }
}
