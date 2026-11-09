import { createHash } from "node:crypto";
import { ACCOUNT_EMAIL, CACHE_TTL_MS, DATA_CENTER, readCredentials } from "./config.js";
import { getClient } from "./mcp.js";
import {
  asArray,
  localDate,
  numberOrNull,
  pickDailyGeneration,
  shapePlant,
} from "./normalize.js";
import { scrubOutbound, scrubText } from "./redact.js";
import { sampleDashboard } from "./sample.js";

let cache = { at: 0, data: null };
let inflight = null;

export function resetDashboardCache() {
  cache = { at: 0, data: null };
  inflight = null;
}

export async function loadDashboard(options = {}) {
  const now = options.now ?? Date.now;
  const t = now();
  if (!options.fresh && !options.call && cache.data && t - cache.at < CACHE_TTL_MS) {
    return { ...cache.data, cached: true };
  }
  if (!options.fresh && !options.call && inflight) return inflight;
  const run = compute(options).then((data) => scrubOutbound(data));
  if (!options.fresh && !options.call) {
    inflight = run.finally(() => {
      inflight = null;
    });
    const data = await inflight;
    cache = { at: t, data };
    return { ...data, cached: false };
  }
  return { ...(await run), cached: false };
}

async function compute(options) {
  const creds = options.creds ?? readCredentials();
  if (!creds.configured) return sampleDashboard(options.clock ? new Date(options.clock()) : new Date());
  const call = options.call ?? ((name, args) => getClient().call(name, args));
  try {
    return await loadLive(creds, call, options.clock ? new Date(options.clock()) : new Date());
  } catch {
    return base({
      ok: false,
      error: { code: null, message: "Deye request failed" },
      plants: [],
      notice: null,
    });
  }
}

export async function loadLive(creds, call, now = new Date()) {
  const tokenResult = await call("get_access_token", {
    app_id: creds.appId,
    app_secret: creds.appSecret,
    email: ACCOUNT_EMAIL,
    password: creds.password,
    data_center: DATA_CENTER,
  });
  if (!tokenResult.ok) {
    return base({
      ok: false,
      error: failureOf(tokenResult),
      plants: [],
      notice: null,
      now,
    });
  }
  let token = extractToken(tokenResult.data);
  if (!token) {
    return base({
      ok: false,
      error: { code: tokenResult.code ?? null, message: "Login did not return a token" },
      plants: [],
      notice: null,
      now,
    });
  }

  let notice = null;
  const info = await call("account_info", { access_token: token, data_center: DATA_CENTER });
  if (info.ok) {
    const org = asArray(info.data?.orgInfoList).map(withCompany).find(Boolean) ?? null;
    if (org) {
      const second = await call("call_deye_api", {
        method: "POST",
        path: "/v1.0/account/token",
        query: { appId: creds.appId },
        body: {
          appSecret: creds.appSecret,
          email: ACCOUNT_EMAIL,
          password: sha256(creds.password),
          companyId: org.companyId,
        },
        data_center: DATA_CENTER,
        require_auth: false,
      });
      const next = second.ok ? extractToken(second.data) : null;
      if (next) {
        token = next;
        notice = org.companyName ? `Business login for ${org.companyName}.` : "Business login.";
      } else {
        notice = `Business token was not issued (${failureOf(second).code ?? "error"} ${failureOf(second).message}). Showing the personal login.`;
      }
    }
  }

  const listed = await listAllStations(call, token);
  if (!listed.ok) {
    return base({ ok: false, error: failureOf(listed), plants: [], notice, now });
  }
  const plants = await Promise.all(listed.stations.map(async (station) => {
    try {
      return await loadPlant(call, token, station, now);
    } catch {
      return shapePlant({
        station,
        latest: null,
        latestError: "Deye request failed",
        devices: [],
        devicesError: null,
        alerts: [],
        alertsError: null,
        daily: { value: null, note: "Daily generation unavailable.", date: null },
        now,
      });
    }
  }));
  return base({
    ok: true,
    error: null,
    notice: plants.length === 0 ? joinNotice(notice, `No plants on this account in ${DATA_CENTER}.`) : notice,
    plants,
    now,
  });
}

async function loadPlant(call, token, station, now) {
  const id = station?.id;
  const timezone = typeof station?.regionTimezone === "string" && station.regionTimezone ? station.regionTimezone : "Asia/Manila";
  const date = localDate(timezone, now);
  const end = Math.floor(now.getTime() / 1000);
  const start = end - 24 * 60 * 60;
  const [latest, devices, alerts, daily] = await Promise.all([
    call("get_station_latest", { station_id: id, access_token: token, data_center: DATA_CENTER }),
    listDevices(call, token, id),
    listAlerts(call, token, id, start, end),
    loadDaily(call, token, id, date),
  ]);
  return shapePlant({
    station,
    latest: latest.ok ? latestBody(latest.data) : null,
    latestError: latest.ok ? null : formatFailure(latest),
    devices: devices.items,
    devicesError: devices.error,
    alerts: alerts.items,
    alertsError: alerts.error,
    daily,
    now,
  });
}

async function listAllStations(call, token) {
  const stations = [];
  let total = Infinity;
  for (let page = 1; page <= 5 && stations.length < total; page += 1) {
    const result = await call("list_stations", {
      page,
      size: 20,
      access_token: token,
      data_center: DATA_CENTER,
    });
    if (!result.ok) return result;
    const batch = asArray(result.data?.stationList ?? result.data?.list);
    total = numberOrNull(result.data?.total) ?? batch.length;
    stations.push(...batch);
    if (batch.length === 0) break;
  }
  return { ok: true, stations };
}

async function listDevices(call, token, stationId) {
  const items = [];
  let total = Infinity;
  let error = null;
  for (let page = 1; page <= 3 && items.length < total; page += 1) {
    const result = await call("list_station_devices", {
      station_id: stationId,
      page,
      size: 100,
      access_token: token,
      data_center: DATA_CENTER,
    });
    if (!result.ok) {
      error = formatFailure(result);
      break;
    }
    const batch = asArray(result.data?.deviceListItems ?? result.data?.deviceList);
    total = numberOrNull(result.data?.total) ?? items.length + batch.length;
    items.push(...batch);
    if (batch.length === 0) break;
  }
  return { items, error };
}

async function listAlerts(call, token, stationId, startTimestamp, endTimestamp) {
  const items = [];
  let total = Infinity;
  let error = null;
  for (let page = 1; page <= 2 && items.length < total; page += 1) {
    const result = await call("station_alert_list", {
      body: { stationId, startTimestamp, endTimestamp, page, size: 50 },
      access_token: token,
      data_center: DATA_CENTER,
    });
    if (!result.ok) {
      error = formatFailure(result);
      break;
    }
    const batch = asArray(result.data?.stationAlertItems ?? result.data?.alertList);
    total = numberOrNull(result.data?.total) ?? items.length + batch.length;
    items.push(...batch);
    if (batch.length === 0) break;
  }
  items.sort((a, b) => (numberOrNull(b?.alertStartTime) ?? 0) - (numberOrNull(a?.alertStartTime) ?? 0));
  return { items, error };
}

async function loadDaily(call, token, stationId, date) {
  const primary = await call("get_station_generation_days", {
    station_id: stationId,
    start_date: date,
    end_date: date,
    access_token: token,
    data_center: DATA_CENTER,
  });
  if (primary.ok) return { ...pickDailyGeneration(primary.data, date), date };
  const history = await call("station_history", {
    body: { stationId, granularity: 2, startAt: date, endAt: date },
    page: 1,
    size: 5,
    access_token: token,
    data_center: DATA_CENTER,
  });
  if (!history.ok) {
    return { value: null, note: `Daily generation unavailable (${formatFailure(primary)}).`, date };
  }
  const picked = pickDailyGeneration(history.data, date);
  return { ...picked, date };
}

function latestBody(data) {
  if (!data || typeof data !== "object") return null;
  if ("generationPower" in data || "batterySOC" in data || "lastUpdateTime" in data) return data;
  if (data.data && typeof data.data === "object") return data.data;
  return data;
}

function extractToken(data) {
  const record = data && typeof data === "object" ? data : null;
  if (!record) return null;
  const nested = record.data && typeof record.data === "object" ? record.data : null;
  const raw = record.accessToken ?? record.access_token ?? nested?.accessToken ?? nested?.access_token;
  if (typeof raw !== "string") return null;
  const token = raw.replace(/^bearer\s+/i, "").trim();
  return token || null;
}

function withCompany(org) {
  if (!org || typeof org !== "object") return null;
  const companyId = numberOrNull(org.companyId);
  if (companyId == null) return null;
  const companyName = typeof org.companyName === "string" ? org.companyName.trim() : "";
  return { companyId, companyName };
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function failureOf(result) {
  return {
    code: result?.code ?? null,
    message: scrubText(result?.message || "Deye request failed") || "Deye request failed",
  };
}

function formatFailure(result) {
  const failure = failureOf(result);
  return failure.code == null ? failure.message : `${failure.code}: ${failure.message}`;
}

function joinNotice(left, right) {
  return [left, right].filter(Boolean).join(" ");
}

function base({ ok, error, notice, plants, now = new Date() }) {
  return {
    source: "live",
    ok,
    accountEmail: ACCOUNT_EMAIL,
    dataCenter: DATA_CENTER,
    fetchedAt: now.toISOString(),
    cached: false,
    error,
    notice,
    plants,
  };
}
