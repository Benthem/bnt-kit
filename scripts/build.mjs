// Compiles src/**/*.ts to dist/**/*.js (ESM, one file per module, imports kept),
// so the kit runs anywhere plain JavaScript runs (Node test servers included).
// Type information stays in src: package.json points "types" there.
// --check fails when dist is stale; dist is committed because apps install the
// kit straight from a git tag, without a build step.
import { transform } from "esbuild";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;
async function sources(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await sources(path)));
    else if (entry.name.endsWith(".ts")) out.push(path);
  }
  return out;
}
const check = process.argv.includes("--check");
const stale = [];
for (const file of await sources(join(root, "src"))) {
  const rel = relative(join(root, "src"), file).replace(/\.ts$/, ".js");
  const out = join(root, "dist", rel);
  const { code } = await transform(await readFile(file, "utf8"), { loader: "ts", format: "esm", target: "es2022", sourcefile: rel });
  const js = `// Compiled from src/${rel.replace(/\.js$/, ".ts")} by scripts/build.mjs. Do not edit.\n${code}`;
  if (check) {
    if ((await readFile(out, "utf8").catch(() => "")) !== js) stale.push(rel);
  } else {
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, js);
  }
}
if (stale.length) {
  console.error(`dist is out of date (${stale.join(", ")}): run \`npm run build\`.`);
  process.exit(1);
}
