export function formatNumber(value, digits = 1) {
  if (value == null || Number.isNaN(value)) return "Missing";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(value);
}

export function formatSoc(value) {
  if (value == null || Number.isNaN(value)) return "Missing";
  const number = formatNumber(value);
  if (value >= 0 && value <= 100) return `${number}%`;
  return number;
}

export function batteryFlow(value) {
  if (value == null || Number.isNaN(value)) return null;
  if (value < 0) return { label: "Charging", tone: "charging" };
  if (value > 0) return { label: "Discharging", tone: "discharging" };
  return { label: "Idle", tone: "idle" };
}

export function levelLabel(level) {
  if (level == null || level === "") return null;
  return /^-?\d+(\.\d+)?$/.test(String(level)) ? `Level ${level}` : String(level);
}

export function statusTone(status) {
  const value = String(status ?? "").toUpperCase();
  if (!value) return "neutral";
  if (value.includes("OFFLINE")) return "bad";
  if (value === "NORMAL" || value.includes("ONLINE")) return "good";
  return "neutral";
}
