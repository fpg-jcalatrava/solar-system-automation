import assert from "node:assert/strict";
import test from "node:test";
import { parseMcpHttpBody, unwrapToolPayload } from "../lib/mcp.js";

test("SSE tool results prefer structured content", () => {
  const rpc = parseMcpHttpBody(
    'event: message\ndata: {"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"{\\"eu\\":\\"hidden\\"}"}],"structuredContent":{"eu":"https://eu1-developer.deyecloud.com"},"isError":false}}\n',
  );
  const payload = unwrapToolPayload(rpc);
  assert.equal(payload.ok, true);
  assert.equal(payload.data.eu, "https://eu1-developer.deyecloud.com");
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
