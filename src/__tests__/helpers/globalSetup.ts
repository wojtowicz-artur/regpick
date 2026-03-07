import { execa } from "execa";

export default async function setup() {
  if (process.env.SKIP_BUILD) return;
  console.log("Building project for E2E tests...");
  await execa("npm", ["run", "build"], { stdio: "inherit" });
}
