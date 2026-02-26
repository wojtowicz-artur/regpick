import fs from "node:fs";
import fsPromises from "node:fs/promises";
import {
  cancel,
  confirm,
  intro,
  isCancel,
  log,
  multiselect,
  autocompleteMultiselect,
  outro,
  select,
  text,
} from "@clack/prompts";
import { spawnSync } from "node:child_process";
import { type Result, ok, err } from "../../core/result.js";
import { appError, type AppError } from "../../core/errors.js";

export type FileSystemPort = {
  existsSync(path: string): boolean;
  pathExists(path: string): Promise<boolean>;
  ensureDir(path: string): Promise<Result<void, AppError>>;
  writeFile(path: string, content: string, encoding: BufferEncoding): Promise<Result<void, AppError>>;
  readFile(path: string, encoding: BufferEncoding): Promise<Result<string, AppError>>;
  readJsonSync<T = unknown>(path: string): Result<T, AppError>;
  writeJson(path: string, value: unknown, options?: { spaces?: number }): Promise<Result<void, AppError>>;
  stat(path: string): Promise<Result<import("fs").Stats, AppError>>;
  readdir(path: string): Promise<Result<string[], AppError>>;
};

export type HttpPort = {
  getJson<T = unknown>(url: string, timeoutMs?: number): Promise<Result<T, AppError>>;
  getText(url: string, timeoutMs?: number): Promise<Result<string, AppError>>;
};

export type PromptPort = {
  intro(message: string): void;
  outro(message: string): void;
  cancel(message: string): void;
  isCancel(value: unknown): boolean;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  success(message: string): void;
  text(options: { message: string; placeholder?: string; defaultValue?: string }): Promise<string | symbol>;
  confirm(options: { message: string; initialValue?: boolean }): Promise<boolean | symbol>;
  select(options: {
    message: string;
    options: Array<{ value: string; label: string; hint?: string }>;
  }): Promise<string | symbol>;
  multiselect(options: {
    message: string;
    options: Array<{ value: string; label: string; hint?: string }>;
    maxItems?: number;
    required?: boolean;
  }): Promise<Array<string> | symbol>;
  autocompleteMultiselect(options: {
    message: string;
    options: Array<{ value: string; label: string; hint?: string }>;
    maxItems?: number;
    required?: boolean;
  }): Promise<Array<string> | symbol>;
};

export type ProcessPort = {
  run(command: string, args: string[], cwd: string): { status: number | null };
};

export type RuntimePorts = {
  fs: FileSystemPort;
  http: HttpPort;
  prompt: PromptPort;
  process: ProcessPort;
};

export const createRuntimePorts = (options?: { signal?: AbortSignal }): RuntimePorts => ({
  fs: {
    existsSync: (path) => fs.existsSync(path),
    pathExists: async (path) => {
      try {
        await fsPromises.access(path);
        return true;
      } catch {
        return false;
      }
    },
    ensureDir: async (path) => {
      try {
        await fsPromises.mkdir(path, { recursive: true });
        return ok(undefined);
      } catch (cause) {
        return err(appError("RuntimeError", `Failed to ensure directory: ${path}`, cause));
      }
    },
    writeFile: async (path, content, encoding) => {
      try {
        await fsPromises.writeFile(path, content, encoding);
        return ok(undefined);
      } catch (cause) {
        return err(appError("RuntimeError", `Failed to write file: ${path}`, cause));
      }
    },
    readFile: async (path, encoding) => {
      try {
        const content = await fsPromises.readFile(path, encoding);
        return ok(content);
      } catch (cause) {
        return err(appError("RuntimeError", `Failed to read file: ${path}`, cause));
      }
    },
    readJsonSync: <T = unknown>(path: string) => {
      try {
        const content = fs.readFileSync(path, "utf8");
        return ok(JSON.parse(content) as T);
      } catch (cause) {
        return err(appError("RuntimeError", `Failed to read JSON: ${path}`, cause));
      }
    },
    writeJson: async (path, value, opts) => {
      try {
        const content = JSON.stringify(value, null, opts?.spaces ?? 2);
        await fsPromises.writeFile(path, content, "utf8");
        return ok(undefined);
      } catch (cause) {
        return err(appError("RuntimeError", `Failed to write JSON: ${path}`, cause));
      }
    },
    stat: async (path) => {
      try {
        const stats = await fsPromises.stat(path);
        return ok(stats);
      } catch (cause) {
        return err(appError("RuntimeError", `Failed to stat path: ${path}`, cause));
      }
    },
    readdir: async (path) => {
      try {
        const files = await fsPromises.readdir(path);
        return ok(files);
      } catch (cause) {
        return err(appError("RuntimeError", `Failed to read directory: ${path}`, cause));
      }
    },
  },
  http: {
    getJson: async <T>(url: string, timeoutMs = 15000): Promise<Result<T, AppError>> => {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
        
        if (!response.ok) {
          return err(appError("RuntimeError", `HTTP error! status: ${response.status} when fetching JSON from: ${url}`));
        }
        
        const data = await response.json();
        return ok(data as T);
      } catch (cause) {
        return err(appError("RuntimeError", `Failed to fetch JSON from: ${url}`, cause));
      }
    },
    getText: async (url: string, timeoutMs = 15000): Promise<Result<string, AppError>> => {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
        
        if (!response.ok) {
          return err(appError("RuntimeError", `HTTP error! status: ${response.status} when fetching text from: ${url}`));
        }
        
        const data = await response.text();
        return ok(data);
      } catch (cause) {
        return err(appError("RuntimeError", `Failed to fetch text from: ${url}`, cause));
      }
    },
  },
  prompt: {
    intro: (message) => intro(message),
    outro: (message) => outro(message),
    cancel: (message) => cancel(message),
    isCancel: (value) => isCancel(value),
    info: (message) => log.info(message),
    warn: (message) => log.warn(message),
    error: (message) => log.error(message),
    success: (message) => log.success(message),
    text: (opts) => text({ signal: options?.signal, ...opts }),
    confirm: (opts) => confirm({ signal: options?.signal, ...opts }),
    select: (opts) => select({ signal: options?.signal, ...opts } as any),
    multiselect: (opts) => multiselect({ signal: options?.signal, ...opts } as any),
    autocompleteMultiselect: (opts) => autocompleteMultiselect({ signal: options?.signal, ...opts } as any),
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
