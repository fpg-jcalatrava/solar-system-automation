import assert from "node:assert/strict";
import test from "node:test";
import { publicFailure, scrubOutbound, scrubText } from "../lib/redact.js";

test("failure text keeps a code and drops credential-shaped text", () => {
  assert.deepEqual(publicFailure({ code: 2101008, msg: "account not found" }), {
    code: 2101008,
    message: "account not found",
  });
  assert.equal(scrubText("password=hunter and app_secret=abc"), "Deye rejected the request.");
  assert.equal(scrubText("bearer eyJaaaaaaaa.bbbbbbbb.cccccccc"), "bearer [redacted]");
});

test("outbound payload drops secret keys", () => {
  const clean = scrubOutbound({
    name: "North",
    accessToken: "should-drop",
    password: "should-drop",
    nested: { appSecret: "should-drop", generationPower: 10 },
  });
  assert.deepEqual(clean, { name: "North", nested: { generationPower: 10 } });
});
