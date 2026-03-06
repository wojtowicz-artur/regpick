import type {
  AdapterContext,
  RawRegistryData,
  RegistryAdapter,
} from "../../sdk/RegistryAdapter.js";

export class ShadcnRegistryAdapter implements RegistryAdapter {
  readonly type = "registry-adapter" as const;
  readonly name = "shadcn-v4";

  canHandle(source: string): boolean {
    return (
      source.includes("ui.shadcn.com") ||
      source.startsWith("shadcn://") ||
      (source.includes("/r/") && source.endsWith(".json"))
    );
  }

  async load(source: string, ctx: AdapterContext): Promise<RawRegistryData> {
    const url = this.normalizeUrl(source);
    const text = await ctx.http.getText(url);
    const data = JSON.parse(text);
    const items = Array.isArray(data) ? data : (data.items ?? []);
    return { items, source: url };
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

  private normalizeUrl(source: string): string {
    if (source.includes("github.com") && source.includes("/blob/")) {
      return source.replace("github.com", "raw.githubusercontent.com").replace("/blob/", "/");
    }
    if (source.startsWith("shadcn://")) {
      return `https://ui.shadcn.com/r/${source.slice("shadcn://".length)}`;
    }
    return source;
  }
}
