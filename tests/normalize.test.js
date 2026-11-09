import assert from "node:assert/strict";
import test from "node:test";
import { localDate, pickDailyGeneration, pickDailySummary, shapePlant, summarizeDevices } from "../lib/normalize.js";

test("null power stays missing and a negative battery value is kept", () => {
  const plant = shapePlant({
    station: { id: 41, name: "Fixture", connectionStatus: "NORMAL", installedCapacity: 5, regionTimezone: "Asia/Manila" },
    latest: { generationPower: null, batteryPower: -15, batterySOC: 50, consumptionPower: 0 },
    devices: [{ deviceType: "INVERTER", connectStatus: 1 }, { deviceType: "COLLECTOR", connectStatus: 0, deviceSn: "SN1" }],
    alerts: [{ alertName: "Grid", level: 2, alertStartTime: 1_700_000_000 }],
    daily: { value: 4, note: null, date: "2026-11-09" },
    now: new Date("2026-11-09T04:00:00Z"),
  });
  assert.equal(plant.generationPower, null);
  assert.equal(plant.batteryPower, -15);
  assert.equal(plant.consumptionPower, 0);
  assert.equal(plant.purchasePower, null);
  assert.equal(plant.dailyGenerationPerKw, 0.8);
  assert.equal(plant.devices.online, 1);
  assert.equal(plant.devices.offline, 1);
  assert.equal(plant.alarms[0].level, "2");
  assert.equal(plant.alarms[0].title, "Grid");
  assert.match(plant.alarms[0].startedLabel, /2023/);
  assert.notEqual(plant.alarms[0].startedLabel, "1700000000");
});

test("daily energy keeps the split Deye returns and does not treat null as zero", () => {
  const summary = pickDailySummary({
    dailyData: [{
      date: "2026-11-09",
      generation: 11.5,
      consumption: null,
      gridExport: 1,
      generationUsage: { toGrid: 1 },
      batteryChargeSource: { fromPv: 2, fromGrid: 0 },
    }],
  }, "2026-11-09");
  assert.equal(summary.generation, 11.5);
  assert.equal(summary.consumption, null);
  assert.equal(summary.gridExport, 1);
  assert.equal(summary.toGrid, 1);
  assert.equal(summary.chargeFromPv, 2);
  assert.equal(summary.chargeFromGrid, 0);
});

test("daily generation prefers the matching local date and does not treat null as zero", () => {
  const picked = pickDailyGeneration({
    dailyData: [
      { date: "2026-11-08", generation: 9 },
      { date: "2026-11-09", generation: null },
    ],
  }, "2026-11-09");
  assert.equal(picked.value, null);
  assert.match(picked.note, /missing/);
  const history = pickDailyGeneration({
    stationDataItems: [{ year: 2026, month: 11, day: 9, generationValue: 6.5 }],
  }, "2026-11-09");
  assert.equal(history.value, 6.5);
});

test("device connect status uses 1 and 0 only", () => {
  const summary = summarizeDevices([
    { deviceType: "BATTERY", deviceState: 1 },
    { deviceType: "INVERTER", connectStatus: "1" },
  ]);
  assert.equal(summary.online, 1);
  assert.equal(summary.unreported, 1);
});

test("local date uses the plant timezone", () => {
  assert.equal(localDate("Asia/Manila", new Date("2026-11-08T16:30:00Z")), "2026-11-09");
});
