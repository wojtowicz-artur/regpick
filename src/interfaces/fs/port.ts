import type { FileSystemError, JsonError } from "@/core/errors.js";
import { Context, Effect } from "effect";

export class FileSystemPort extends Context.Tag("FileSystemPort")<
  FileSystemPort,
  {
    existsSync(path: string): boolean;
    pathExists(path: string): Effect.Effect<boolean, never>;
    ensureDir(path: string): Effect.Effect<void, FileSystemError>;
    remove(path: string): Effect.Effect<void, FileSystemError>;
    writeFile(
      path: string,
      content: string | Uint8Array,
      encoding?: BufferEncoding,
    ): Effect.Effect<void, FileSystemError>;
    readFile(
      path: string,
      encoding?: BufferEncoding,
    ): Effect.Effect<string | Uint8Array, FileSystemError>;
    readJsonSync<T = unknown>(path: string): Effect.Effect<T, JsonError>;
    writeJson(
      path: string,
      value: unknown,
      options?: { spaces?: number },
    ): Effect.Effect<void, JsonError>;
    stat(
      path: string,
    ): Effect.Effect<{ isDirectory(): boolean; isFile(): boolean }, FileSystemError>;
    readdir(path: string): Effect.Effect<string[], FileSystemError>;
  }
>() {}
