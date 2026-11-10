import assert from "node:assert/strict";
import test from "node:test";
import { DeyeMcp, parseMcpHttpBody, unwrapToolPayload } from "../lib/mcp.js";

test("SSE tool results prefer structured content", () => {
  const rpc = parseMcpHttpBody(
    'event: message\ndata: {"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"{\\"eu\\":\\"hidden\\"}"}],"structuredContent":{"eu":"https://eu1-developer.deyecloud.com"},"isError":false}}\n',
  );
  const payload = unwrapToolPayload(rpc);
  assert.equal(payload.ok, true);
  assert.equal(payload.data.eu, "https://eu1-developer.deyecloud.com");
});

test("a prefixed tool error keeps the Deye code and message", () => {
  const payload = unwrapToolPayload({
    jsonrpc: "2.0",
    id: 4,
    result: {
      isError: true,
      content: [{
        type: "text",
        text: 'Error executing tool list_stations: {"code": "SKILL_VERSION_REQUIRED", "msg": "skill missing", "success": false}',
      }],
    },
  });
  assert.equal(payload.ok, false);
  assert.equal(payload.code, "SKILL_VERSION_REQUIRED");
  assert.equal(payload.message, "skill missing");
});

test("each session reports skill 1.2.0 before a plant tool", async () => {
  const calls = [];
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body.method === "tools/call" ? body.params.name : body.method);
    const headers = { "mcp-session-id": "sess-1", "content-type": "text/event-stream" };
    if (body.method === "notifications/initialized") return new Response("", { status: 202, headers });
    let result;
    if (body.method === "initialize") {
      result = { protocolVersion: "2025-03-26" };
    } else if (body.params?.name === "get_skill_info") {
      assert.equal(body.params.arguments.client_skill_version, "1.2.0");
      result = { isError: false, structuredContent: { server_version: "1.2.0", update_available: false } };
    } else {
      result = { isError: false, structuredContent: { success: true, stationList: [], total: 0 } };
    }
    return new Response(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: body.id, result })}\n`, { status: 200, headers });
  };
  const client = new DeyeMcp(fetchImpl);
  assert.equal((await client.call("list_stations", { page: 1, size: 10 })).ok, true);
  assert.equal((await client.call("list_stations", { page: 1, size: 10 })).ok, true);
  assert.deepEqual(calls, ["initialize", "notifications/initialized", "get_skill_info", "list_stations", "list_stations"]);
});

test("a failed tool result exposes only code and message", () => {
  const payload = unwrapToolPayload({
    jsonrpc: "2.0",
    id: 3,
    result: {
      isError: true,
      content: [{ type: "text", text: JSON.stringify({ code: 2101008, msg: "account not found", accessToken: "nope" }) }],
    },
  });
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 2101008);
  assert.equal(payload.message, "account not found");
  assert.equal(payload.data, null);
  assert.equal(JSON.stringify(payload).includes("nope"), false);
});
