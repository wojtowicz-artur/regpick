import { appError } from "@/core/errors.js";
import { RuntimePorts } from "@/core/ports.js";
import { Effect } from "effect";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import fsPromises from "node:fs/promises";

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
        catch: (cause) => appError("FileSystemError", `Failed to remove ${path}`, cause),
      }),
    ensureDir: (path) =>
      Effect.tryPromise({
        try: () => fsPromises.mkdir(path, { recursive: true }),
        catch: (cause) => appError("FileSystemError", `Failed to ensure directory: ${path}`, cause),
      }),
    writeFile: (path, content, encoding) =>
      Effect.tryPromise({
        try: () => fsPromises.writeFile(path, content, encoding),
        catch: (cause) => appError("FileSystemError", `Failed to write file: ${path}`, cause),
      }),
    readFile: (path, encoding) =>
      Effect.tryPromise({
        try: () => fsPromises.readFile(path, encoding).then((b) => b.toString()),
        catch: (cause) => appError("FileSystemError", `Failed to read file: ${path}`, cause),
      }),
    readJsonSync: <T = unknown>(path: string) =>
      Effect.try({
        try: () => {
          const content = fs.readFileSync(path, "utf8");
          return JSON.parse(content) as T;
        },
        catch: (cause) => appError("JsonError", `Failed to read JSON: ${path}`, cause),
      }),
    writeJson: (path, value, opts) =>
      Effect.tryPromise({
        try: () => {
          const content = JSON.stringify(value, null, opts?.spaces ?? 2);
          return fsPromises.writeFile(path, content, "utf8");
        },
        catch: (cause) => appError("JsonError", `Failed to write JSON: ${path}`, cause),
      }),
    stat: (path) =>
      Effect.tryPromise({
        try: () => fsPromises.stat(path),
        catch: (cause) => appError("FileSystemError", `Failed to stat path: ${path}`, cause),
      }),
    readdir: (path) =>
      Effect.tryPromise({
        try: () => fsPromises.readdir(path),
        catch: (cause) => appError("FileSystemError", `Failed to read directory: ${path}`, cause),
      }),
  },
  http: {
    getJson: <T>(url: string, timeoutMs = 15000) =>
      Effect.tryPromise({
        try: async () => {
          const response = await fetch(url, {
            signal: options?.signal || AbortSignal.timeout(timeoutMs),
          });
          if (!response.ok) {
            throw new Error(
              `HTTP error! status: ${response.status} when fetching JSON from: ${url}`,
            );
          }
          return (await response.json()) as T;
        },
        catch: (cause) => appError("NetworkError", `Failed to fetch JSON from: ${url}`, cause),
      }),
    getText: (url: string, timeoutMs = 15000) =>
      Effect.tryPromise({
        try: async () => {
          const response = await fetch(url, {
            signal: options?.signal || AbortSignal.timeout(timeoutMs),
          });
          if (!response.ok) {
            throw new Error(
              `HTTP error! status: ${response.status} when fetching text from: ${url}`,
            );
          }
          return await response.text();
        },
        catch: (cause) => appError("NetworkError", `Failed to fetch text from: ${url}`, cause),
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
      Effect.sync(() => {
        const isCancelSymbol = typeof value === "symbol" && value.description === "clack:cancel";
        return isCancelSymbol;
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
    text: (options) =>
      Effect.promise(async () => {
        const { text } = await import("@clack/prompts");
        return text(options);
      }),
    confirm: (options) =>
      Effect.promise(async () => {
        const { confirm } = await import("@clack/prompts");
        return confirm(options);
      }),
    select: (options) =>
      Effect.promise(async () => {
        const { select } = await import("@clack/prompts");
        return select(options);
      }),
    multiselect: (options) =>
      Effect.promise(async () => {
        const { multiselect } = await import("@clack/prompts");
        return multiselect(options) as any;
      }),
    autocompleteMultiselect: (options) =>
      Effect.promise(async () => {
        // Fallback to autocomplete-multiselect when available, else regular multiselect
        const prompts = await import("@clack/prompts");
        if ((prompts as any).autocompleteMultiselect) {
          return (prompts as any).autocompleteMultiselect(options);
        }
        return prompts.multiselect(options) as any;
      }),
  },
  process: {
    run: (command, args, cwd) => {
      const result = spawnSync(command, args, {
        stdio: "inherit",
        cwd,
        shell: true,
      });
      return { status: result.status };
    },
  },
});
