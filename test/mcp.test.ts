import { describe, expect, it } from "vitest";
import { createMcpHandler } from "agents/mcp/server";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { mcpTestClient } from "../src/testing/mcp";

function createServer() {
  const server = new McpServer({ name: "test", version: "1" });
  server.registerTool("echo", { description: "Echo", inputSchema: z.object({ say: z.string() }) }, async ({ say }) => ({
    content: [{ type: "text", text: JSON.stringify({ said: say }) }],
  }));
  server.registerTool("fail", { description: "Fails", inputSchema: z.object({}) }, async () => ({
    content: [{ type: "text", text: "nope" }],
    isError: true,
  }));
  return server;
}

const client = () => mcpTestClient(createMcpHandler(() => createServer() as never, { route: "/mcp" }));

describe("mcpTestClient", () => {
  it("lists tools, sorted", async () => {
    expect((await client().listTools()).map((t) => t.name)).toEqual(["echo", "fail"]);
  });

  it("calls a tool and parses its text", async () => {
    const r = await client().tool("echo", { say: "hi" });
    expect(r.isError).toBe(false);
    expect(r.json()).toEqual({ said: "hi" });
  });

  it("reports tool errors", async () => {
    expect(await client().tool("fail")).toMatchObject({ isError: true, text: "nope" });
  });

  it("throws on a JSON-RPC error", async () => {
    await expect(client().call("no/such/method")).rejects.toThrow(/no\/such\/method/);
  });
});
