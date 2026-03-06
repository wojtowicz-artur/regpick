import type {
  AdapterContext,
  RawRegistryData,
  RegistryAdapter,
} from "../../sdk/RegistryAdapter.js";

export class HttpRegistryAdapter implements RegistryAdapter {
  readonly type = "registry-adapter" as const;
  readonly name = "http";

  canHandle(source: string): boolean {
    return source.startsWith("http://") || source.startsWith("https://");
  }

  async load(source: string, ctx: AdapterContext): Promise<RawRegistryData> {
    const text = await ctx.http.getText(source);
    const data = JSON.parse(text);
    const items = Array.isArray(data) ? data : (data.items ?? []);
    return { items, source };
  }

  async loadFileContent(
    file: { path?: string; url?: string; content?: string },
    item: { sourceMeta: { originalSource?: string } },
    ctx: AdapterContext,
  ): Promise<string> {
    if (file.url) {
      return ctx.http.getText(file.url);
    }
    const base = item.sourceMeta.originalSource ?? "";
    const fileUrl = new URL(file.path ?? "", base).toString();
    return ctx.http.getText(fileUrl);
  }
}
