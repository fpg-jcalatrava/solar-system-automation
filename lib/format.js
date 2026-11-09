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

export function batteryHint(value) {
  if (value == null) return "Battery power is missing.";
  if (value < 0) return "Negative battery power. Deye samples treat that as charging.";
  if (value > 0) return "Positive battery power. Deye samples treat that as discharging.";
  return "Battery power is zero.";
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
