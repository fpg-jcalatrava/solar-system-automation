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

export function linkState(value) {
  if (value === 1 || value === "1") return "online";
  if (value === 0 || value === "0") return "offline";
  return "unreported";
}

export function summarizeDevices(items) {
  const groups = new Map();
  let online = 0;
  let offline = 0;
  let unreported = 0;
  const rows = [];
  for (const item of asArray(items)) {
    const type = text(item?.deviceType) || "Unknown";
    const link = linkState(item?.connectStatus ?? item?.connectionStatus);
    if (link === "online") online += 1;
    else if (link === "offline") offline += 1;
    else unreported += 1;
    const group = groups.get(type) ?? { type, online: 0, offline: 0, unreported: 0 };
    group[link] += 1;
    groups.set(type, group);
    const serial = text(item?.deviceSn);
    rows.push({
      type,
      serial,
      link,
      collectionTime: item?.collectionTime ?? null,
    });
  }
  return {
    total: asArray(items).length,
    online,
    offline,
    unreported,
    groups: [...groups.values()],
    rows,
  };
}

export function pickDailySummary(payload, date) {
  const blank = emptyDaily(date);
  const record = asRecord(payload);
  if (!record) return { ...blank, note: `No daily row for ${date}.` };
  const rows = asArray(record.dailyData ?? record.stationDataItems ?? record.items);
  const match = rows.length === 0
    ? record
    : rows.find((row) => rowDate(row) === date) ?? (rows.length === 1 ? rows[0] : null);
  if (!match) return { ...blank, note: `No daily row for ${date}.` };
  const usage = asRecord(match.generationUsage) ?? {};
  const source = asRecord(match.batteryChargeSource) ?? {};
  const generation = numberOrNull(match.generation ?? match.generationValue);
  return {
    date,
    note: generation == null && rows.length === 0 && numberOrNull(record.generation ?? record.generationValue) == null
      ? `No daily row for ${date}.`
      : generation == null ? `Generation for ${date} is missing.` : null,
    generation,
    consumption: numberOrNull(match.consumption ?? match.consumptionValue),
    batteryCharge: numberOrNull(match.batteryCharge ?? match.chargeValue),
    batteryDischarge: numberOrNull(match.batteryDischarge ?? match.dischargeValue),
    gridPurchase: numberOrNull(match.gridPurchase ?? match.purchaseValue),
    gridExport: numberOrNull(match.gridExport ?? match.gridValue),
    fullPowerHours: numberOrNull(match.fullPowerHours),
    toLoad: numberOrNull(usage.toLoad),
    toBattery: numberOrNull(usage.toBattery),
    toGrid: numberOrNull(usage.toGrid),
    chargeFromPv: numberOrNull(source.fromPv),
    chargeFromGrid: numberOrNull(source.fromGrid),
    peakPeriod: text(match.peakPeriod) || null,
  };
}

export function pickDailyGeneration(payload, date) {
  const summary = pickDailySummary(payload, date);
  return { value: summary.generation, note: summary.note };
}

export function toAlarm(item, source = "Station") {
  const record = asRecord(item) ?? {};
  const title = text(record.alertName) || text(record.name) || (record.alertCode == null ? "" : String(record.alertCode)) || "Alarm";
  const level = record.level == null || record.level === "" ? null : String(record.level);
  const impact = record.impact == null || record.impact === "" ? null : String(record.impact);
  const status = record.status == null || record.status === "" ? null : String(record.status);
  const started = record.alertStartTime ?? record.startTime ?? null;
  const ended = record.alertEndTime ?? null;
  return {
    title,
    level,
    impact,
    status,
    startedAt: started == null || started === "" ? null : String(started),
    endedAt: ended == null || ended === "" || ended === 0 ? null : String(ended),
    detail: text(record.description) || null,
    reason: text(record.reason) || null,
    solution: text(record.solution) || null,
    source,
  };
}

export function isBatteryType(type) {
  const value = String(type || "").toLowerCase();
  return value.includes("batter") || value.includes("bms");
}

export function nestRegisteredBatteries(rows) {
  const bySerial = new Map();
  for (const row of rows) {
    if (row.serial && row.serial.length >= 6) bySerial.set(row.serial, row);
  }
  const parentOf = new Map();
  for (const row of rows) {
    if (!isBatteryType(row.type)) continue;
    for (const point of row.points || []) {
      const value = point.value == null ? "" : String(point.value).trim();
      const child = bySerial.get(value);
      if (!child || child.serial === row.serial || !isBatteryType(child.type)) continue;
      if (parentOf.has(child.serial)) continue;
      parentOf.set(child.serial, row.serial);
    }
  }
  const hidden = new Set();
  for (const [child, parent] of parentOf) {
    if (parentOf.get(parent) === child) continue;
    hidden.add(child);
  }
  return rows.filter((row) => !hidden.has(row.serial)).map((row) => ({
    ...row,
    nested: rows.filter((child) => hidden.has(child.serial) && parentOf.get(child.serial) === row.serial),
  }));
}

export function devicePoints(item) {
  const record = asRecord(item) ?? {};
  return asArray(record.dataList).map((point) => {
    const row = asRecord(point) ?? {};
    return {
      key: text(row.key) || "Point",
      value: row.value == null || row.value === "" ? null : row.value,
      unit: text(row.unit) || null,
    };
  });
}

export function perInstalledKw(generationKwh, installedKw) {
  if (generationKwh == null || installedKw == null || installedKw <= 0) return null;
  return generationKwh / installedKw;
}

export function shapePlant({
  station,
  latest,
  latestError,
  devices,
  devicesError,
  alerts,
  alertsError,
  deviceAlerts = [],
  deviceAlertsError = null,
  deviceLatest = [],
  deviceLatestError = null,
  daily,
  now = new Date(),
}) {
  const source = asRecord(station) ?? {};
  const live = asRecord(latest) ?? {};
  const timezone = text(source.regionTimezone) || FALLBACK_TIMEZONE;
  const lastUpdate = live.lastUpdateTime ?? source.lastUpdateTime ?? null;
  const installedCapacity = numberOrNull(source.installedCapacity);
  const summary = daily?.generation != null || daily?.consumption != null || daily?.note
    ? daily
    : { generation: daily?.value ?? null, note: daily?.note ?? null, date: daily?.date ?? null };
  const dailyGeneration = summary.generation ?? null;
  const deviceSummary = summarizeDevices(devices);
  const readings = asArray(deviceLatest);
  const deviceRows = nestRegisteredBatteries(deviceSummary.rows.map((row) => {
    const readingRow = readings.find((item) => text(item?.deviceSn) === row.serial);
    const fromLatest = readingRow ? linkState(readingRow.deviceState) : "unreported";
    const link = row.link === "unreported" ? fromLatest : row.link;
    return {
      ...row,
      link,
      collectionLabel: formatWhen(readingRow?.collectionTime ?? row.collectionTime, timezone),
      points: readingRow ? devicePoints(readingRow) : [],
      sampleNote: readingRow && devicePoints(readingRow).length === 0 ? "No cached latest sample." : null,
      nested: [],
    };
  }));
  return {
    id: source.id == null ? "" : String(source.id),
    name: text(source.name) || "Unnamed plant",
    connectionStatus: text(source.connectionStatus) || null,
    installedCapacity,
    timezone,
    location: text(source.locationAddress) || null,
    gridType: text(source.gridInterconnectionType) || null,
    ownerName: text(source.ownerName) || null,
    operatingSince: formatWhen(source.startOperatingTime, timezone),
    lastUpdateTime: lastUpdate == null || lastUpdate === "" ? null : String(lastUpdate),
    lastUpdateLabel: formatWhen(lastUpdate, timezone),
    stale: isStale(lastUpdate, now),
    generationPower: reading(live, "generationPower"),
    consumptionPower: reading(live, "consumptionPower"),
    gridPower: reading(live, "gridPower"),
    purchasePower: reading(live, "purchasePower"),
    wirePower: reading(live, "wirePower"),
    irradiateIntensity: reading(live, "irradiateIntensity"),
    batteryPower: reading(live, "batteryPower"),
    chargePower: reading(live, "chargePower"),
    dischargePower: reading(live, "dischargePower"),
    batterySOC: reading(live, "batterySOC") ?? numberOrNull(source.batterySOC),
    dailyGeneration,
    dailyGenerationPerKw: perInstalledKw(dailyGeneration, installedCapacity),
    dailyGenerationNote: summary.note ?? null,
    dailyDate: summary.date ?? daily?.date ?? null,
    daily: {
      generation: dailyGeneration,
      consumption: summary.consumption ?? null,
      batteryCharge: summary.batteryCharge ?? null,
      batteryDischarge: summary.batteryDischarge ?? null,
      gridPurchase: summary.gridPurchase ?? null,
      gridExport: summary.gridExport ?? null,
      fullPowerHours: summary.fullPowerHours ?? null,
      toLoad: summary.toLoad ?? null,
      toBattery: summary.toBattery ?? null,
      toGrid: summary.toGrid ?? null,
      chargeFromPv: summary.chargeFromPv ?? null,
      chargeFromGrid: summary.chargeFromGrid ?? null,
      peakPeriod: summary.peakPeriod ?? null,
    },
    devices: {
      ...deviceSummary,
      online: countLink(deviceRows, "online"),
      offline: countLink(deviceRows, "offline"),
      unreported: countLink(deviceRows, "unreported"),
      rows: deviceRows,
    },
    devicesError: devicesError ?? null,
    deviceLatestError: deviceLatestError ?? null,
    alarms: decorateAlarms(alerts, "Station", timezone),
    alarmsError: alertsError ?? null,
    deviceAlarms: asArray(deviceAlerts).flatMap((entry) => decorateAlarms(entry.items, entry.serial || "Device", timezone)),
    deviceAlarmsError: deviceAlertsError ?? null,
    latestError: latestError ?? null,
  };
}

function countLink(rows, link) {
  return rows.reduce((sum, row) => sum + (row.link === link ? 1 : 0) + countLink(row.nested || [], link), 0);
}

function decorateAlarms(items, source, timezone) {
  return asArray(items).map((item) => {
    const alarm = toAlarm(item, source);
    return {
      ...alarm,
      startedLabel: formatWhen(alarm.startedAt, timezone),
      endedLabel: formatWhen(alarm.endedAt, timezone),
    };
  }).slice(0, 12);
}

function emptyDaily(date) {
  return {
    date,
    note: null,
    generation: null,
    consumption: null,
    batteryCharge: null,
    batteryDischarge: null,
    gridPurchase: null,
    gridExport: null,
    fullPowerHours: null,
    toLoad: null,
    toBattery: null,
    toGrid: null,
    chargeFromPv: null,
    chargeFromGrid: null,
    peakPeriod: null,
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
