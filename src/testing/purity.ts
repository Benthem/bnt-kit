// Reads a source file's imports and its reads of the clock or randomness, for
// architecture tests that keep pure code pure ("no I/O, clock or randomness;
// pass today in"). Uses Babel's parser, so type-only imports, re-exports and
// dynamic imports all count.
import { createRequire } from "node:module";

const { parseSync } = createRequire(import.meta.url)("@babel/core") as {
  parseSync: (source: string, options: Record<string, unknown>) => unknown;
};
type Node = Record<string, unknown>;
const object = (value: unknown): Node | undefined => (value && typeof value === "object" ? (value as Node) : undefined);

function parse(source: string, jsx: boolean): unknown {
  return parseSync(source, { filename: "source.ts", configFile: false, babelrc: false, parserOpts: { plugins: jsx ? ["typescript", "jsx"] : ["typescript"] } });
}

function walk(value: unknown, visit: (node: Node) => void): void {
  if (Array.isArray(value)) { for (const v of value) walk(v, visit); return; }
  const node = object(value);
  if (!node) return;
  visit(node);
  for (const v of Object.values(node)) walk(v, visit);
}

/** Every module specifier a file depends on: imports, re-exports, import types, dynamic imports and require. */
export function importsOf(source: string, jsx = false): string[] {
  const edges: string[] = [];
  walk(parse(source, jsx), (node) => {
    let target: unknown;
    if (["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration", "ImportExpression"].includes(String(node.type))) target = node.source;
    if (node.type === "TSImportType") target = node.argument;
    const callee = object(node.callee);
    if (node.type === "CallExpression" && (callee?.type === "Import" || callee?.name === "require")) target = (node.arguments as unknown[])[0];
    const specifier = object(target)?.value;
    if (typeof specifier === "string") edges.push(specifier);
  });
  return edges;
}

/** Reads of the clock or randomness: `Date.now()`, `new Date()`, `crypto.*()`, `Math.random()`, `performance.now()`. */
export function impuritiesOf(source: string, jsx = false): string[] {
  const found: string[] = [];
  const member = (node: Node | undefined, owner: string, property: string) =>
    node?.type === "MemberExpression" && object(node.object)?.name === owner && object(node.property)?.name === property;
  walk(parse(source, jsx), (node) => {
    const callee = object(node.callee);
    if (node.type === "NewExpression" && callee?.name === "Date" && !(node.arguments as unknown[]).length) found.push("new Date()");
    if (node.type === "CallExpression") {
      for (const [owner, property] of [["Date", "now"], ["crypto", "randomUUID"], ["crypto", "getRandomValues"], ["Math", "random"], ["performance", "now"]] as const) {
        if (member(callee, owner, property)) found.push(`${owner}.${property}()`);
      }
    }
  });
  return found;
}

const PROVIDER_TEXT = /cf-access-|cf_authorization|cdn-cgi\/access|cloudflareaccess\.com/i;
const TOKEN_LIBRARIES = ["jose", "jsonwebtoken", "jwt-decode"];

/**
 * Places where app code reaches past `bnt-kit/auth` into the login provider:
 * Access headers, cookies and paths in strings, and imports of token libraries
 * (verifying or decoding login tokens belongs in the kit). Keeps the provider
 * swappable in the kit alone.
 */
export function authLeaksOf(source: string, jsx = false): string[] {
  const found = importsOf(source, jsx).filter((i) => TOKEN_LIBRARIES.includes(i)).map((i) => `import "${i}"`);
  walk(parse(source, jsx), (node) => {
    const text = node.type === "StringLiteral" ? node.value : node.type === "TemplateElement" ? object(node.value)?.cooked : undefined;
    if (typeof text === "string" && PROVIDER_TEXT.test(text)) found.push(JSON.stringify(text.length > 60 ? `${text.slice(0, 57)}...` : text));
  });
  return found;
}
