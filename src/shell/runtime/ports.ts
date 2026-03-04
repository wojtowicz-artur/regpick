import { AppError, appError } from "@/core/errors.js";
import { Context, Effect } from "effect";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import fsPromises from "node:fs/promises";

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
    stat(path: string): Effect.Effect<import("fs").Stats, AppError, never>;
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

export const createRuntimePorts = (options?: { signal?: AbortSignal }): RuntimePorts => ({
  fs: {
    existsSync: (path) => fs.existsSync(path),
    pathExists: (path) =>
      Effect.promise(async () => {
        try {
          await fsPromises.access(path);
          return true;
        } catch {
          return false;
        }
      }),
    remove: (path) =>
      Effect.tryPromise({
        try: () => fsPromises.rm(path, { recursive: true, force: true }),
        catch: (cause) => appError("RuntimeError", `Failed to remove ${path}`, cause),
      }),
    ensureDir: (path) =>
      Effect.tryPromise({
        try: () => fsPromises.mkdir(path, { recursive: true }),
        catch: (cause) => appError("RuntimeError", `Failed to ensure directory: ${path}`, cause),
      }),
    writeFile: (path, content, encoding) =>
      Effect.tryPromise({
        try: () => fsPromises.writeFile(path, content, encoding),
        catch: (cause) => appError("RuntimeError", `Failed to write file: ${path}`, cause),
      }),
    readFile: (path, encoding) =>
      Effect.tryPromise({
        try: () => fsPromises.readFile(path, encoding).then((b) => b.toString()),
        catch: (cause) => appError("RuntimeError", `Failed to read file: ${path}`, cause),
      }),
    readJsonSync: <T = unknown>(path: string) =>
      Effect.try({
        try: () => {
          const content = fs.readFileSync(path, "utf8");
          return JSON.parse(content) as T;
        },
        catch: (cause) => appError("RuntimeError", `Failed to read JSON: ${path}`, cause),
      }),
    writeJson: (path, value, opts) =>
      Effect.tryPromise({
        try: () => {
          const content = JSON.stringify(value, null, opts?.spaces ?? 2);
          return fsPromises.writeFile(path, content, "utf8");
        },
        catch: (cause) => appError("RuntimeError", `Failed to write JSON: ${path}`, cause),
      }),
    stat: (path) =>
      Effect.tryPromise({
        try: () => fsPromises.stat(path),
        catch: (cause) => appError("RuntimeError", `Failed to stat path: ${path}`, cause),
      }),
    readdir: (path) =>
      Effect.tryPromise({
        try: () => fsPromises.readdir(path),
        catch: (cause) => appError("RuntimeError", `Failed to read directory: ${path}`, cause),
      }),
  },
  http: {
    getJson: <T>(url: string, timeoutMs = 15000) =>
      Effect.tryPromise({
        try: async () => {
          const response = await fetch(url, {
            signal: AbortSignal.timeout(timeoutMs),
          });
          if (!response.ok) {
            throw new Error(
              `HTTP error! status: ${response.status} when fetching JSON from: ${url}`,
            );
          }
          return (await response.json()) as T;
        },
        catch: (cause) => appError("RuntimeError", `Failed to fetch JSON from: ${url}`, cause),
      }),
    getText: (url: string, timeoutMs = 15000) =>
      Effect.tryPromise({
        try: async () => {
          const response = await fetch(url, {
            signal: AbortSignal.timeout(timeoutMs),
          });
          if (!response.ok) {
            throw new Error(
              `HTTP error! status: ${response.status} when fetching text from: ${url}`,
            );
          }
          return await response.text();
        },
        catch: (cause) => appError("RuntimeError", `Failed to fetch text from: ${url}`, cause),
      }),
  },
  prompt: {
    intro: (message) =>
      Effect.promise(async () => {
        const { intro } = await import("@clack/prompts");
        intro(message);
      }),
    outro: (message) =>
      Effect.promise(async () => {
        const { outro } = await import("@clack/prompts");
        outro(message);
      }),
    cancel: (message) =>
      Effect.promise(async () => {
        const { cancel } = await import("@clack/prompts");
        cancel(message);
      }),
    isCancel: (value) =>
      Effect.promise(async () => {
        const { isCancel } = await import("@clack/prompts");
        return isCancel(value);
      }),
    info: (message) =>
      Effect.promise(async () => {
        const { log } = await import("@clack/prompts");
        log.info(message);
      }),
    warn: (message) =>
      Effect.promise(async () => {
        const { log } = await import("@clack/prompts");
        log.warn(message);
      }),
    error: (message) =>
      Effect.promise(async () => {
        const { log } = await import("@clack/prompts");
        log.error(message);
      }),
    success: (message) =>
      Effect.promise(async () => {
        const { log } = await import("@clack/prompts");
        log.success(message);
      }),
    text: (opts) =>
      Effect.promise(async () => {
        const { text } = await import("@clack/prompts");
        return text({ signal: options?.signal, ...opts });
      }),
    confirm: (opts) =>
      Effect.promise(async () => {
        const { confirm } = await import("@clack/prompts");
        return confirm({ signal: options?.signal, ...opts });
      }),
    select: (opts) =>
      Effect.promise(async () => {
        const { select } = await import("@clack/prompts");
        return select({ signal: options?.signal, ...opts } as any);
      }),
    multiselect: (opts) =>
      Effect.promise(async () => {
        const { multiselect } = await import("@clack/prompts");
        return multiselect({ signal: options?.signal, ...opts } as any);
      }),
    autocompleteMultiselect: (opts) =>
      Effect.promise(async () => {
        const { autocompleteMultiselect } = await import("@clack/prompts");
        return autocompleteMultiselect({
          signal: options?.signal,
          ...opts,
        } as any);
      }),
  },
  process: {
    run: (command, args, cwd) =>
      spawnSync(command, args, {
        cwd,
        stdio: "inherit",
        shell: process.platform === "win32",
      }),
  },
});

export const defaultRuntimePorts: RuntimePorts = createRuntimePorts();
