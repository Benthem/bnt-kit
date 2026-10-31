// Compiled from src/testing/purity.ts by scripts/build.mjs. Do not edit.
import { createRequire } from "node:module";
const { parseSync } = createRequire(import.meta.url)("@babel/core");
const object = (value) => value && typeof value === "object" ? value : void 0;
function parse(source, jsx) {
  return parseSync(source, { filename: "source.ts", configFile: false, babelrc: false, parserOpts: { plugins: jsx ? ["typescript", "jsx"] : ["typescript"] } });
}
function walk(value, visit) {
  if (Array.isArray(value)) {
    for (const v of value) walk(v, visit);
    return;
  }
  const node = object(value);
  if (!node) return;
  visit(node);
  for (const v of Object.values(node)) walk(v, visit);
}
function importsOf(source, jsx = false) {
  const edges = [];
  walk(parse(source, jsx), (node) => {
    let target;
    if (["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration", "ImportExpression"].includes(String(node.type))) target = node.source;
    if (node.type === "TSImportType") target = node.argument;
    const callee = object(node.callee);
    if (node.type === "CallExpression" && (callee?.type === "Import" || callee?.name === "require")) target = node.arguments[0];
    const specifier = object(target)?.value;
    if (typeof specifier === "string") edges.push(specifier);
  });
  return edges;
}
function impuritiesOf(source, jsx = false) {
  const found = [];
  const member = (node, owner, property) => node?.type === "MemberExpression" && object(node.object)?.name === owner && object(node.property)?.name === property;
  walk(parse(source, jsx), (node) => {
    const callee = object(node.callee);
    if (node.type === "NewExpression" && callee?.name === "Date" && !node.arguments.length) found.push("new Date()");
    if (node.type === "CallExpression") {
      for (const [owner, property] of [["Date", "now"], ["crypto", "randomUUID"], ["crypto", "getRandomValues"], ["Math", "random"], ["performance", "now"]]) {
        if (member(callee, owner, property)) found.push(`${owner}.${property}()`);
      }
    }
  });
  return found;
}
const PROVIDER_TEXT = /cf-access-|cf_authorization|cdn-cgi\/access|cloudflareaccess\.com/i;
const TOKEN_LIBRARIES = ["jose", "jsonwebtoken", "jwt-decode"];
function authLeaksOf(source, jsx = false) {
  const found = importsOf(source, jsx).filter((i) => TOKEN_LIBRARIES.includes(i)).map((i) => `import "${i}"`);
  walk(parse(source, jsx), (node) => {
    const text = node.type === "StringLiteral" ? node.value : node.type === "TemplateElement" ? object(node.value)?.cooked : void 0;
    if (typeof text === "string" && PROVIDER_TEXT.test(text)) found.push(JSON.stringify(text.length > 60 ? `${text.slice(0, 57)}...` : text));
  });
  return found;
}
export {
  authLeaksOf,
  importsOf,
  impuritiesOf
};
