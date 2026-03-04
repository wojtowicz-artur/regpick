import { Data } from "effect";

export class ConfigError extends Data.TaggedError("ConfigError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class RegistryError extends Data.TaggedError("RegistryError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class InstallError extends Data.TaggedError("InstallError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class UserCancelled extends Data.TaggedError("UserCancelled")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class ValidationError extends Data.TaggedError("ValidationError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class RuntimeError extends Data.TaggedError("RuntimeError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export type AppError =
  | ConfigError
  | RegistryError
  | InstallError
  | UserCancelled
  | ValidationError
  | RuntimeError;

export type AppErrorKind = AppError["_tag"];

export function appError(kind: AppErrorKind, message: string, cause?: unknown): AppError {
  switch (kind) {
    case "ConfigError":
      return new ConfigError({ message, cause });
    case "RegistryError":
      return new RegistryError({ message, cause });
    case "InstallError":
      return new InstallError({ message, cause });
    case "UserCancelled":
      return new UserCancelled({ message, cause });
    case "ValidationError":
      return new ValidationError({ message, cause });
    case "RuntimeError":
      return new RuntimeError({ message, cause });
  }
}

export function toAppError(error: unknown, fallbackKind: AppErrorKind = "RuntimeError"): AppError {
  if (error !== null && typeof error === "object" && "_tag" in error) {
    const e = error as any;
    if (
      e._tag === "ConfigError" ||
      e._tag === "RegistryError" ||
      e._tag === "InstallError" ||
      e._tag === "UserCancelled" ||
      e._tag === "ValidationError" ||
      e._tag === "RuntimeError"
    ) {
      return e as AppError;
    }
  }

  if (error instanceof Error) {
    return appError(fallbackKind, error.message, error);
  }

  const message =
    error !== null && typeof error === "object" && "message" in error
      ? String(error.message)
      : String(error);

  return appError(fallbackKind, message, error);
}
