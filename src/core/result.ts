export type Ok<T> = { ok: true; value: T };
export type Err<E> = { ok: false; error: E };
export type Result<T, E> = Ok<T> | Err<E>;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok;
}

export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.ok;
}

export function map<T, U, E>(result: Result<T, E>, fn: (val: T) => U): Result<U, E> {
  if (result.ok) {
    return ok(fn(result.value));
  }
  return result;
}

export function flatMap<T, U, E>(result: Result<T, E>, fn: (val: T) => Result<U, E>): Result<U, E> {
  if (result.ok) {
    return fn(result.value);
  }
  return result;
}
import { Effect } from "effect";
export const toResult = async <T, E>(eff: Effect.Effect<T, E, never>): Promise<Result<T, E>> => {
  const exit = await Effect.runPromiseExit(eff);
  if (exit._tag === "Success") return ok(exit.value);
  return err((exit.cause as any).errors?.[0] || (exit.cause as any).failure);
};
export const toResultSync = <T, E>(eff: Effect.Effect<T, E, never>): Result<T, E> => {
  const exit = Effect.runSyncExit(eff);
  if (exit._tag === "Success") return ok(exit.value);
  return err((exit.cause as any).errors?.[0] || (exit.cause as any).failure);
};
