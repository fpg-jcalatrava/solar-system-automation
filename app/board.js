"use client";

import { useEffect, useState } from "react";
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
            <p className="account">
              {data.accountEmail} · {viewer}
              {fetched ? ` · Updated ${fetched}` : ""}
              {data.cached ? " · Held for a minute" : ""}
            </p>
          </div>
        </div>
        <div className="actions">
          <span className={`pill ${data.ok && data.source === "live" ? "live" : data.ok ? "sample" : "error"}`}>
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
    <section className="compare">
      <div>
        <h2>Today, side by side</h2>
        {rows.map((plant) => (
          <p key={plant.id || plant.name}>
            {plant.name}: {formatNumber(plant.dailyGeneration)} kWh
            {plant.dailyGenerationPerKw == null ? "" : ` · ${formatNumber(plant.dailyGenerationPerKw, 2)} kWh per installed kW`}
          </p>
        ))}
      </div>
    </section>
  );
}

function Plant({ plant }) {
  const soc = plant.batterySOC;
  const width = soc == null ? 0 : Math.max(0, Math.min(100, soc));
  return (
    <article className="plant">
      <header>
        <div>
          <h2>{plant.name}</h2>
          <p className="meta">
            {plant.id ? `Plant ${plant.id}` : "Plant id missing"}
            {plant.installedCapacity == null ? "" : ` · ${formatNumber(plant.installedCapacity)} kW installed`}
            {plant.timezone ? ` · ${plant.timezone}` : ""}
          </p>
          <p className="fine">
            {[plant.location, plant.gridType, plant.ownerName, plant.operatingSince ? `Operating since ${plant.operatingSince}` : null].filter(Boolean).join(" · ") || "Place details were not in the plant list."}
          </p>
        </div>
        <span className={`status ${statusTone(plant.connectionStatus)}`}>
          {plant.connectionStatus || "Status missing"}
        </span>
      </header>

      {plant.stale === true ? <p className="warn">Last update is more than an hour old. The plant may be offline or delayed.</p> : null}
      {plant.stale === null ? <p className="fine">Last update time is missing.</p> : null}
      {plant.lastUpdateLabel ? <p className="fine">Last update {plant.lastUpdateLabel}</p> : null}
      {plant.latestError ? <p className="warn">{plant.latestError}</p> : null}

      <div className="hero">
        <div>
          <p className="eyebrow">Generation</p>
          <p className="figure">{formatNumber(plant.generationPower)} <span>power</span></p>
        </div>
        <div className="soc">
          <div className="soc-top">
            <span>Battery</span>
            <strong>{formatSoc(soc)}</strong>
          </div>
          <div className="track" aria-hidden="true"><div className="fill" style={{ width: `${width}%` }} /></div>
          <p className="hint">{batteryHint(plant.batteryPower)} {plant.batteryPower == null ? "" : formatNumber(plant.batteryPower)}</p>
        </div>
      </div>

      <div className="stats">
        <Stat label="Consumption" value={plant.consumptionPower} />
        <Stat label="Grid" value={plant.gridPower} />
        <Stat label="Purchase" value={plant.purchasePower} />
        <Stat label="Wire" value={plant.wirePower} />
        <Stat label="Irradiance" value={plant.irradiateIntensity} />
        <Stat label="Battery power" value={plant.batteryPower} />
        <Stat label="Charge" value={plant.chargePower} />
        <Stat label="Discharge" value={plant.dischargePower} />
      </div>

      <section className="block">
        <h3>Today</h3>
        {plant.dailyDate && plant.dailyDate !== "sample" ? <p className="fine">Local date {plant.dailyDate}</p> : null}
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
        {plant.daily.peakPeriod ? <p className="fine">Peak period {plant.daily.peakPeriod}</p> : null}
      </section>

      <section className="block">
        <h3>Devices</h3>
        <p>
          {plant.devices.total} total · {plant.devices.online} online · {plant.devices.offline} offline
          {plant.devices.unreported ? ` · ${plant.devices.unreported} without a connect status` : ""}
        </p>
        {plant.devicesError ? <p className="warn">{plant.devicesError}</p> : null}
        {plant.deviceLatestError ? <p className="warn">{plant.deviceLatestError}</p> : null}
        {plant.devices.rows.map((device) => (
          <div className="device" key={device.serial || device.type}>
            <p>
              <strong>{device.type}</strong>
              {device.serial ? ` · ${device.serial}` : ""}
              {` · ${device.link}`}
            </p>
            {device.collectionLabel ? <p className="fine">Collected {device.collectionLabel}</p> : null}
            {device.sampleNote ? <p className="fine">{device.sampleNote}</p> : null}
            {device.points.length > 0 ? (
              <div className="points">
                {device.points.map((point) => (
                  <p key={`${device.serial}-${point.key}`} className="point">
                    <span>{point.key}</span>
                    <strong>{point.value == null ? "Missing" : `${formatPoint(point.value)}${point.unit ? ` ${point.unit}` : ""}`}</strong>
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </section>

      <AlarmList title="Station alarms" alarms={plant.alarms} error={plant.alarmsError} empty="No station alarms in the last day." />
      <AlarmList title="Device alarms" alarms={plant.deviceAlarms} error={plant.deviceAlarmsError} empty="No device alarms in the last day." />
    </article>
  );
}

function AlarmList({ title, alarms, error, empty }) {
  return (
    <section className="block">
      <h3>{title}</h3>
      {error ? <p className="warn">{error}</p> : null}
      {alarms.length === 0 && !error ? <p>{empty}</p> : null}
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
      <dt>{label}</dt>
      <dd>{shown}{!missing && unit ? ` ${unit}` : ""}</dd>
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
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
      <circle cx="13" cy="13" r="5" fill="currentColor" />
      <path d="M13 2v3M13 21v3M2 13h3M21 13h3M5 5l2 2M19 19l2 2M19 7l2-2M5 21l2-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
