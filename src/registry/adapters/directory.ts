import type {
  AdapterContext,
  RawRegistryData,
  RegistryAdapter,
} from "../../sdk/RegistryAdapter.js";
import path from "node:path";

export class DirectoryRegistryAdapter implements RegistryAdapter {
  readonly type = "registry-adapter" as const;
  readonly name = "directory";

  canHandle(source: string): boolean {
    return (
      !source.startsWith("http://") && !source.startsWith("https://") && !source.endsWith(".json")
    );
  }

  async load(source: string, ctx: AdapterContext): Promise<RawRegistryData> {
    const dirPath = source.startsWith("file://") ? source.slice("file://".length) : source;
    const registryPath = path.join(dirPath, "registry.json");

    if (!ctx.fs.existsSync(registryPath)) {
      throw new Error(`No registry.json found in directory: ${dirPath}`);
    }

    const text = await ctx.fs.readFile(registryPath, "utf-8");
    const data = JSON.parse(text.toString());
    const items = Array.isArray(data) ? data : (data.items ?? []);
    return { items, source: registryPath };
  }

  async loadFileContent(
    file: { path?: string; url?: string; content?: string },
    item: { sourceMeta: { originalSource?: string } },
    ctx: AdapterContext,
  ): Promise<string> {
    if (!file.path) {
      throw new Error("File path is missing");
    }
    // originalSource for directory adapter is registryPath, so dirname(originalSource) is dirPath
    const base = item.sourceMeta.originalSource ?? "";
    const fullPath = path.resolve(path.dirname(base), file.path);
    const text = await ctx.fs.readFile(fullPath, "utf-8");
    return text.toString();
  }
}
