import { MCP_URL } from "./config.js";
import { assertReadOnly } from "./allowlist.js";
import { publicFailure } from "./redact.js";

const PROTOCOL = "2025-03-26";

export class DeyeMcp {
  constructor(fetchImpl = fetch) {
    this.fetchImpl = fetchImpl;
    this.sessionId = null;
    this.rpcId = 1;
  }

  async call(name, args) {
    assertReadOnly(name, args ?? {});
    try {
      return await this.callWithSession(name, args ?? {}, true);
    } catch (error) {
      if (error?.code === "session") {
        return {
          ok: false,
          code: "session",
          message: "Deye MCP session failed",
          data: null,
        };
      }
      return {
        ok: false,
        code: error?.name === "TimeoutError" ? "timeout" : (error?.code ?? null),
        message: error?.name === "TimeoutError" ? "Deye MCP timed out" : "Deye MCP request failed",
        data: null,
      };
    }
  }

  async callWithSession(name, args, allowRetry) {
    await this.ensureSession();
    const id = this.rpcId++;
    const { response, text } = await this.rawPost({
      jsonrpc: "2.0",
      id,
      method: "tools/call",
      params: { name, arguments: args },
    });
    if (!response.ok && allowRetry && (response.status === 404 || response.status === 400)) {
      this.sessionId = null;
      return this.callWithSession(name, args, false);
    }
    if (response.status === 429) {
      return { ok: false, code: 429, message: "Deye rate limit reached", data: null };
    }
    if (!response.ok) {
      const parsed = parseRpc(text);
      if (parsed) {
        const failure = unwrapToolPayload(parsed);
        if (!failure.ok) return failure;
      }
      return { ok: false, code: response.status, message: `Deye MCP returned HTTP ${response.status}`, data: null };
    }
    const rpc = parseRpc(text);
    if (!rpc) return { ok: false, code: null, message: "Deye MCP returned an unreadable response", data: null };
    return unwrapToolPayload(rpc);
  }

  async ensureSession() {
    if (this.sessionId) return;
    const id = this.rpcId++;
    const { response, text } = await this.rawPost({
      jsonrpc: "2.0",
      id,
      method: "initialize",
      params: {
        protocolVersion: PROTOCOL,
        capabilities: {},
        clientInfo: { name: "solar-system-automation", version: "0.1.0" },
      },
    });
    if (!response.ok) {
      const error = new Error("session");
      error.code = "session";
      throw error;
    }
    const session = response.headers.get("mcp-session-id");
    if (!session) {
      const error = new Error("session");
      error.code = "session";
      throw error;
    }
    const rpc = parseRpc(text);
    if (rpc?.error) {
      const error = new Error("session");
      error.code = "session";
      throw error;
    }
    this.sessionId = session;
    await this.rawPost({ jsonrpc: "2.0", method: "notifications/initialized" });
  }

  async rawPost(payload) {
    const headers = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    };
    if (this.sessionId) headers["mcp-session-id"] = this.sessionId;
    const response = await this.fetchImpl(MCP_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
    const text = await response.text();
    return { response, text };
  }
}

let singleton;

export function getClient() {
  singleton ??= new DeyeMcp();
  return singleton;
}

export function parseMcpHttpBody(raw) {
  const text = String(raw ?? "").trim();
  if (text === "") return null;
  if (text.startsWith("{") || text.startsWith("[")) return JSON.parse(text);
  const chunks = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (payload && payload !== "[DONE]") chunks.push(payload);
  }
  if (chunks.length === 0) return null;
  return JSON.parse(chunks[chunks.length - 1]);
}

function parseRpc(text) {
  try {
    return parseMcpHttpBody(text);
  } catch {
    return null;
  }
}

export function unwrapToolPayload(rpc) {
  if (!rpc || typeof rpc !== "object") {
    return { ok: false, code: null, message: "Deye MCP returned an unreadable response", data: null };
  }
  if (rpc.error) {
    const failure = publicFailure(rpc.error);
    return { ok: false, code: failure.code, message: failure.message, data: null };
  }
  const result = rpc.result ?? rpc;
  if (result?.isError) {
    const failure = publicFailure(parseContent(result));
    return { ok: false, code: failure.code, message: failure.message, data: null };
  }
  const data = parseContent(result);
  if (data && typeof data === "object" && !Array.isArray(data) && data.success === false) {
    const failure = publicFailure(data);
    return { ok: false, code: failure.code, message: failure.message, data: null };
  }
  return { ok: true, code: data?.code ?? null, message: typeof data?.msg === "string" ? data.msg : null, data };
}

function parseContent(result) {
  if (!result || typeof result !== "object") return result ?? null;
  if (result.structuredContent && typeof result.structuredContent === "object") {
    return result.structuredContent;
  }
  const content = Array.isArray(result.content) ? result.content : [];
  const text = content.find((item) => item && item.type === "text" && typeof item.text === "string")?.text;
  if (typeof text !== "string") return result;
  try {
    return JSON.parse(text);
  } catch {
    return { msg: text, success: false };
  }
}
