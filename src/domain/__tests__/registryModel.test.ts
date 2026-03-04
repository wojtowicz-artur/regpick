import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { extractItemReferences, normalizeManifestInline } from "@/domain/registryModel.js";

describe("registry model core", () => {
  it("normalizes inline items from registry.json", () => {
    const payload = {
      items: [
        {
          name: "check",
          type: "registry:icon",
          files: [{ path: "icons/check.tsx", type: "registry:file" }],
        },
        { name: "external", url: "./external-item.json" },
      ],
    };

    const normalized = Effect.runSync(
      normalizeManifestInline(payload, {
        type: "file",
        pluginState: { baseDir: "/registry" },
      }),
    );
    expect(normalized).toHaveLength(1);
    expect(normalized[0].name).toBe("check");
  });

  it("extracts item references from registry.json entries", () => {
    const payload = {
      items: [
        { name: "a", url: "./a.json" },
        { name: "b", href: "./b.json" },
        { name: "c", path: "./c.json" },
      ],
    };
    expect(extractItemReferences(payload)).toEqual(["./a.json", "./b.json", "./c.json"]);
  });
});
