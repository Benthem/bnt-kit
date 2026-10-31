// Talks JSON-RPC to an app's MCP endpoint the way Claude does, for tests of the
// tools themselves. Takes the app's fetch handler (e.g. agents'
// `createMcpHandler(() => createServer(deps), { route: "/mcp" })`), so the kit
// depends on no MCP library. Answers may be plain JSON or one SSE event.

export type FetchHandler = (request: Request, env: unknown, ctx: ExecutionContext) => Response | Promise<Response>;

export interface McpTestOptions {
  /** The endpoint's URL; its path must match the handler's route. */
  url?: string;
  /** Passed to the handler as `env`. */
  env?: unknown;
  protocolVersion?: string;
}

export interface ToolResult {
  isError: boolean;
  /** The first text content. */
  text: string;
  /** The first text content, parsed. */
  json: <T = any>() => T;
  /** The whole result, for anything else a tool returns. */
  raw: Record<string, unknown>;
}

export interface McpTestClient {
  /** One JSON-RPC request; throws on a JSON-RPC error. */
  call: (method: string, params?: unknown) => Promise<any>;
  /** tools/list, sorted by name. */
  listTools: () => Promise<{ name: string; description?: string; inputSchema?: unknown }[]>;
  tool: (name: string, args?: Record<string, unknown>) => Promise<ToolResult>;
}

const ctx = { waitUntil() {}, passThroughOnException() {}, props: {} } as unknown as ExecutionContext;

export function mcpTestClient(handler: FetchHandler, options: McpTestOptions = {}): McpTestClient {
  const { url = "https://app.test/mcp", env = {}, protocolVersion = "2025-06-18" } = options;
  let id = 0;
  const call = async (method: string, params?: unknown) => {
    const response = await handler(
      new Request(url, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": protocolVersion },
        body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, ...(params === undefined ? {} : { params }) }),
      }),
      env,
      ctx,
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
    listTools: async () => ((await call("tools/list")).tools as { name: string }[]).sort((a, b) => a.name.localeCompare(b.name)),
    tool: async (name, args = {}) => {
      const raw = await call("tools/call", { name, arguments: args });
      const text = String((raw.content as { type: string; text?: string }[] | undefined)?.find((c) => c.type === "text")?.text ?? "");
      return { isError: Boolean(raw.isError), text, json: () => JSON.parse(text), raw };
    },
  };
}
