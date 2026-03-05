import { Effect } from "effect";
import { expect, test } from "vitest";
import { resolveRegistryDependencies } from "../addPlan.js";

test("cycle loop fails", async () => {
  const baseItem = {
    title: "",
    description: "",
    type: "registry:component",
    dependencies: [],
    devDependencies: [],
    files: [],
    sourceMeta: { type: "directory" as const },
  };

  const itemA: any = { ...baseItem, name: "A", registryDependencies: ["B"] };
  const itemB: any = { ...baseItem, name: "B", registryDependencies: ["A"] };

  const result = await Effect.runPromiseExit(resolveRegistryDependencies([itemA], [itemA, itemB]));

  expect(result._tag).toBe("Failure");
  if (result._tag === "Failure") {
    expect(result.cause._tag).toBe("Fail");
    if (result.cause._tag === "Fail") {
      expect(result.cause.error._tag).toBe("RegistryError");
      expect((result.cause.error as { message: string }).message).toMatch(
        /Cyclic registry dependency detected: A -> B -> A/,
      );
    }
  }
});
