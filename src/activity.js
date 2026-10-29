// the activity section: the log, a day at a time, newest first.
//
// the same thing done again and again in a row is one line with a count:
// saving a comment five times while typing it out, or a link opened twice,
// used to be five lines, or two "signed in" a third of a second apart. a
// line is folded into the one above it when the same person did the same
// thing to the same card, with nothing else in between, on the same day.
//
// nothing is fetched until the section is first opened. after that, a line
// written anywhere arrives over realtime and joins the top.

import { STATE_STARTED, STATE_WATCHED } from "./cards.js";
import { formatISOForUI } from "./dates.js";
import { remoteFetchLogs } from "./db.js";
import { onSectionChange } from "./router.js";

const LIST_ID = "logsList";
const MORE_ID = "logsMore";

// a page is bigger than a screen: folding repeats makes it shorter
const PAGE_SIZE = 50;

const LS_WHO = "logWho";

// every line fetched so far, newest first, and where the next page starts
let entries = [];
let cursorTs = null;
let hasMore = true;
let loading = false;
let loaded = false;
let failed = false;

// raised by every fresh start, so a page asked for before it is dropped when
// it arrives: a switch from vlad to vika must not land vlad's lines in hers
let generation = 0;

// everyone, vlad or vika
function who() {
  const el = document.querySelector('input[name="log-who"]:checked');
  return el ? el.id.replace("log-who-", "") : "all";
}

/* ---------------------------
   ONE LINE IN WORDS
---------------------------- */

const OWNERS = ["vlad", "vika"];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function userSpan(user) {
  const known = OWNERS.includes(user) ? user : "";
  return el("span", `log-user ${known}`, known ? known[0].toUpperCase() + known.slice(1) : "Someone");
}

const titleEm = text => el("em", "log-title", text || "unknown title");

// a change of watch dates in words
function describeWatchDates(state, startIso, endIso) {
  const s = String(startIso || "").trim();
  const e = String(endIso || "").trim();

  if (!s && !e) return "removed watch dates";
  if (state === STATE_STARTED) return `set start date to ${formatISOForUI(s)}`;

  const word = state === STATE_WATCHED ? "watch date" : "date";
  if (s && e && s !== e) return `set ${word}s to ${formatISOForUI(s)} – ${formatISOForUI(e)}`;
  return `set ${word} to ${formatISOForUI(s || e)}`;
}

// built node by node: every title in here was typed by one of us
function describe(entry) {
  const user = String(entry.user_name || "").toLowerCase();
  const d = entry.details || {};
  const title = d.title;
  const parts = [userSpan(user)];
  const say = (...more) => parts.push(...more.map(m => (typeof m === "string" ? document.createTextNode(m) : m)));

  switch (entry.action) {
    case "login":
      say(" signed in.");
      break;
    case "rate":
      say(" rated ", titleEm(title), " ", el("span", `log-score ${OWNERS.includes(user) ? user : ""}`, `${d.score ?? "—"}/10`), " hearts!");
      break;
    case "comment":
      say(" left a comment on ", titleEm(title));
      break;
    case "add_card":
      say(" added ", titleEm(title));
      break;
    case "edit_title":
      say(" renamed ", titleEm(d.from || "unknown"), " to ", titleEm(d.to || "unknown"));
      break;
    case "set_state":
      say(" changed state of ", titleEm(title), ` from ${d.from || "—"} to ${d.to || "—"}.`);
      break;
    case "set_status":
      say(" changed status of ", titleEm(title), ` from ${d.from || "—"} to ${d.to || "—"}.`);
      break;
    case "set_watch_dates":
      say(" ", describeWatchDates(d.state, d.to_start, d.to_end), " of ", titleEm(title));
      break;
    case "delete_card":
      say(" deleted ", titleEm(title));
      break;
    // no longer written, but the earliest lines still hold it
    case "edit_card":
      say(" saved changes on ", titleEm(title));
      break;
    default:
      say(` did ${entry.action}.`);
  }

  return parts;
}

/* ---------------------------
   DAYS AND RUNS
---------------------------- */

const dayKey = date => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

const WEEKDAY = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric" });
const WEEKDAY_YEAR = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" });
const TIME = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

function dayTitle(date) {
  const now = new Date();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);

  if (dayKey(date) === dayKey(now)) return "today";
  if (dayKey(date) === dayKey(yesterday)) return "yesterday";
  return (date.getFullYear() === now.getFullYear() ? WEEKDAY : WEEKDAY_YEAR).format(date).toLowerCase();
}

// what makes two lines the same thing done again
const sameThing = (a, b) =>
  a.user_name === b.user_name &&
  a.action === b.action &&
  (a.card_id ?? null) === (b.card_id ?? null) &&
  (a.card_id != null || a.details?.title === b.details?.title);

// the lines, newest first, as days of runs: [{ date, runs: [[newest, ...older]] }]
function group(lines) {
  const days = [];

  for (const entry of lines) {
    const date = new Date(entry.ts);
    let day = days.at(-1);
    if (!day || dayKey(day.date) !== dayKey(date)) {
      day = { date, runs: [] };
      days.push(day);
    }

    const run = day.runs.at(-1);
    if (run && sameThing(run[0], entry)) run.push(entry);
    else day.runs.push([entry]);
  }

  return days;
}

/* ---------------------------
   DRAWING
---------------------------- */

function runItem(run) {
  const newest = run[0];

  const li = el("li", "log-item");
  li.dataset.key = String(newest.id);
  li.dataset.count = String(run.length);

  const time = el("time", "log-time", TIME.format(new Date(newest.ts)));
  time.dateTime = newest.ts;

  const text = el("p", "log-text");
  text.append(...describe(newest));

  // the times of the others go in the tooltip of the count
  if (run.length > 1) {
    const count = el("span", "log-count", `×${run.length}`);
    count.title = run.map(r => TIME.format(new Date(r.ts))).join(", ");
    text.append(" ", count);
  }

  li.append(time, text);
  return li;
}

function note(text) {
  const li = el("li", "log-note", text);
  return li;
}

function draw() {
  const list = document.getElementById(LIST_ID);
  if (!list) return;

  const days = group(entries);

  if (failed && !entries.length) {
    list.replaceChildren(note("could not load the activity. reload to try again"));
  } else if (!entries.length && !hasMore) {
    list.replaceChildren(note(who() === "all" ? "no activity yet" : `nothing from ${who()} yet`));
  } else {
    list.replaceChildren(...days.map(day => {
      const li = el("li", "log-day");
      const head = el("h3", "log-day-title", dayTitle(day.date));
      const runs = el("ul", "log-runs");
      runs.append(...day.runs.map(runItem));
      li.append(head, runs);
      return li;
    }));
  }

  const more = document.getElementById(MORE_ID);
  if (more) {
    more.disabled = loading || !hasMore;
    more.textContent = loading ? "loading..." : hasMore ? "load more" : "no more";
  }
}

/* ---------------------------
   FETCHING
---------------------------- */

async function loadPage({ reset = false } = {}) {
  if (reset) {
    generation += 1;
    entries = [];
    cursorTs = null;
    hasMore = true;
    failed = false;
    loading = false;
  }
  if (loading || !hasMore) return;

  const gen = generation;
  loading = true;
  draw();

  const filter = who();
  const { data, error } = await remoteFetchLogs(PAGE_SIZE, cursorTs, filter === "all" ? null : filter);
  if (gen !== generation) return;
  loading = false;

  if (error || !data) {
    failed = true;
    hasMore = false;
    draw();
    return;
  }

  entries.push(...data);
  cursorTs = data.at(-1)?.ts ?? cursorTs;
  hasMore = data.length === PAGE_SIZE;
  draw();
}

// everything again, from the newest line: on sign-in or out, and after the
// socket was down and lines may have come and gone unseen
export function reloadActivity() {
  if (loaded) loadPage({ reset: true });
}

// a line written somewhere, just now
export function addLiveLogEntry(row) {
  if (!loaded || entries.some(e => e.id === row.id)) return;

  const filter = who();
  if (filter !== "all" && row.user_name !== filter) return;

  entries.unshift(row);
  entries.sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
  draw();
}

export function initializeActivity() {
  // the corner panel this section replaces remembered whether it was open
  localStorage.removeItem("logsOpen");

  const saved = document.getElementById(`log-who-${localStorage.getItem(LS_WHO)}`);
  if (saved) saved.checked = true;

  document.querySelectorAll('input[name="log-who"]').forEach(input => {
    input.addEventListener("change", () => {
      localStorage.setItem(LS_WHO, who());
      loadPage({ reset: true });
    });
  });

  document.getElementById(MORE_ID)?.addEventListener("click", () => loadPage());

  onSectionChange(section => {
    if (section !== "activity" || loaded) return;
    loaded = true;
    loadPage({ reset: true });
  });
}
