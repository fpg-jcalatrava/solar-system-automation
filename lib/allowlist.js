// Tools this app is allowed to call. Control, registration, and plant
// creation stay off the list. call_deye_api is locked to the business
// login path so it cannot reach a write endpoint.

export const READ_TOOLS = new Set([
  "get_access_token",
  "account_info",
  "list_stations",
  "get_station_latest",
  "list_station_devices",
  "station_alert_list",
  "get_station_generation_days",
  "station_history",
  "call_deye_api",
]);

const BUSINESS_TOKEN_PATH = "/v1.0/account/token";

export function assertReadOnly(name, args) {
  if (!READ_TOOLS.has(name)) {
    const error = new Error("Blocked Deye tool");
    error.code = "blocked_tool";
    throw error;
  }
  if (name !== "call_deye_api") return;
  const method = String(args?.method ?? "").toUpperCase();
  const path = String(args?.path ?? "");
  if (method !== "POST" || path !== BUSINESS_TOKEN_PATH) {
    const error = new Error("Blocked Deye call");
    error.code = "blocked_tool";
    throw error;
  }
}
