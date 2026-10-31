// Compiled from src/testing/mcp.ts by scripts/build.mjs. Do not edit.
const ctx = { waitUntil() {
}, passThroughOnException() {
}, props: {} };
function mcpTestClient(handler, options = {}) {
  const { url = "https://app.test/mcp", env = {}, protocolVersion = "2025-06-18" } = options;
  let id = 0;
  const call = async (method, params) => {
    const response = await handler(
      new Request(url, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": protocolVersion },
        body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, ...params === void 0 ? {} : { params } })
      }),
      env,
      ctx
    );
    const text = await response.text();
    const data = text.trimStart().startsWith("{") ? text : text.split("\n").find((line) => line.startsWith("data: "))?.slice(6);
    if (!data) throw new Error(`${method}: no JSON-RPC answer (HTTP ${response.status}): ${text.slice(0, 200)}`);
    const answer = JSON.parse(data);
    if (answer.error) throw new Error(`${method}: ${answer.error.message ?? JSON.stringify(answer.error)}`);
    return answer.result;
  };
  return {
    call,
    listTools: async () => (await call("tools/list")).tools.sort((a, b) => a.name.localeCompare(b.name)),
    tool: async (name, args = {}) => {
      const raw = await call("tools/call", { name, arguments: args });
      const text = String(raw.content?.find((c) => c.type === "text")?.text ?? "");
      return { isError: Boolean(raw.isError), text, json: () => JSON.parse(text), raw };
    }
  };
}
export {
  mcpTestClient
};
