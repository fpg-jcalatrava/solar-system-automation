import assert from "node:assert/strict";
import test from "node:test";
import { assertReadOnly } from "../lib/allowlist.js";

test("read tools used by the board are allowed", () => {
  for (const name of [
    "get_access_token",
    "account_info",
    "list_stations",
    "get_station_latest",
    "list_station_devices",
    "station_alert_list",
    "get_station_generation_days",
    "station_history",
  ]) {
    assert.doesNotThrow(() => assertReadOnly(name, {}));
  }
});

test("control, registration, and plant creation are blocked", () => {
  for (const name of [
    "station_create",
    "device_register",
    "device_add_logger",
    "device_delete_logger",
    "order_sys_work_mode_update",
    "order_custom_control",
    "strategy_dynamic_control",
    "order_battery_type_update",
  ]) {
    assert.throws(() => assertReadOnly(name, {}), /Blocked Deye tool/);
  }
});

test("call_deye_api can only request a business token", () => {
  assert.doesNotThrow(() => assertReadOnly("call_deye_api", {
    method: "POST",
    path: "/v1.0/account/token",
  }));
  assert.throws(() => assertReadOnly("call_deye_api", {
    method: "POST",
    path: "/v1.0/station/create",
  }), /Blocked Deye call/);
  assert.throws(() => assertReadOnly("call_deye_api", {
    method: "GET",
    path: "/v1.0/account/token",
  }), /Blocked Deye call/);
});
