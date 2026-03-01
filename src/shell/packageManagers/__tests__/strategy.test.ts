import { describe, expect, it } from "vitest";

import { getPackageManagerStrategy } from "@/shell/packageManagers/strategy.js";

describe("package manager strategy", () => {
  it("builds npm commands for deps and devDeps", () => {
    const strategy = getPackageManagerStrategy("npm");
    const commands = strategy.buildInstallCommands(["react"], ["@types/react"]);
    expect(commands).toEqual([
      { command: "npm", args: ["install", "react"] },
      { command: "npm", args: ["install", "-D", "@types/react"] },
    ]);
  });

  it("builds yarn commands", () => {
    const strategy = getPackageManagerStrategy("yarn");
    const commands = strategy.buildInstallCommands(["react"], ["@types/react"]);
    expect(commands).toEqual([
      { command: "yarn", args: ["add", "react"] },
      { command: "yarn", args: ["add", "-D", "@types/react"] },
    ]);
  });

  it("builds pnpm commands", () => {
    const strategy = getPackageManagerStrategy("pnpm");
    const commands = strategy.buildInstallCommands(["react"], ["@types/react"]);
    expect(commands).toEqual([
      { command: "pnpm", args: ["add", "react"] },
      { command: "pnpm", args: ["add", "-D", "@types/react"] },
    ]);
  });

  it("omits empty command groups", () => {
    const strategy = getPackageManagerStrategy("npm");
    expect(strategy.buildInstallCommands([], [])).toEqual([]);
    expect(strategy.buildInstallCommands(["react"], [])).toEqual([
      { command: "npm", args: ["install", "react"] },
    ]);
  });
});
