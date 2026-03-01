import { appError, type AppError } from "@/core/errors.js";
import { err, ok, type Result } from "@/core/result.js";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import fsPromises from "node:fs/promises";

export type FileSystemPort = {
  existsSync(path: string): boolean;
  pathExists(path: string): Promise<boolean>;
  ensureDir(path: string): Promise<Result<void, AppError>>;
  remove(path: string): Promise<Result<void, AppError>>;
  writeFile(
    path: string,
    content: string,
    encoding: BufferEncoding,
  ): Promise<Result<void, AppError>>;
  readFile(path: string, encoding: BufferEncoding): Promise<Result<string, AppError>>;
  readJsonSync<T = unknown>(path: string): Result<T, AppError>;
  writeJson(
    path: string,
    value: unknown,
    options?: { spaces?: number },
  ): Promise<Result<void, AppError>>;
  stat(path: string): Promise<Result<import("fs").Stats, AppError>>;
  readdir(path: string): Promise<Result<string[], AppError>>;
};

export type HttpPort = {
  getJson<T = unknown>(url: string, timeoutMs?: number): Promise<Result<T, AppError>>;
  getText(url: string, timeoutMs?: number): Promise<Result<string, AppError>>;
};

export type PromptPort = {
  intro(message: string): Promise<void>;
  outro(message: string): Promise<void>;
  cancel(message: string): Promise<void>;
  isCancel(value: unknown): Promise<boolean>;
  info(message: string): Promise<void>;
  warn(message: string): Promise<void>;
  error(message: string): Promise<void>;
  success(message: string): Promise<void>;
  text(options: {
    message: string;
    placeholder?: string;
    defaultValue?: string;
  }): Promise<string | symbol>;
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
    remove: async (path) => {
      try {
        await fsPromises.rm(path, { recursive: true, force: true });
        return ok(undefined);
      } catch (cause) {
        return err(appError("RuntimeError", `Failed to remove ${path}`, cause));
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
        const response = await fetch(url, {
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (!response.ok) {
          return err(
            appError(
              "RuntimeError",
              `HTTP error! status: ${response.status} when fetching JSON from: ${url}`,
            ),
          );
        }

        const data = await response.json();
        return ok(data as T);
      } catch (cause) {
        return err(appError("RuntimeError", `Failed to fetch JSON from: ${url}`, cause));
      }
    },
    getText: async (url: string, timeoutMs = 15000): Promise<Result<string, AppError>> => {
      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (!response.ok) {
          return err(
            appError(
              "RuntimeError",
              `HTTP error! status: ${response.status} when fetching text from: ${url}`,
            ),
          );
        }

        const data = await response.text();
        return ok(data);
      } catch (cause) {
        return err(appError("RuntimeError", `Failed to fetch text from: ${url}`, cause));
      }
    },
  },
  prompt: {
    intro: async (message) => {
      const { intro } = await import("@clack/prompts");
      return intro(message);
    },
    outro: async (message) => {
      const { outro } = await import("@clack/prompts");
      return outro(message);
    },
    cancel: async (message) => {
      const { cancel } = await import("@clack/prompts");
      return cancel(message);
    },
    isCancel: async (value) => {
      const { isCancel } = await import("@clack/prompts");
      return isCancel(value);
    },
    info: async (message) => {
      const { log } = await import("@clack/prompts");
      return log.info(message);
    },
    warn: async (message) => {
      const { log } = await import("@clack/prompts");
      return log.warn(message);
    },
    error: async (message) => {
      const { log } = await import("@clack/prompts");
      return log.error(message);
    },
    success: async (message) => {
      const { log } = await import("@clack/prompts");
      return log.success(message);
    },
    text: async (opts) => {
      const { text } = await import("@clack/prompts");
      return text({ signal: options?.signal, ...opts });
    },
    confirm: async (opts) => {
      const { confirm } = await import("@clack/prompts");
      return confirm({ signal: options?.signal, ...opts });
    },
    select: async (opts) => {
      const { select } = await import("@clack/prompts");
      return select({ signal: options?.signal, ...opts } as any);
    },
    multiselect: async (opts) => {
      const { multiselect } = await import("@clack/prompts");
      return multiselect({ signal: options?.signal, ...opts } as any);
    },
    autocompleteMultiselect: async (opts) => {
      const { autocompleteMultiselect } = await import("@clack/prompts");
      return autocompleteMultiselect({
        signal: options?.signal,
        ...opts,
      } as any);
    },
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
