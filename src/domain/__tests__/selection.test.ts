import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import {
  filterItemsByQuery,
  parseSelectedNames,
  selectItemsFromFlags,
} from "@/domain/selection.js";
import type { CommandContext, RegistryItem } from "@/domain/models/index.js";

const items: RegistryItem[] = [
  {
    name: "check",
    title: "Check",
    description: "Check icon",
    type: "registry:icon",
    dependencies: [],
    devDependencies: [],
    registryDependencies: [],
    files: [{ type: "registry:file", path: "icons/check.tsx" }],
    sourceMeta: { type: "directory", pluginState: { baseDir: "/registry" } },
  },
  {
    name: "calendar",
    title: "Calendar",
    description: "Calendar icon",
    type: "registry:icon",
    dependencies: [],
    devDependencies: [],
    registryDependencies: [],
    files: [{ type: "registry:file", path: "icons/calendar.tsx" }],
    sourceMeta: { type: "directory", pluginState: { baseDir: "/registry" } },
  },
];

function context(flags: CommandContext["args"]["flags"]): CommandContext {
  return {
    cwd: "/tmp/project",
    args: { flags, positionals: ["add"] },
  };
}

describe("selection core", () => {
  it("parses --select values", () => {
    expect(parseSelectedNames("check,calendar")).toEqual(["check", "calendar"]);
  });

  it("filters by query against name/title/description", () => {
    expect(filterItemsByQuery(items, "cal")).toHaveLength(1);
    expect(filterItemsByQuery(items, "icon")).toHaveLength(2);
  });

  it("selects all when --all is set", () => {
    expect(Effect.runSync(selectItemsFromFlags(items, context({ all: true })))).toEqual(items);
  });

  it("selects explicit items when --select is set", () => {
    const result = Effect.runSync(selectItemsFromFlags(items, context({ select: "check" })));
    expect(result?.map((item) => item.name)).toEqual(["check"]);
  });
});
