import type {
  AdapterContext,
  RawRegistryData,
  RegistryAdapter,
} from "../../sdk/RegistryAdapter.js";
import path from "node:path";

export class FileRegistryAdapter implements RegistryAdapter {
  readonly type = "registry-adapter" as const;
  readonly name = "file";

  canHandle(source: string): boolean {
    return source.startsWith("file://") || source.endsWith(".json");
  }

  async load(source: string, ctx: AdapterContext): Promise<RawRegistryData> {
    const filePath = source.startsWith("file://") ? source.slice("file://".length) : source;
    const text = await ctx.fs.readFile(filePath, "utf-8");
    const data = JSON.parse(text.toString());
    const items = Array.isArray(data) ? data : (data.items ?? []);
    return { items, source: filePath };
  }

  async loadFileContent(
    file: { path?: string; url?: string; content?: string },
    item: { sourceMeta: { originalSource?: string } },
    ctx: AdapterContext,
  ): Promise<string> {
    if (!file.path) {
      throw new Error("File path is missing");
    }
    const baseRaw = item.sourceMeta.originalSource ?? "";
    const base = baseRaw.startsWith("file://") ? baseRaw.slice("file://".length) : baseRaw;
    const fullPath = path.resolve(path.dirname(base), file.path);
    const text = await ctx.fs.readFile(fullPath, "utf-8");
    return text.toString();
  }
}
