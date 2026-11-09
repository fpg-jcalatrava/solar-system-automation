import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { readFileSync } from "node:fs";
import { loadDashboard, loadLive, resetDashboardCache } from "../lib/dashboard.js";
import { ACCOUNT_EMAIL, DATA_CENTER } from "../lib/config.js";

function creds() {
  return {
    configured: true,
    appId: "x".repeat(8),
    appSecret: "y".repeat(8),
    password: "z".repeat(8),
  };
}

function scripted(handlers) {
  const calls = [];
  const call = async (name, args) => {
    calls.push({ name, args });
    const handler = handlers[name];
    if (!handler) return { ok: false, code: "unstubbed", message: "unstubbed", data: null };
    return handler(args);
  };
  return { call, calls };
}

test("missing credentials serve two labeled sample plants and do not call Deye", async () => {
  let called = false;
  const data = await loadDashboard({
    fresh: true,
    creds: { configured: false, appId: "", appSecret: "", password: "" },
    call: async () => {
      called = true;
      return { ok: false, code: null, message: "should not run", data: null };
    },
  });
  assert.equal(called, false);
  assert.equal(data.source, "sample");
  assert.equal(data.plants.length, 2);
  assert.match(data.notice, /Sample data/);
  assert.equal(data.plants[0].name, "Sample north roof");
  assert.equal(data.plants[1].connectionStatus, "ALL_OFFLINE");
});

test("a live read asks only for token, stations, latest, devices, alarms, and today", async () => {
  const now = new Date("2026-11-08T16:30:00Z");
  const { call, calls } = scripted({
    get_access_token: async () => ({ ok: true, code: 1000000, data: { accessToken: "Bearer sample-token-value", success: true } }),
    account_info: async () => ({ ok: true, code: 1000000, data: { orgInfoList: [], success: true } }),
    list_stations: async () => ({
      ok: true,
      data: {
        total: 2,
        stationList: [
          { id: 101, name: "House", connectionStatus: "NORMAL", installedCapacity: 5, regionTimezone: "Asia/Manila" },
          { id: 102, name: "Shop", connectionStatus: "NORMAL", installedCapacity: 8, regionTimezone: "Asia/Manila", generationPower: 10 },
        ],
      },
    }),
    get_station_latest: async (args) => ({
      ok: true,
      data: {
        generationPower: args.station_id === 101 ? 1500 : null,
        consumptionPower: 400,
        gridPower: 20,
        purchasePower: 0,
        batteryPower: args.station_id === 101 ? -40 : 10,
        chargePower: 40,
        dischargePower: 0,
        batterySOC: 70,
        lastUpdateTime: Math.floor(now.getTime() / 1000),
      },
    }),
    list_station_devices: async () => ({
      ok: true,
      data: { total: 1, deviceListItems: [{ deviceSn: "SN-1", deviceType: "INVERTER", connectStatus: 1 }] },
    }),
    station_alert_list: async () => ({ ok: true, data: { total: 0, stationAlertItems: [] } }),
    get_station_generation_days: async () => ({
      ok: true,
      data: {
        dailyData: [{
          date: "2026-11-09",
          generation: 11.5,
          consumption: 7,
          batteryCharge: 2,
          gridPurchase: 0.5,
          gridExport: 1.5,
          generationUsage: { toLoad: 6, toBattery: 2, toGrid: 1.5 },
          batteryChargeSource: { fromPv: 2, fromGrid: 0 },
          fullPowerHours: 2.3,
        }],
      },
    }),
    device_latest: async (args) => ({
      ok: true,
      data: {
        deviceDataList: [{
          deviceSn: args.body.deviceList[0],
          deviceState: 1,
          dataList: [{ key: "AC Voltage L1", unit: "V", value: 230 }],
        }],
      },
    }),
    device_alert_list: async () => ({ ok: true, data: { alertList: [], total: 0 } }),
  });
  const data = await loadLive(creds(), call, now);
  assert.equal(data.ok, true);
  assert.equal(data.source, "live");
  assert.equal(data.plants.length, 2);
  assert.equal(data.plants[0].generationPower, 1500);
  assert.equal(data.plants[1].generationPower, null);
  assert.equal(data.plants[0].dailyGeneration, 11.5);
  assert.equal(data.plants[0].daily.consumption, 7);
  assert.equal(data.plants[0].daily.toLoad, 6);
  assert.equal(data.plants[0].daily.chargeFromPv, 2);
  assert.equal(data.plants[0].devices.online, 1);
  assert.equal(data.plants[0].devices.rows[0].points[0].unit, "V");
  const names = calls.map((entry) => entry.name);
  assert.deepEqual(new Set(names), new Set([
    "get_access_token",
    "account_info",
    "list_stations",
    "get_station_latest",
    "list_station_devices",
    "device_latest",
    "device_alert_list",
    "station_alert_list",
    "get_station_generation_days",
  ]));
  const login = calls.find((entry) => entry.name === "get_access_token").args;
  assert.equal(login.email, ACCOUNT_EMAIL);
  assert.equal(login.data_center, DATA_CENTER);
  assert.equal(typeof login.password, "string");
  const latest = calls.find((entry) => entry.name === "get_station_latest").args;
  assert.equal(latest.access_token, "sample-token-value");
  const body = JSON.stringify(data);
  assert.equal(body.includes("sample-token-value"), false);
  assert.equal(body.includes(creds().appSecret), false);
  assert.equal(body.includes(creds().password), false);
});

test("a business member gets a second token on the account path only", async () => {
  const secret = creds();
  const { call, calls } = scripted({
    get_access_token: async () => ({ ok: true, data: { accessToken: "personal-token-value" } }),
    account_info: async () => ({ ok: true, data: { orgInfoList: [{ companyId: 44, companyName: "Fixture Co" }] } }),
    call_deye_api: async () => ({ ok: true, data: { accessToken: "company-token-value" } }),
    list_stations: async () => ({ ok: true, data: { total: 0, stationList: [] } }),
  });
  const data = await loadLive(secret, call, new Date("2026-11-09T02:00:00Z"));
  assert.equal(data.ok, true);
  assert.match(data.notice, /Fixture Co/);
  const business = calls.find((entry) => entry.name === "call_deye_api");
  assert.equal(business.args.method, "POST");
  assert.equal(business.args.path, "/v1.0/account/token");
  assert.equal(business.args.body.companyId, 44);
  assert.equal(business.args.body.password, createHash("sha256").update(secret.password, "utf8").digest("hex"));
  assert.notEqual(business.args.body.password, secret.password);
  const stations = calls.find((entry) => entry.name === "list_stations");
  assert.equal(stations.args.access_token, "company-token-value");
  assert.equal(JSON.stringify(data).includes("company-token-value"), false);
});

test("login failure returns code and message without the password", async () => {
  const secret = creds();
  const { call, calls } = scripted({
    get_access_token: async () => ({ ok: false, code: 2101008, message: "account not found", data: null }),
  });
  const data = await loadLive(secret, call, new Date());
  assert.equal(data.ok, false);
  assert.deepEqual(data.error, { code: 2101008, message: "account not found" });
  assert.equal(calls.length, 1);
  assert.equal(JSON.stringify(data).includes(secret.password), false);
});

test("generation falls back to station history when the daily tool fails", async () => {
  const { call, calls } = scripted({
    get_access_token: async () => ({ ok: true, data: { accessToken: "sample-token-value" } }),
    account_info: async () => ({ ok: true, data: { orgInfoList: [] } }),
    list_stations: async () => ({
      ok: true,
      data: { total: 1, stationList: [{ id: 7, name: "One", regionTimezone: "Asia/Manila", installedCapacity: 4 }] },
    }),
    get_station_latest: async () => ({ ok: true, data: { generationPower: 1, batterySOC: 10, lastUpdateTime: 1_762_600_000 } }),
    list_station_devices: async () => ({ ok: true, data: { total: 0, deviceListItems: [] } }),
    station_alert_list: async () => ({ ok: true, data: { total: 0, stationAlertItems: [] } }),
    get_station_generation_days: async () => ({ ok: false, code: 2101012, message: "unavailable", data: null }),
    station_history: async (args) => {
      assert.equal(args.body.granularity, 2);
      assert.equal(args.body.startAt, args.body.endAt);
      return { ok: true, data: { stationDataItems: [{ generationValue: 8, year: 2026, month: 11, day: 9 }] } };
    },
  });
  const data = await loadLive(creds(), call, new Date("2026-11-08T16:30:00Z"));
  assert.equal(data.plants[0].dailyGeneration, 8);
  assert.ok(calls.some((entry) => entry.name === "station_history"));
});

test("the board cache waits a minute before calling again", async () => {
  resetDashboardCache();
  const empty = { configured: false, appId: "", appSecret: "", password: "" };
  const first = await loadDashboard({ creds: empty, now: () => 10_000 });
  const second = await loadDashboard({ creds: empty, now: () => 20_000 });
  const third = await loadDashboard({ creds: empty, now: () => 80_000 });
  assert.equal(second.cached, true);
  assert.equal(second.fetchedAt, first.fetchedAt);
  assert.equal(third.cached, false);
  resetDashboardCache();
});

test("the browser bundle does not read Deye credentials", () => {
  const source = readFileSync(new URL("../app/board.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /DEYE_|process\.env|lib\/dashboard|lib\/mcp/);
});
