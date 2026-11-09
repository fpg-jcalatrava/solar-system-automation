const JWT = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;
const BEARER = /bearer\s+\S+/gi;
const SECRET_KEY = /token|password|secret|authorization|appsecret|app_secret|app_id|appid/i;

export function scrubText(value) {
  if (typeof value !== "string") return "";
  const cleaned = value.replace(JWT, "[redacted]").replace(BEARER, "bearer [redacted]");
  if (/app_secret|appsecret|password\s*[:=]/i.test(cleaned)) {
    return "Deye rejected the request.";
  }
  return cleaned.slice(0, 300);
}

export function publicFailure(payload) {
  const record = asRecord(payload);
  if (!record) {
    return { code: null, message: scrubText(typeof payload === "string" ? payload : "Deye request failed") || "Deye request failed" };
  }
  const code = record.code ?? null;
  const message = scrubText(typeof record.msg === "string" ? record.msg : typeof record.message === "string" ? record.message : "Deye request failed");
  return {
    code: typeof code === "string" || typeof code === "number" ? code : null,
    message: message || "Deye request failed",
  };
}

export function scrubOutbound(value) {
  if (typeof value === "string") return value.replace(JWT, "[redacted]").replace(BEARER, "bearer [redacted]");
  if (Array.isArray(value)) return value.map(scrubOutbound);
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (SECRET_KEY.test(key)) continue;
    out[key] = scrubOutbound(item);
  }
  return out;
}

function asRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}
