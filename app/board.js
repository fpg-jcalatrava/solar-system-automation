"use client";

import { useEffect, useRef, useState } from "react";
import { batteryHint, formatNumber, formatSoc, levelLabel, statusTone } from "../lib/format.js";

export function Board({ initial, viewer }) {
  const [data, setData] = useState(initial);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState("");

  async function refresh() {
    setPending(true);
    setProblem("");
    try {
      const response = await fetch("/api/plants", { cache: "no-store" });
      if (response.status === 401) {
        setProblem("Sign in to view plants.");
        return;
      }
      if (!response.ok) {
        setProblem("The board could not refresh.");
        return;
      }
      setData(await response.json());
    } catch {
      setProblem("The board could not refresh.");
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 90_000);
    return () => clearInterval(timer);
  }, []);

  const fetched = formatStamp(data.fetchedAt);
  return (
    <main className="shell">
      <header className="top">
        <div className="brand">
          <div className="mark" aria-hidden="true">
            <Sun />
          </div>
          <div>
            <p className="eyebrow">Deye Cloud · {data.dataCenter}</p>
            <h1>Plant watch</h1>
          </div>
        </div>
        <p className="account">
          <span>{data.accountEmail}</span>
          <span>{viewer}</span>
          {fetched ? <span>Updated {fetched}</span> : null}
          {data.cached ? <span>Held for a minute</span> : null}
        </p>
        <div className="actions">
          <span className={`pill ${data.ok && data.source === "live" ? "live" : data.ok ? "sample" : "error"}`}>
            <span className="dot" aria-hidden="true" />
            {data.source === "sample" ? "Sample data" : data.ok ? "Live" : "Deye error"}
          </span>
          <button className="refresh" type="button" onClick={refresh} disabled={pending}>
            {pending ? "Refreshing" : "Refresh"}
          </button>
        </div>
      </header>

      {data.notice ? <div className={`banner ${data.source === "sample" ? "sample" : ""}`}><p>{data.notice}</p></div> : null}
      {data.error ? (
        <div className="banner error" role="alert">
          <p>{data.error.code == null ? data.error.message : `${data.error.code}: ${data.error.message}`}</p>
        </div>
      ) : null}
      {problem ? <div className="banner error" role="alert"><p>{problem}</p></div> : null}

      <Compare plants={data.plants} />

      <section className="grid">
        {data.plants.map((plant) => <Plant key={plant.id || plant.name} plant={plant} />)}
      </section>

      <p className="footnote">
        Live power and irradiance are shown as Deye returns them. Those tool schemas do not name a unit; Deye’s own power samples are in watts.
        Today’s energy figures are for the plant’s local date. Deye documents that energy in kilowatt-hours, and full-load hours as hours.
        Device points keep the name and unit Deye sends. A null reading is shown as missing. Readings are fetched at most once a minute. This board only reads plants. It does not send inverter commands.
      </p>
    </main>
  );
}

function Compare({ plants }) {
  const rows = plants.filter((plant) => plant.dailyGeneration != null);
  if (rows.length < 2) return null;
  return (
    <section className="compare" aria-label="Today, side by side">
      <h2>Today, side by side</h2>
      <div className="compare-grid">
        {rows.map((plant) => (
          <article key={plant.id || plant.name} className="compare-card">
            <p className="kicker">{plant.name}</p>
            <p className="metric">{formatNumber(plant.dailyGeneration)} <span>kWh</span></p>
            <p className="fine">
              {plant.dailyGenerationPerKw == null ? "Yield per installed kW is missing" : `${formatNumber(plant.dailyGenerationPerKw, 2)} kWh per installed kW`}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function Plant({ plant }) {
  const [openDevice, setOpenDevice] = useState(null);
  const deviceAlarms = openDevice
    ? plant.deviceAlarms.filter((alarm) => alarm.source === openDevice.serial)
    : [];
  return (
    <article className="plant">
      <header className="plant-head">
        <div>
          <div className="title-row">
            <h2>{plant.name}</h2>
            <span className={`status ${statusTone(plant.connectionStatus)}`}>
              <span className="dot" aria-hidden="true" />
              {plant.connectionStatus || "Status missing"}
            </span>
          </div>
          <p className="fine">
            {plant.id ? `Plant ${plant.id}` : "Plant id missing"}
            {plant.installedCapacity == null ? "" : ` · ${formatNumber(plant.installedCapacity)} kW installed`}
            {plant.timezone ? ` · ${plant.timezone}` : ""}
          </p>
          <p className="fine">
            {[plant.location, plant.gridType, plant.ownerName, plant.operatingSince ? `Operating since ${plant.operatingSince}` : null].filter(Boolean).join(" · ") || "Place details were not in the plant list."}
          </p>
        </div>
        <div className="when">
          {plant.lastUpdateLabel ? <p>Last update {plant.lastUpdateLabel}</p> : null}
          {plant.stale === true ? <p className="warn">More than an hour old. The plant may be offline or delayed.</p> : null}
          {plant.stale === null ? <p className="fine">Last update time is missing.</p> : null}
        </div>
      </header>

      {plant.latestError ? <p className="warn">{plant.latestError}</p> : null}

      <div className="spotlight">
        <div className="tile energy">
          <p className="kicker">Generation</p>
          <p className="figure">{formatNumber(plant.generationPower)} <span>power</span></p>
          <p className="fine">Live output</p>
        </div>
        <SocGauge value={plant.batterySOC} />
        <div className="tile">
          <p className="kicker">Battery power</p>
          <p className="figure quiet">{formatNumber(plant.batteryPower)}</p>
          <p className="fine">{batteryHint(plant.batteryPower)}</p>
        </div>
      </div>

      <div className="stats">
        <Stat label="Consumption" value={plant.consumptionPower} />
        <Stat label="Grid" value={plant.gridPower} />
        <Stat label="Purchase" value={plant.purchasePower} />
        <Stat label="Wire" value={plant.wirePower} />
        <Stat label="Irradiance" value={plant.irradiateIntensity} />
        <Stat label="Charge" value={plant.chargePower} />
        <Stat label="Discharge" value={plant.dischargePower} />
      </div>

      <section className="block">
        <div className="block-head">
          <h3>Today</h3>
          {plant.dailyDate && plant.dailyDate !== "sample" ? <p className="fine">Local date {plant.dailyDate}</p> : null}
        </div>
        {plant.dailyGenerationNote ? <p className="fine">{plant.dailyGenerationNote}</p> : null}
        <div className="stats">
          <Stat label="Generation" value={plant.daily.generation} unit="kWh" />
          <Stat label="Consumption" value={plant.daily.consumption} unit="kWh" />
          <Stat label="Battery charge" value={plant.daily.batteryCharge} unit="kWh" />
          <Stat label="Battery discharge" value={plant.daily.batteryDischarge} unit="kWh" />
          <Stat label="Grid purchase" value={plant.daily.gridPurchase} unit="kWh" />
          <Stat label="Grid export" value={plant.daily.gridExport} unit="kWh" />
          <Stat label="To load" value={plant.daily.toLoad} unit="kWh" />
          <Stat label="To battery" value={plant.daily.toBattery} unit="kWh" />
          <Stat label="To grid" value={plant.daily.toGrid} unit="kWh" />
          <Stat label="Charge from PV" value={plant.daily.chargeFromPv} unit="kWh" />
          <Stat label="Charge from grid" value={plant.daily.chargeFromGrid} unit="kWh" />
          <Stat label="Full-load hours" value={plant.daily.fullPowerHours} unit="h" />
        </div>
        {plant.daily.peakPeriod ? <p className="fine peak">Peak period {plant.daily.peakPeriod}</p> : null}
      </section>

      <section className="block">
        <div className="block-head">
          <h3>Devices</h3>
          <p className="fine">
            {plant.devices.total} total · {plant.devices.online} online · {plant.devices.offline} offline
            {plant.devices.unreported ? ` · ${plant.devices.unreported} without a connect status` : ""}
          </p>
        </div>
        {plant.devicesError ? <p className="warn">{plant.devicesError}</p> : null}
        {plant.deviceLatestError ? <p className="warn">{plant.deviceLatestError}</p> : null}
        {plant.devices.rows.length === 0 ? <p className="empty">No devices in the plant list.</p> : null}
        <div className="device-grid">
          {plant.devices.rows.map((device) => (
            <button
              key={device.serial || device.type}
              type="button"
              className={`device-card ${device.link}`}
              onClick={() => setOpenDevice(device)}
            >
              <span className="device-icon" aria-hidden="true"><DeviceIcon type={device.type} /></span>
              <span className="device-copy">
                <span className="device-name">{device.type}</span>
                {device.serial ? <span className="serial">{device.serial}</span> : <span className="serial">Serial missing</span>}
              </span>
              <span className={`status ${statusTone(device.link)}`}>
                <span className="dot" aria-hidden="true" />
                {device.link}
              </span>
              <span className="device-preview">{devicePreview(device)}</span>
            </button>
          ))}
        </div>
        {openDevice ? (
          <DeviceModal device={openDevice} alarms={deviceAlarms} onClose={() => setOpenDevice(null)} />
        ) : null}
      </section>

      <AlarmList title="Station alarms" alarms={plant.alarms} error={plant.alarmsError} empty="No station alarms in the last day." />
      <AlarmList title="Device alarms" alarms={plant.deviceAlarms} error={plant.deviceAlarmsError} empty="No device alarms in the last day." />
    </article>
  );
}

function DeviceModal({ device, alarms, onClose }) {
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    function handleClose() {
      onCloseRef.current();
    }
    dialog.addEventListener("close", handleClose);
    return () => {
      dialog.removeEventListener("close", handleClose);
      if (dialog.open) dialog.close();
    };
  }, []);

  const titleId = `device-${device.serial || device.type}`;
  return (
    <dialog
      ref={dialogRef}
      className="device-dialog"
      aria-labelledby={titleId}
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
    >
      <div className="dialog-card">
        <header className="dialog-head">
          <span className={`device-icon ${device.link}`} aria-hidden="true"><DeviceIcon type={device.type} /></span>
          <div>
            <p className="kicker">Device</p>
            <h3 id={titleId}>{device.type}</h3>
            <p className="serial">{device.serial || "Serial missing"}</p>
          </div>
          <button className="dialog-close" type="button" onClick={() => dialogRef.current?.close()}>Close</button>
        </header>
        <dl className="dialog-facts">
          <div>
            <dt>Connect</dt>
            <dd>{device.link}</dd>
          </div>
          <div>
            <dt>Collected</dt>
            <dd>{device.collectionLabel || "Missing"}</dd>
          </div>
        </dl>
        {device.sampleNote ? <p className="fine">{device.sampleNote}</p> : null}
        <h4>Readings</h4>
        {device.points.length === 0 ? <p className="empty">No latest sample for this device.</p> : (
          <div className="points">
            {device.points.map((point) => (
              <p key={`${device.serial}-${point.key}`} className="point">
                <span>{point.key}</span>
                <strong>{point.value == null ? "Missing" : `${formatPoint(point.value)}${point.unit ? ` ${point.unit}` : ""}`}</strong>
              </p>
            ))}
          </div>
        )}
        <h4>Alarms</h4>
        {alarms.length === 0 ? <p className="empty">No device alarms in the last day.</p> : alarms.map((alarm, index) => (
          <div className="alarm" key={`${alarm.title}-${alarm.startedAt ?? index}`}>
            <strong>{alarm.title}</strong>
            <p className="fine">
              {[levelLabel(alarm.level), alarm.impact == null ? null : `Impact ${alarm.impact}`, alarm.status, alarm.startedLabel || alarm.startedAt, alarm.endedLabel ? `ended ${alarm.endedLabel}` : null].filter(Boolean).join(" · ")}
            </p>
            {alarm.detail ? <p className="fine">{alarm.detail}</p> : null}
            {alarm.reason ? <p className="fine">Reason: {alarm.reason}</p> : null}
            {alarm.solution ? <p className="fine">Solution: {alarm.solution}</p> : null}
          </div>
        ))}
      </div>
    </dialog>
  );
}

function devicePreview(device) {
  if (device.points.length === 0) return device.sampleNote || "No latest sample";
  const first = device.points[0];
  const value = first.value == null ? "Missing" : `${formatPoint(first.value)}${first.unit ? ` ${first.unit}` : ""}`;
  const more = device.points.length > 1 ? ` +${device.points.length - 1}` : "";
  return `${first.key} ${value}${more}`;
}

function DeviceIcon({ type }) {
  const kind = deviceKind(type);
  if (kind === "inverter") return <InverterIcon />;
  if (kind === "battery") return <BatteryIcon />;
  if (kind === "collector") return <CollectorIcon />;
  if (kind === "meter") return <MeterIcon />;
  return <ChipIcon />;
}

function deviceKind(type) {
  const value = String(type || "").toLowerCase();
  if (value.includes("invert")) return "inverter";
  if (value.includes("batter") || value.includes("bms")) return "battery";
  if (value.includes("collect") || value.includes("logger") || value.includes("dongle")) return "collector";
  if (value.includes("meter")) return "meter";
  return "device";
}

function InverterIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="2.5" y="4" width="15" height="12" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5 10h2.2l1.2-2.4 1.8 4.8 1.2-2.4H15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BatteryIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="3" y="5" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M15 8h1.5A1.5 1.5 0 0 1 18 9.5v1A1.5 1.5 0 0 1 16.5 12H15" stroke="currentColor" strokeWidth="1.6" />
      <path d="M6 10h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function CollectorIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M10 16V9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="10" cy="16" r="1.2" fill="currentColor" />
      <path d="M6.5 11.5a4.5 4.5 0 0 1 7 0M4 9a8 8 0 0 1 12 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function MeterIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="11" r="6" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10 11l3-2.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M7 4h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ChipIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="5" y="5" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 2.5v2.5M12 2.5v2.5M8 15v2.5M12 15v2.5M2.5 8H5M2.5 12H5M15 8h2.5M15 12h2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function SocGauge({ value }) {
  const missing = value == null || Number.isNaN(value);
  const pct = missing ? 0 : Math.max(0, Math.min(100, value));
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const filled = (pct / 100) * circumference;
  return (
    <div className="tile battery" aria-label={`State of charge ${formatSoc(value)}`}>
      <p className="kicker">State of charge</p>
      <div className="gauge">
        <svg viewBox="0 0 72 72" aria-hidden="true">
          <circle className="gauge-track" cx="36" cy="36" r={radius} />
          {missing ? null : (
            <circle
              className="gauge-fill"
              cx="36"
              cy="36"
              r={radius}
              strokeDasharray={`${filled} ${circumference - filled}`}
              transform="rotate(-90 36 36)"
            />
          )}
        </svg>
        <strong>{formatSoc(value)}</strong>
      </div>
    </div>
  );
}

function AlarmList({ title, alarms, error, empty }) {
  return (
    <section className="block">
      <h3>{title}</h3>
      {error ? <p className="warn">{error}</p> : null}
      {alarms.length === 0 && !error ? <p className="empty">{empty}</p> : null}
      {alarms.map((alarm, index) => (
        <div className="alarm" key={`${alarm.source}-${alarm.title}-${alarm.startedAt ?? index}`}>
          <strong>{alarm.title}</strong>
          <p className="fine">
            {[alarm.source, levelLabel(alarm.level), alarm.impact == null ? null : `Impact ${alarm.impact}`, alarm.status, alarm.startedLabel || alarm.startedAt, alarm.endedLabel ? `ended ${alarm.endedLabel}` : null].filter(Boolean).join(" · ")}
          </p>
          {alarm.detail ? <p className="fine">{alarm.detail}</p> : null}
          {alarm.reason ? <p className="fine">Reason: {alarm.reason}</p> : null}
          {alarm.solution ? <p className="fine">Solution: {alarm.solution}</p> : null}
        </div>
      ))}
    </section>
  );
}

function Stat({ label, value, unit }) {
  const missing = value == null || value === "";
  const shown = missing ? "Missing" : typeof value === "string" ? value : formatNumber(value);
  return (
    <div className="stat">
      <p className="kicker">{label}</p>
      <p className={missing ? "value missing" : "value"}>
        {shown}
        {!missing && unit ? <span className="unit">{unit}</span> : null}
      </p>
    </div>
  );
}

function formatPoint(value) {
  return typeof value === "number" ? formatNumber(value) : String(value);
}

function formatStamp(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function Sun() {
  return (
    <svg width="22" height="22" viewBox="0 0 26 26" fill="none">
      <circle cx="13" cy="13" r="4.5" fill="currentColor" />
      <path d="M13 2.5v3M13 20.5v3M2.5 13h3M20.5 13h3M5.2 5.2l2.1 2.1M18.7 18.7l2.1 2.1M18.7 7.3l2.1-2.1M5.2 20.8l2.1-2.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
