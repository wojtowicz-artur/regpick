export type AppErrorKind =
  | "ConfigError"
  | "RegistryError"
  | "InstallError"
  | "UserCancelled"
  | "ValidationError"
  | "RuntimeError";

import { Data } from "effect";

export class AppError extends Data.TaggedError("AppError")<{
  readonly kind: AppErrorKind;
  readonly message: string;
  readonly cause?: unknown;
}> {}

export function appError(kind: AppErrorKind, message: string, cause?: unknown): AppError {
  return new AppError({ kind, message, cause });
}

export function toAppError(error: unknown, fallbackKind: AppErrorKind = "RuntimeError"): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "kind" in error &&
    "message" in error &&
    typeof (error as { kind?: unknown }).kind === "string" &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return new AppError({
      kind: (error as any).kind,
      message: (error as any).message,
      cause: (error as any).cause,
    });
  }

  if (error instanceof Error) {
    return appError(fallbackKind, error.message, error);
  }

  return appError(fallbackKind, String(error));
}
