import fs from "fs-extra";
import axios from "axios";
import {
  cancel,
  confirm,
  intro,
  isCancel,
  log,
  multiselect,
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

export const defaultRuntimePorts: RuntimePorts = {
  fs: {
    existsSync: (path) => fs.existsSync(path),
    pathExists: (path) => fs.pathExists(path),
    ensureDir: async (path) => {
      try {
        await fs.ensureDir(path);
        return ok(undefined);
      } catch (cause) {
        return err(appError("RuntimeError", `Failed to ensure directory: ${path}`, cause));
      }
    },
    writeFile: async (path, content, encoding) => {
      try {
        await fs.writeFile(path, content, encoding);
        return ok(undefined);
      } catch (cause) {
        return err(appError("RuntimeError", `Failed to write file: ${path}`, cause));
      }
    },
    readFile: async (path, encoding) => {
      try {
        const content = await fs.readFile(path, encoding);
        return ok(content);
      } catch (cause) {
        return err(appError("RuntimeError", `Failed to read file: ${path}`, cause));
      }
    },
    readJsonSync: <T = unknown>(path: string) => {
      try {
        const content = fs.readJsonSync(path);
        return ok(content as T);
      } catch (cause) {
        return err(appError("RuntimeError", `Failed to read JSON: ${path}`, cause));
      }
    },
    writeJson: async (path, value, options) => {
      try {
        await fs.writeJson(path, value, options);
        return ok(undefined);
      } catch (cause) {
        return err(appError("RuntimeError", `Failed to write JSON: ${path}`, cause));
      }
    },
    stat: async (path) => {
      try {
        const stats = await fs.stat(path);
        return ok(stats);
      } catch (cause) {
        return err(appError("RuntimeError", `Failed to stat path: ${path}`, cause));
      }
    },
    readdir: async (path) => {
      try {
        const files = await fs.readdir(path);
        return ok(files);
      } catch (cause) {
        return err(appError("RuntimeError", `Failed to read directory: ${path}`, cause));
      }
    },
  },
  http: {
    getJson: async <T>(url: string, timeoutMs = 15000): Promise<Result<T, AppError>> => {
      try {
        const response = await axios.get(url, { timeout: timeoutMs, responseType: "json" });
        return ok(response.data as T);
      } catch (cause) {
        return err(appError("RuntimeError", `Failed to fetch JSON from: ${url}`, cause));
      }
    },
    getText: async (url: string, timeoutMs = 15000): Promise<Result<string, AppError>> => {
      try {
        const response = await axios.get<string>(url, { timeout: timeoutMs, responseType: "text" });
        return ok(response.data);
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
    text: (options) => text(options),
    confirm: (options) => confirm(options),
    select: (options) => select(options),
    multiselect: (options) => multiselect(options),
  },
  process: {
    run: (command, args, cwd) =>
      spawnSync(command, args, {
        cwd,
        stdio: "inherit",
        shell: process.platform === "win32",
      }),
  },
};
