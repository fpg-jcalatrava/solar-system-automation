import { ACCOUNT_EMAIL, DATA_CENTER } from "./config.js";
import { shapePlant } from "./normalize.js";

export function sampleDashboard(now = new Date()) {
  const recent = new Date(now.getTime() - 2 * 60 * 1000);
  const old = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const alarmStart = new Date(now.getTime() - 5 * 60 * 60 * 1000);
  const north = shapePlant({
    now,
    station: {
      id: "sample-north",
      name: "Sample north roof",
      connectionStatus: "NORMAL",
      installedCapacity: 5.5,
      regionTimezone: "Asia/Manila",
      lastUpdateTime: Math.floor(recent.getTime() / 1000),
    },
    latest: {
      generationPower: 1840,
      consumptionPower: 920,
      gridPower: 210,
      purchasePower: 0,
      batteryPower: -260,
      chargePower: 260,
      dischargePower: 0,
      batterySOC: 76,
      lastUpdateTime: Math.floor(recent.getTime() / 1000),
    },
    devices: [
      { deviceSn: "SAMPLE-INV-N", deviceType: "INVERTER", connectStatus: 1 },
      { deviceSn: "SAMPLE-COL-N", deviceType: "COLLECTOR", connectStatus: 1 },
      { deviceSn: "SAMPLE-BAT-N", deviceType: "BATTERY", connectStatus: 1 },
    ],
    alerts: [],
    daily: { value: 12.4, note: null, date: "sample" },
  });
  const south = shapePlant({
    now,
    station: {
      id: "sample-south",
      name: "Sample south roof",
      connectionStatus: "ALL_OFFLINE",
      installedCapacity: 3.2,
      regionTimezone: "Asia/Manila",
      lastUpdateTime: Math.floor(old.getTime() / 1000),
    },
    latest: {
      generationPower: 0,
      consumptionPower: 140,
      gridPower: null,
      purchasePower: 140,
      batteryPower: 80,
      chargePower: 0,
      dischargePower: 80,
      batterySOC: 41,
      lastUpdateTime: Math.floor(old.getTime() / 1000),
    },
    devices: [
      { deviceSn: "SAMPLE-INV-S", deviceType: "INVERTER", connectStatus: 0 },
      { deviceSn: "SAMPLE-COL-S", deviceType: "COLLECTOR", connectStatus: 0 },
    ],
    alerts: [
      {
        alertName: "Sample grid voltage alarm",
        level: 2,
        status: "open",
        alertStartTime: Math.floor(alarmStart.getTime() / 1000),
        description: "Sample alarm text. This is not a live Deye event.",
      },
    ],
    daily: { value: 3.1, note: null, date: "sample" },
  });
  return {
    source: "sample",
    ok: true,
    accountEmail: ACCOUNT_EMAIL,
    dataCenter: DATA_CENTER,
    fetchedAt: now.toISOString(),
    cached: false,
    error: null,
    notice: "Sample data. Deye credentials are not configured on this server, so these plants are not live.",
    plants: [north, south],
  };
}
