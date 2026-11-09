import { FALLBACK_TIMEZONE } from "./config.js";

const STALE_MS = 60 * 60 * 1000;

export function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function asRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}

export function numberOrNull(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

export function localDate(timeZone, now = new Date()) {
  const zone = safeZone(timeZone);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function coerceDate(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value > 1e12 ? value : value > 1e9 ? value * 1000 : NaN;
    if (!Number.isFinite(ms)) return null;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "string") {
    const numeric = Number(value);
    if (value.trim() !== "" && Number.isFinite(numeric) && /^\d+(\.\d+)?$/.test(value.trim())) {
      return coerceDate(numeric);
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

export function formatWhen(value, timeZone) {
  const date = value instanceof Date ? value : coerceDate(value);
  if (!date) return null;
  const zone = safeZone(timeZone);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function isStale(value, now = new Date()) {
  const date = coerceDate(value);
  if (!date) return null;
  return now.getTime() - date.getTime() > STALE_MS;
}

export function summarizeDevices(items) {
  const groups = new Map();
  let online = 0;
  let offline = 0;
  let unreported = 0;
  const offlineDevices = [];
  for (const item of asArray(items)) {
    const type = text(item?.deviceType) || "Unknown";
    const status = item?.connectStatus ?? item?.connectionStatus;
    let bucket = "unreported";
    if (status === 1 || status === "1") {
      bucket = "online";
      online += 1;
    } else if (status === 0 || status === "0") {
      bucket = "offline";
      offline += 1;
      const serial = text(item?.deviceSn);
      if (serial) offlineDevices.push({ type, serial });
    } else {
      unreported += 1;
    }
    const group = groups.get(type) ?? { type, online: 0, offline: 0, unreported: 0 };
    group[bucket] += 1;
    groups.set(type, group);
  }
  return {
    total: asArray(items).length,
    online,
    offline,
    unreported,
    groups: [...groups.values()],
    offlineDevices: offlineDevices.slice(0, 8),
  };
}

export function pickDailyGeneration(payload, date) {
  const record = asRecord(payload);
  if (!record) return { value: null, note: `No daily generation row for ${date}.` };
  const rows = asArray(record.dailyData ?? record.stationDataItems ?? record.items);
  if (rows.length === 0) {
    const lone = numberOrNull(record.generation ?? record.generationValue);
    if (lone == null) return { value: null, note: `No daily generation row for ${date}.` };
    return { value: lone, note: null };
  }
  const match = rows.find((row) => rowDate(row) === date) ?? (rows.length === 1 ? rows[0] : null);
  if (!match) return { value: null, note: `No daily generation row for ${date}.` };
  const value = numberOrNull(match.generation ?? match.generationValue);
  if (value == null) return { value: null, note: `Daily generation for ${date} is missing.` };
  return { value, note: null };
}

export function toAlarm(item) {
  const record = asRecord(item) ?? {};
  const title = text(record.alertName) || text(record.name) || text(record.alertCode) || "Alarm";
  const level = record.level == null || record.level === "" ? null : String(record.level);
  const status = record.status == null || record.status === "" ? null : String(record.status);
  const started = record.alertStartTime ?? record.startTime ?? null;
  const detail = text(record.description) || text(record.reason) || null;
  return {
    title,
    level,
    status,
    startedAt: started == null || started === "" ? null : String(started),
    detail,
  };
}

export function perInstalledKw(generationKwh, installedKw) {
  if (generationKwh == null || installedKw == null || installedKw <= 0) return null;
  return generationKwh / installedKw;
}

export function shapePlant({ station, latest, latestError, devices, devicesError, alerts, alertsError, daily, now = new Date() }) {
  const source = asRecord(station) ?? {};
  const live = asRecord(latest) ?? {};
  const timezone = text(source.regionTimezone) || FALLBACK_TIMEZONE;
  const lastUpdate = live.lastUpdateTime ?? source.lastUpdateTime ?? null;
  const installedCapacity = numberOrNull(source.installedCapacity);
  const dailyGeneration = daily?.value ?? null;
  return {
    id: source.id == null ? "" : String(source.id),
    name: text(source.name) || "Unnamed plant",
    connectionStatus: text(source.connectionStatus) || null,
    installedCapacity,
    timezone,
    lastUpdateTime: lastUpdate == null || lastUpdate === "" ? null : String(lastUpdate),
    lastUpdateLabel: formatWhen(lastUpdate, timezone),
    stale: isStale(lastUpdate, now),
    generationPower: reading(live, "generationPower"),
    consumptionPower: reading(live, "consumptionPower"),
    gridPower: reading(live, "gridPower"),
    purchasePower: reading(live, "purchasePower"),
    batteryPower: reading(live, "batteryPower"),
    chargePower: reading(live, "chargePower"),
    dischargePower: reading(live, "dischargePower"),
    batterySOC: reading(live, "batterySOC"),
    dailyGeneration,
    dailyGenerationPerKw: perInstalledKw(dailyGeneration, installedCapacity),
    dailyGenerationNote: daily?.note ?? null,
    dailyDate: daily?.date ?? null,
    devices: summarizeDevices(devices),
    devicesError: devicesError ?? null,
    alarms: asArray(alerts).map((item) => {
      const alarm = toAlarm(item);
      return { ...alarm, startedLabel: formatWhen(alarm.startedAt, timezone) };
    }).slice(0, 8),
    alarmsError: alertsError ?? null,
    latestError: latestError ?? null,
  };
}

function reading(record, key) {
  if (!Object.prototype.hasOwnProperty.call(record, key)) return null;
  return numberOrNull(record[key]);
}

function rowDate(row) {
  const record = asRecord(row);
  if (!record) return null;
  const direct = text(record.date) || text(record.statDate);
  if (/^\d{4}-\d{2}-\d{2}/.test(direct)) return direct.slice(0, 10);
  const dateTime = text(record.dateTime);
  if (/^\d{4}-\d{2}-\d{2}/.test(dateTime)) return dateTime.slice(0, 10);
  const year = numberOrNull(record.year);
  const month = numberOrNull(record.month);
  const day = numberOrNull(record.day);
  if (year && month && day) {
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return null;
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function safeZone(timeZone) {
  const zone = text(timeZone) || FALLBACK_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(new Date());
    return zone;
  } catch {
    return "UTC";
  }
}
