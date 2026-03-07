import { FileSystemPort } from "@/interfaces/fs/port.js";
import { HttpPort } from "@/interfaces/http/port.js";
import type { AdapterContext } from "@/sdk/RegistryAdapter.js";
import { Context, Effect } from "effect";

export const createAdapterContext = (
  http: Context.Tag.Service<HttpPort>,
  fs: Context.Tag.Service<FileSystemPort>,
  cwd: string,
): AdapterContext => {
  return {
    cwd,
    fs: {
      existsSync: (path) => fs.existsSync(path),
      readFile: (path, encoding) => Effect.runPromise(fs.readFile(path, encoding)),
      stat: (path) => Effect.runPromise(fs.stat(path)),
      readdir: (path) => Effect.runPromise(fs.readdir(path)),
    },
    http: {
      getJson: <T = unknown>(url: string, timeoutMs?: number) =>
        Effect.runPromise(http.getJson<T>(url, timeoutMs)),
      getText: (url: string, timeoutMs?: number) => Effect.runPromise(http.getText(url, timeoutMs)),
    },
  };
};
