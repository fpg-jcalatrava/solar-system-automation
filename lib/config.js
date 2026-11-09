// Account email and data center are server settings. App id, app secret,
// and the Deye password come only from the environment.

export const ACCOUNT_EMAIL = "home.jcalatrava@gmail.com";
export const DATA_CENTER = "eu";
export const MCP_URL = "https://developer.deyecloud.com/openmcp/mcp";
export const FALLBACK_TIMEZONE = "Asia/Manila";
export const CACHE_TTL_MS = 60_000;

export function readCredentials() {
  const appId = readEnv("DEYE_APP_ID");
  const appSecret = readEnv("DEYE_APP_SECRET");
  const password = readEnv("DEYE_ACCOUNT_PASSWORD");
  return {
    configured: appId !== "" && appSecret !== "" && password !== "",
    appId,
    appSecret,
    password,
  };
}

function readEnv(name) {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}
