import { describe, expect, it } from "vitest";

import { getPackageManagerPlugin } from "@/shell/packageManagers/strategy.js";

describe("package manager strategy", () => {
  it("builds npm commands for deps and devDeps", () => {
    const strategy = getPackageManagerPlugin("npm");
    const commands = strategy!.buildInstallCommands(["react"], ["@types/react"]);
    expect(commands).toEqual([
      { command: "npm", args: ["install", "react"] },
      { command: "npm", args: ["install", "-D", "@types/react"] },
    ]);
  });

  it("builds yarn commands", () => {
    const strategy = getPackageManagerPlugin("yarn");
    const commands = strategy!.buildInstallCommands(["react"], ["@types/react"]);
    expect(commands).toEqual([
      { command: "yarn", args: ["add", "react"] },
      { command: "yarn", args: ["add", "-D", "@types/react"] },
    ]);
  });

  it("builds pnpm commands", () => {
    const strategy = getPackageManagerPlugin("pnpm");
    const commands = strategy!.buildInstallCommands(["react"], ["@types/react"]);
    expect(commands).toEqual([
      { command: "pnpm", args: ["add", "react"] },
      { command: "pnpm", args: ["add", "-D", "@types/react"] },
    ]);
  });

  it("builds bun commands", () => {
    const strategy = getPackageManagerPlugin("bun");
    const commands = strategy!.buildInstallCommands(["react"], ["@types/react"]);
    expect(commands).toEqual([
      { command: "bun", args: ["add", "react"] },
      { command: "bun", args: ["add", "-D", "@types/react"] },
    ]);
  });

  it("handles empty arrays", () => {
    const strategy = getPackageManagerPlugin("npm");
    expect(strategy!.buildInstallCommands([], [])).toEqual([]);
    expect(strategy!.buildInstallCommands(["react"], [])).toEqual([
      { command: "npm", args: ["install", "react"] },
    ]);
  });
});
