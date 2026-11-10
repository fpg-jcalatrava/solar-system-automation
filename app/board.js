"use client";

import { useEffect, useRef, useState } from "react";
import { batteryFlow, formatNumber, formatSoc, levelLabel, statusTone } from "../lib/format.js";

export function Board({ initial, viewer }) {
  const [data, setData] = useState(initial);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState("");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState(() => plantKey(initial.plants[0]));

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
  const plants = data.plants.filter((plant) => plantMatches(plant, query));

  useEffect(() => {
    if (!query.trim() || plants.length !== 1) return;
    setOpenId(plantKey(plants[0]));
  }, [query, data.plants]);

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

      <label className="search">
        <span className="sr">Search plants</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search plants, places, or devices"
          aria-label="Search plants"
        />
      </label>

      <Compare plants={plants} />

      <section className="grid">
        {plants.length === 0 ? <p className="empty">No plants match that search.</p> : null}
        {plants.map((plant) => {
          const key = plantKey(plant);
          return (
            <Plant
              key={key}
              plant={plant}
              open={openId === key}
              onToggle={() => setOpenId((current) => current === key ? null : key)}
            />
          );
        })}
      </section>

      <p className="footnote">
        Live power and irradiance are shown as Deye returns them. Those tool schemas do not name a unit; Deye’s own power samples are in watts.
        Today’s energy figures are for the plant’s local date. Deye documents that energy in kilowatt-hours, and full-load hours as hours.
        Device points keep the name and unit Deye sends. Readings are fetched at most once a minute. This board only reads plants. It does not send inverter commands.
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
            {plant.dailyGenerationPerKw == null ? null : (
              <p className="fine">{formatNumber(plant.dailyGenerationPerKw, 2)} kWh per installed kW</p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function plantKey(plant) {
  if (!plant) return null;
  return plant.id || plant.name;
}

function plantMatches(plant, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const devices = plant.devices?.rows ?? [];
  const haystack = [
    plant.name,
    plant.id,
    plant.location,
    plant.ownerName,
    plant.gridType,
    plant.connectionStatus,
    ...devices.flatMap((device) => [device.type, device.serial]),
  ].filter(Boolean).join(" ").toLowerCase();
  return haystack.includes(needle);
}

function Plant({ plant, open, onToggle }) {
  const [openDevice, setOpenDevice] = useState(null);
  const deviceAlarms = openDevice
    ? plant.deviceAlarms.filter((alarm) => alarm.source === openDevice.serial)
    : [];
  const identity = [
    plant.id ? `Plant ${plant.id}` : null,
    plant.installedCapacity == null ? null : `${formatNumber(plant.installedCapacity)} kW installed`,
    plant.timezone,
  ].filter(Boolean).join(" · ");
  const place = [plant.location, plant.gridType, plant.ownerName, plant.operatingSince ? `Operating since ${plant.operatingSince}` : null].filter(Boolean).join(" · ");
  const status = plant.connectionStatus;
  const battery = batteryFlow(plant.batteryPower);
  const panelId = `plant-panel-${plantKey(plant)}`;
  return (
    <article className={open ? "plant open" : "plant"}>
      <h2>
        <button
          type="button"
          className="accordion-toggle"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
        >
          <span className="chevron" aria-hidden="true" />
          <span className="accordion-copy">
            <span className="title-row">
              <span className="plant-name">{plant.name}</span>
              {status ? (
                <span className={`status ${statusTone(status)}`}>
                  <span className="dot" aria-hidden="true" />
                  {status}
                </span>
              ) : null}
            </span>
            <span className="accordion-summary">
              {hasReading(plant.generationPower) ? <span>{formatNumber(plant.generationPower)} power</span> : null}
              {hasReading(plant.batterySOC) ? <span>{formatSoc(plant.batterySOC)} charge</span> : null}
              {hasReading(plant.dailyGeneration) ? <span>{formatNumber(plant.dailyGeneration)} kWh today</span> : null}
              {plant.lastUpdateLabel ? <span>Updated {plant.lastUpdateLabel}</span> : null}
            </span>
          </span>
        </button>
      </h2>

      {open ? <div className="accordion-panel" id={panelId}>
      {identity ? <p className="fine">{identity}</p> : null}
      {place ? <p className="fine">{place}</p> : null}
      {plant.stale === true ? <p className="warn">More than an hour old. The plant may be offline or delayed.</p> : null}
      {plant.latestError ? <p className="warn">{plant.latestError}</p> : null}

      <section className="block">
        <h3>Current data</h3>
        <div className="spotlight">
          {hasReading(plant.generationPower) ? (
            <div className="tile energy">
              <div className="tile-head">
                <span className="metric-icon" aria-hidden="true"><GenerationIcon /></span>
                <p className="kicker">Generation</p>
              </div>
              <p className="figure">{formatNumber(plant.generationPower)} <span>power</span></p>
            </div>
          ) : null}
          {hasReading(plant.consumptionPower) ? (
            <div className="tile use">
              <div className="tile-head">
                <span className="metric-icon" aria-hidden="true"><ConsumptionIcon /></span>
                <p className="kicker">Consumption</p>
              </div>
              <p className="figure">{formatNumber(plant.consumptionPower)} <span>power</span></p>
            </div>
          ) : null}
          {hasReading(plant.batterySOC) ? <SocGauge value={plant.batterySOC} /> : null}
          {hasReading(plant.batteryPower) ? (
            <div className="tile flow">
              <div className="tile-head">
                <span className="metric-icon" aria-hidden="true"><BatteryPowerIcon /></span>
                <p className="kicker">Battery power</p>
              </div>
              <p className={`figure ${battery.tone}`}>{formatNumber(plant.batteryPower)}</p>
              <p className={`flow-state ${battery.tone}`}>
                <span className="dot" aria-hidden="true" />
                {battery.label}
              </p>
            </div>
          ) : null}
        </div>
      </section>

      <div className="stats">
        <Stat label="Grid" value={plant.gridPower} />
        <Stat label="Purchase" value={plant.purchasePower} />
        <Stat label="Irradiance" value={plant.irradiateIntensity} />
      </div>

      <section className="block">
        <div className="block-head">
          <h3>Today</h3>
          {plant.dailyDate && plant.dailyDate !== "sample" ? <p className="fine">Local date {plant.dailyDate}</p> : null}
        </div>
        {plant.dailyGenerationNote && !/missing|no daily row/i.test(plant.dailyGenerationNote) ? <p className="fine">{plant.dailyGenerationNote}</p> : null}
        <DailyTable rows={[
          ["Generation", plant.daily.generation, "kWh"],
          ["Consumption", plant.daily.consumption, "kWh"],
          ["Battery charge", plant.daily.batteryCharge, "kWh"],
          ["Battery discharge", plant.daily.batteryDischarge, "kWh"],
          ["Grid purchase", plant.daily.gridPurchase, "kWh"],
          ["Grid export", plant.daily.gridExport, "kWh"],
          ["To load", plant.daily.toLoad, "kWh"],
          ["To battery", plant.daily.toBattery, "kWh"],
          ["To grid", plant.daily.toGrid, "kWh"],
          ["Full-load hours", plant.daily.fullPowerHours, "h"],
        ]} />
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
                {device.serial ? <span className="serial">{device.serial}</span> : null}
              </span>
              <span className={`status ${statusTone(device.link)}`}>
                <span className="dot" aria-hidden="true" />
                {device.link}
              </span>
              {devicePreview(device) ? <span className="device-preview">{devicePreview(device)}</span> : null}
            </button>
          ))}
        </div>
        {openDevice ? (
          <DeviceModal device={openDevice} alarms={deviceAlarms} onClose={() => setOpenDevice(null)} />
        ) : null}
      </section>

      <AlarmList title="Station alarms" alarms={plant.alarms} error={plant.alarmsError} empty="No station alarms in the last day." />
      <AlarmList title="Device alarms" alarms={plant.deviceAlarms} error={plant.deviceAlarmsError} empty="No device alarms in the last day." />
      </div> : null}
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
            {device.serial ? <p className="serial">{device.serial}</p> : null}
          </div>
          <button className="dialog-close" type="button" onClick={() => dialogRef.current?.close()}>Close</button>
        </header>
        <dl className="dialog-facts">
          <div>
            <dt>Connect</dt>
            <dd>{device.link}</dd>
          </div>
          {device.collectionLabel ? (
            <div>
              <dt>Collected</dt>
              <dd>{device.collectionLabel}</dd>
            </div>
          ) : null}
        </dl>
        {device.points.some((point) => point.value != null && point.value !== "") ? <h4>Readings</h4> : null}
        {device.points.some((point) => point.value != null && point.value !== "") ? (
          <div className="points">
            {device.points.filter((point) => point.value != null && point.value !== "").map((point) => (
              <p key={`${device.serial}-${point.key}`} className="point">
                <span>{point.key}</span>
                <strong>{`${formatPoint(point.value)}${point.unit ? ` ${point.unit}` : ""}`}</strong>
              </p>
            ))}
          </div>
        ) : null}
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
  const points = device.points.filter((point) => point.value != null && point.value !== "");
  if (points.length === 0) return "";
  const first = points[0];
  const more = points.length > 1 ? ` +${points.length - 1}` : "";
  return `${first.key} ${formatPoint(first.value)}${first.unit ? ` ${first.unit}` : ""}${more}`;
}

function hasReading(value) {
  return value != null && value !== "" && !Number.isNaN(value);
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

function GenerationIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="3.2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10 2.5v2.2M10 15.3v2.2M2.5 10h2.2M15.3 10h2.2M4.7 4.7l1.6 1.6M13.7 13.7l1.6 1.6M15.3 4.7l-1.6 1.6M6.3 13.7l-1.6 1.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ConsumptionIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M3.5 9.2 10 3.8l6.5 5.4V16a1.2 1.2 0 0 1-1.2 1.2H4.7A1.2 1.2 0 0 1 3.5 16V9.2Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M8 17.2v-4.2h4v4.2" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function SocIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="3" y="5.5" width="12" height="9" rx="1.8" stroke="currentColor" strokeWidth="1.6" />
      <path d="M15 8.2h1.2A1.3 1.3 0 0 1 17.5 9.5v1a1.3 1.3 0 0 1-1.3 1.3H15" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5.5 10h5.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function BatteryPowerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M11.2 2.8 5.2 11h4.1L8.6 17.2 14.8 8.6H10.6L11.2 2.8Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
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
      <div className="tile-head">
        <span className="metric-icon" aria-hidden="true"><SocIcon /></span>
        <p className="kicker">State of charge</p>
      </div>
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

function DailyTable({ rows }) {
  const visible = rows.filter(([, value]) => hasReading(value) || (typeof value === "string" && value !== ""));
  if (visible.length === 0) return null;
  const mid = Math.ceil(visible.length / 2);
  const pairs = visible.slice(0, mid).map((left, index) => [left, visible[mid + index] ?? null]);
  return (
    <div className="table-wrap">
      <table className="daily">
        <thead>
          <tr>
            <th scope="col">Reading</th>
            <th scope="col">Value</th>
            <th scope="col">Reading</th>
            <th scope="col">Value</th>
          </tr>
        </thead>
        <tbody>
          {pairs.map(([left, right]) => (
            <tr key={left[0]}>
              <th scope="row">{left[0]}</th>
              <td><DailyValue value={left[1]} unit={left[2]} /></td>
              {right ? <th scope="row">{right[0]}</th> : <td />}
              {right ? <td><DailyValue value={right[1]} unit={right[2]} /></td> : <td />}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DailyValue({ value, unit }) {
  return <>{typeof value === "string" ? value : formatNumber(value)}{unit ? <span className="unit">{unit}</span> : null}</>;
}

function Stat({ label, value, unit }) {
  if (!hasReading(value) && !(typeof value === "string" && value !== "")) return null;
  const shown = typeof value === "string" ? value : formatNumber(value);
  return (
    <div className="stat">
      <p className="kicker">{label}</p>
      <p className="value">
        {shown}
        {unit ? <span className="unit">{unit}</span> : null}
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
