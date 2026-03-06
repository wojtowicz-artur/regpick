import { FileSystemError, JsonError } from "@/core/errors.js";
import { Effect, Layer } from "effect";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import { FileSystemPort } from "./port.js";

export const createNodeFileSystemLive = () =>
  Layer.succeed(FileSystemPort, {
    existsSync: (path) => fs.existsSync(path),
    pathExists: (path) =>
      Effect.tryPromise({
        try: () => fsPromises.access(path),
        catch: () => false,
      }).pipe(
        Effect.map(() => true),
        Effect.catchAll(() => Effect.succeed(false)),
      ),
    remove: (path) =>
      Effect.tryPromise({
        try: () => fsPromises.rm(path, { recursive: true, force: true }),
        catch: (cause) => new FileSystemError({ message: `Failed to remove ${path}`, cause }),
      }),
    ensureDir: (path) =>
      Effect.tryPromise({
        try: () => fsPromises.mkdir(path, { recursive: true }),
        catch: (cause) =>
          new FileSystemError({
            message: `Failed to ensure directory: ${path}`,
            cause,
          }),
      }),
    writeFile: (path, content, encoding) =>
      Effect.tryPromise({
        try: () => fsPromises.writeFile(path, content, encoding),
        catch: (cause) =>
          new FileSystemError({
            message: `Failed to write file: ${path}`,
            cause,
          }),
      }),
    readFile: (path, encoding) =>
      Effect.tryPromise({
        try: () => fsPromises.readFile(path, encoding),
        catch: (cause) =>
          new FileSystemError({
            message: `Failed to read file: ${path}`,
            cause,
          }),
      }),
    readJsonSync: <T = unknown>(path: string) =>
      Effect.try({
        try: () => {
          const content = fs.readFileSync(path, "utf8");
          return JSON.parse(content) as T;
        },
        catch: (cause) => new JsonError({ message: `Failed to read JSON: ${path}`, cause }),
      }),
    writeJson: (path, value, opts) =>
      Effect.tryPromise({
        try: () => {
          const content = JSON.stringify(value, null, opts?.spaces ?? 2);
          return fsPromises.writeFile(path, content, "utf8");
        },
        catch: (cause) => new JsonError({ message: `Failed to write JSON: ${path}`, cause }),
      }),
    stat: (path) =>
      Effect.tryPromise({
        try: () => fsPromises.stat(path),
        catch: (cause) =>
          new FileSystemError({
            message: `Failed to stat path: ${path}`,
            cause,
          }),
      }),
    readdir: (path) =>
      Effect.tryPromise({
        try: () => fsPromises.readdir(path),
        catch: (cause) =>
          new FileSystemError({
            message: `Failed to read directory: ${path}`,
            cause,
          }),
      }),
  });
