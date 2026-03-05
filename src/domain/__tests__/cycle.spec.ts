import { test, expect } from "vitest";
import { resolveRegistryDependencies } from "../addPlan.js";
import { Effect } from "effect";

test("cycle loop fails", async () => {
  const itemA = { name: "A", registryDependencies: ["B"] } as any;
  const itemB = { name: "B", registryDependencies: ["A"] } as any;

  await expect(
    Effect.runPromise(resolveRegistryDependencies([itemA], [itemA, itemB])),
  ).rejects.toThrow(/Cyclic registry dependency detected: A -> B -> A/);
});
