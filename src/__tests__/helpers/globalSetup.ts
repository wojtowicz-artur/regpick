import { execa } from "execa";

export default async function setup() {
  console.log("Building project for E2E tests...");
  await execa("npm", ["run", "build"], { stdio: "inherit" });
}
