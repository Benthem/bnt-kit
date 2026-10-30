#!/usr/bin/env node
// Wrangler supplies WRANGLER_COMMAND to each custom build. Deploys and version
// uploads must check the same source they are about to ship. Types/dev only
// build assets, so `check` -> `wrangler types` cannot recursively run `check`.
import { spawnSync } from "node:child_process";

const command = process.env.WRANGLER_COMMAND;
const task = command === "types" || command === "dev" ? "build" : "check";
const result = spawnSync("npm", ["run", task], { stdio: "inherit" });
if (result.error) {
  console.error(`Could not run the Worker build check: ${result.error.message}`);
}
process.exit(result.status ?? 1);
