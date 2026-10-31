// Fails when a private name appears in a tracked file or a commit message.
// The names come from the PRIVATE_NAMES environment variable (comma or newline
// separated; a GitHub secret in CI), never from this repository: a list here
// would publish them. Output never repeats a name, since CI logs are public.
// Without PRIVATE_NAMES it skips, unless --require (CI) is given.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const names = (process.env.PRIVATE_NAMES ?? "").split(/[,\n]/).map((n) => n.trim()).filter(Boolean);
if (!names.length) {
  if (process.argv.includes("--require")) {
    console.error("PRIVATE_NAMES is not set: add it as a repository secret.");
    process.exit(1);
  }
  console.log("Private names check skipped (PRIVATE_NAMES not set).");
  process.exit(0);
}
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const pattern = new RegExp(`\\b(${names.map(escape).join("|")})\\b`, "i");
const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

const found = [];
for (const file of git("ls-files", "-z").split("\0").filter(Boolean)) {
  if (file === "package-lock.json") continue;
  let text;
  try { text = readFileSync(file, "utf8"); } catch { continue; }
  text.split("\n").forEach((line, i) => { if (pattern.test(line)) found.push(`${file}:${i + 1}`); });
}
for (const entry of git("log", "HEAD", "--format=%H%x00%B%x01").split("\x01")) {
  const [hash, message] = entry.trim().split("\0");
  if (hash && message && pattern.test(message)) found.push(`commit ${hash.slice(0, 7)} message`);
}
if (found.length) {
  console.error(`A private name appears in:\n  ${found.join("\n  ")}\nThe kit never names the apps that use it.`);
  process.exit(1);
}
console.log(`No private names (${names.length} checked).`);
