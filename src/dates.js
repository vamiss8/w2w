// dates as the database stores them, yyyy-mm-dd, and as the page shows them.

// date format config
const DATE_PLACEHOLDER_UI = "xx/xx/xxxx";

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

// parse ISO date safely (YYYY-MM-DD)
export function parseISODate(value) {
  if (!value) return null;

  const trimmed = value.trim();

  // guard against typos
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;

  const date = new Date(`${trimmed}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;

  return date;
}

// format ISO date for UI (mm/dd/yyyy)
export function formatISOForUI(value) {
  const date = parseISODate(value);
  if (!date) return DATE_PLACEHOLDER_UI;
  return DATE_FORMATTER.format(date);
}
