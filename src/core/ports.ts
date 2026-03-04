import { type AppError } from "./errors.js";
import { Context, Effect } from "effect";

export class FileSystemPort extends Context.Tag("FileSystemPort")<
  FileSystemPort,
  {
    existsSync(path: string): boolean;
    pathExists(path: string): Effect.Effect<boolean, never, never>;
    ensureDir(path: string): Effect.Effect<void, AppError, never>;
    remove(path: string): Effect.Effect<void, AppError, never>;
    writeFile(
      path: string,
      content: string,
      encoding: BufferEncoding,
    ): Effect.Effect<void, AppError, never>;
    readFile(path: string, encoding: BufferEncoding): Effect.Effect<string, AppError, never>;
    readJsonSync<T = unknown>(path: string): Effect.Effect<T, AppError, never>;
    writeJson(
      path: string,
      value: unknown,
      options?: { spaces?: number },
    ): Effect.Effect<void, AppError, never>;
    stat(path: string): Effect.Effect<{ isDirectory(): boolean; isFile(): boolean }, AppError, never>;
    readdir(path: string): Effect.Effect<string[], AppError, never>;
  }
>() {}

export class HttpPort extends Context.Tag("HttpPort")<
  HttpPort,
  {
    getJson<T = unknown>(url: string, timeoutMs?: number): Effect.Effect<T, AppError, never>;
    getText(url: string, timeoutMs?: number): Effect.Effect<string, AppError, never>;
  }
>() {}

export class PromptPort extends Context.Tag("PromptPort")<
  PromptPort,
  {
    intro(message: string): Effect.Effect<void, never, never>;
    outro(message: string): Effect.Effect<void, never, never>;
    cancel(message: string): Effect.Effect<void, never, never>;
    isCancel(value: unknown): Effect.Effect<boolean, never, never>;
    info(message: string): Effect.Effect<void, never, never>;
    warn(message: string): Effect.Effect<void, never, never>;
    error(message: string): Effect.Effect<void, never, never>;
    success(message: string): Effect.Effect<void, never, never>;
    text(options: {
      message: string;
      placeholder?: string;
      defaultValue?: string;
    }): Effect.Effect<string | symbol, never, never>;
    confirm(options: {
      message: string;
      initialValue?: boolean;
    }): Effect.Effect<boolean | symbol, never, never>;
    select(options: {
      message: string;
      options: Array<{ value: string; label: string; hint?: string }>;
    }): Effect.Effect<string | symbol, never, never>;
    multiselect(options: {
      message: string;
      options: Array<{ value: string; label: string; hint?: string }>;
      maxItems?: number;
      required?: boolean;
    }): Effect.Effect<Array<string> | symbol, never, never>;
    autocompleteMultiselect(options: {
      message: string;
      options: Array<{ value: string; label: string; hint?: string }>;
      maxItems?: number;
      required?: boolean;
    }): Effect.Effect<Array<string> | symbol, never, never>;
  }
>() {}

export class ProcessPort extends Context.Tag("ProcessPort")<
  ProcessPort,
  {
    run(command: string, args: string[], cwd: string): { status: number | null };
  }
>() {}

export type RuntimePorts = {
  fs: Context.Tag.Service<FileSystemPort>;
  http: Context.Tag.Service<HttpPort>;
  prompt: Context.Tag.Service<PromptPort>;
  process: Context.Tag.Service<ProcessPort>;
};

export class Runtime extends Context.Tag("RuntimePorts")<Runtime, RuntimePorts>() {}