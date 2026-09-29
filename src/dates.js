// dates as the database stores them, yyyy-mm-dd, and as the page shows them.

const DATE_PLACEHOLDER_UI = "xx/xx/xxxx";

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

// a yyyy-mm-dd string as local midnight, or null. the time is added on
// purpose: new Date("2026-09-23") alone is read as utc, which lands on the day
// before anywhere west of greenwich
export function parseISODate(value) {
  if (!value) return null;

  const trimmed = value.trim();

  // anything else is not a date this site wrote
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;

  const date = new Date(`${trimmed}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;

  return date;
}

// mm/dd/yyyy, the way the whole page shows dates
export function formatISOForUI(value) {
  const date = parseISODate(value);
  if (!date) return DATE_PLACEHOLDER_UI;
  return DATE_FORMATTER.format(date);
}
