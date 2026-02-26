export type AppErrorKind =
  | "ConfigError"
  | "RegistryError"
  | "InstallError"
  | "UserCancelled"
  | "ValidationError"
  | "RuntimeError";

export type AppError = {
  kind: AppErrorKind;
  message: string;
  cause?: unknown;
};

export function appError(kind: AppErrorKind, message: string, cause?: unknown): AppError {
  return { kind, message, cause };
}

export function toAppError(error: unknown, fallbackKind: AppErrorKind = "RuntimeError"): AppError {
  if (
    typeof error === "object" &&
    error !== null &&
    "kind" in error &&
    "message" in error &&
    typeof (error as { kind?: unknown }).kind === "string" &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return error as AppError;
  }

  if (error instanceof Error) {
    return appError(fallbackKind, error.message, error);
  }

  return appError(fallbackKind, String(error));
}
