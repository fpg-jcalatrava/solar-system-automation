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
      locationAddress: "Sample address, Laguna",
      gridInterconnectionType: "DISTRIBUTED_FULLY",
      ownerName: "Sample owner",
      startOperatingTime: 1700000000,
      lastUpdateTime: Math.floor(recent.getTime() / 1000),
    },
    latest: {
      generationPower: 1840,
      consumptionPower: 920,
      gridPower: 210,
      purchasePower: 0,
      wirePower: 40,
      irradiateIntensity: 610,
      batteryPower: -260,
      chargePower: 260,
      dischargePower: 0,
      batterySOC: 76,
      lastUpdateTime: Math.floor(recent.getTime() / 1000),
    },
    devices: [
      { deviceSn: "SAMPLE-INV-N", deviceType: "INVERTER", connectStatus: 1, collectionTime: Math.floor(recent.getTime() / 1000) },
      { deviceSn: "SAMPLE-COL-N", deviceType: "COLLECTOR", connectStatus: 1 },
      { deviceSn: "SAMPLE-BAT-N", deviceType: "BATTERY", connectStatus: 1 },
    ],
    deviceLatest: [
      {
        deviceSn: "SAMPLE-INV-N",
        deviceType: "INVERTER",
        deviceState: 1,
        collectionTime: Math.floor(recent.getTime() / 1000),
        dataList: [
          { key: "AC Voltage L1", unit: "V", value: 230.1 },
          { key: "PV Power", unit: "W", value: 1840 },
        ],
      },
      { deviceSn: "SAMPLE-BAT-N", deviceType: "BATTERY", deviceState: 1, dataList: [] },
    ],
    alerts: [],
    daily: {
      date: "sample",
      note: null,
      generation: 12.4,
      consumption: 8.1,
      batteryCharge: 3.2,
      batteryDischarge: 1.1,
      gridPurchase: 0.4,
      gridExport: 2.2,
      fullPowerHours: 2.25,
      toLoad: 6,
      toBattery: 3.2,
      toGrid: 2.2,
      chargeFromPv: 3.2,
      chargeFromGrid: 0,
      peakPeriod: null,
    },
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
        impact: 1,
        status: "open",
        alertStartTime: Math.floor(alarmStart.getTime() / 1000),
        description: "Sample alarm text. This is not a live Deye event.",
        reason: "Sample reason.",
        solution: "Sample solution.",
      },
    ],
    deviceAlerts: [
      {
        serial: "SAMPLE-INV-S",
        items: [
          {
            alertName: "Sample inverter alarm",
            level: 1,
            alertStartTime: Math.floor(alarmStart.getTime() / 1000),
            description: "Sample device alarm. This is not a live Deye event.",
          },
        ],
      },
    ],
    daily: {
      date: "sample",
      note: null,
      generation: 3.1,
      consumption: 4.4,
      batteryCharge: 0.2,
      batteryDischarge: 1.4,
      gridPurchase: 2.1,
      gridExport: null,
      fullPowerHours: 0.97,
      toLoad: null,
      toBattery: null,
      toGrid: null,
      chargeFromPv: null,
      chargeFromGrid: null,
      peakPeriod: null,
    },
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
