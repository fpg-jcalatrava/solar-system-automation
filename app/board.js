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
        Live power figures are shown as Deye returns them. The tool schema does not name a unit; Deye’s own samples treat them as watts.
        Daily generation is energy for the plant’s local date. Deye documents history energy in kilowatt-hours.
        Readings are fetched at most once a minute. This board only reads plants. It does not send inverter commands.
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
        <Stat label="Battery power" value={plant.batteryPower} />
        <Stat label="Charge" value={plant.chargePower} />
        <Stat label="Discharge" value={plant.dischargePower} />
      </div>

      <section className="block">
        <h3>Today</h3>
        <p>{plant.dailyGeneration == null ? "Missing" : `${formatNumber(plant.dailyGeneration)} kWh`}</p>
        {plant.dailyGenerationNote ? <p className="fine">{plant.dailyGenerationNote}</p> : null}
        {plant.dailyDate && plant.dailyDate !== "sample" ? <p className="fine">Local date {plant.dailyDate}</p> : null}
      </section>

      <section className="block">
        <h3>Devices</h3>
        <p>
          {plant.devices.total} total · {plant.devices.online} online · {plant.devices.offline} offline
          {plant.devices.unreported ? ` · ${plant.devices.unreported} without a connect status` : ""}
        </p>
        {plant.devices.groups.map((group) => (
          <p className="fine" key={group.type}>
            {group.type}: {group.online} online, {group.offline} offline
            {group.unreported ? `, ${group.unreported} unreported` : ""}
          </p>
        ))}
        {plant.devices.offlineDevices.map((device) => (
          <p className="fine" key={device.serial}>{device.type} offline · {device.serial}</p>
        ))}
        {plant.devicesError ? <p className="warn">{plant.devicesError}</p> : null}
      </section>

      <section className="block">
        <h3>Alarms</h3>
        {plant.alarmsError ? <p className="warn">{plant.alarmsError}</p> : null}
        {plant.alarms.length === 0 && !plant.alarmsError ? <p>No station alarms in the last day.</p> : null}
        {plant.alarms.map((alarm, index) => (
          <div className="alarm" key={`${alarm.title}-${alarm.startedAt ?? index}`}>
            <strong>{alarm.title}</strong>
            <p className="fine">
              {[levelLabel(alarm.level), alarm.status, alarm.startedLabel || alarm.startedAt].filter(Boolean).join(" · ")}
            </p>
            {alarm.detail ? <p className="fine">{alarm.detail}</p> : null}
          </div>
        ))}
      </section>
    </article>
  );
}

function Stat({ label, value }) {
  return (
    <div className="stat">
      <dt>{label}</dt>
      <dd>{formatNumber(value)}</dd>
    </div>
  );
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
