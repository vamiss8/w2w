// a page of numbers about what we watched, worked out from the cards alone,
// so a guest sees it too: how many, month by month, our hearts, the ones we
// loved most and the ones we saw differently.
//
// one chart, the months, and everything else is a number or a short list:
// a handful of headline figures read better as figures than as bars.

import { LIST_WATCHED, STATE_PLANNED, STATUS_CODES, listOf, normalizeStatusCode, stateOf, titleOf } from "./cards.js";
import { parseISODate } from "./dates.js";
import { currentSection, onSectionChange } from "./router.js";
import { allCards, cardsLoadState, onStoreChange } from "./store.js";

const ROOT_ID = "stats";
const MONTHS = 12;

// the status of a card we already watched, said the way it reads afterwards
const FIRSTS = {
  "00": "new to both of us",
  "01": "vika's first time",
  "10": "vlad's first time",
  "11": "a rewatch for both",
};

const DAY_MS = 24 * 60 * 60 * 1000;

const MONTH = new Intl.DateTimeFormat("en-US", { month: "short" });
const MONTH_YEAR = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// when a watched card was finished: the last day of a series, the one day of
// a film. a card with neither date is counted, but in no month
function finishedOn(row) {
  return parseISODate(row.end_date) || parseISODate(row.start_date);
}

const scored = (row, who) => (row[`${who}_score`] || 0) > 0;
const average = list => list.reduce((sum, n) => sum + n, 0) / list.length;
const oneDecimal = n => (Math.round(n * 10) / 10).toFixed(1);

/* ---------------------------
   THE PIECES
---------------------------- */

function tile(label, value, note = "") {
  const box = el("div", "stat-tile");
  box.append(el("p", "stat-label", label), el("p", "stat-value", String(value)));
  if (note) box.append(el("p", "stat-note", note));
  return box;
}

function block(title, ...children) {
  const box = el("section", "stat-block");
  box.append(el("h3", "stat-title", title), ...children);
  return box;
}

// the last twelve months, this one included, oldest first
function monthBuckets(watched) {
  const now = new Date();
  const months = [];
  for (let i = MONTHS - 1; i >= 0; i -= 1) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ start, count: 0 });
  }

  for (const row of watched) {
    const date = finishedOn(row);
    if (!date) continue;
    const month = months.find(m => m.start.getFullYear() === date.getFullYear() && m.start.getMonth() === date.getMonth());
    if (month) month.count += 1;
  }

  return months;
}

// a column per month, one colour: there is one series, so no legend, and the
// title says what it counts. the tallest month and this one carry their
// number; every other one says it on hover or focus, and the table under the
// chart has them all
function monthChart(months) {
  const max = Math.max(1, ...months.map(m => m.count));
  const tallest = months.reduce((best, m) => (m.count > best.count ? m : best), months[0]);
  const latest = months.at(-1);

  const chart = el("div", "chart");
  const bars = el("ul", "chart-bars");
  bars.setAttribute("aria-label", "watched together, month by month");

  for (const month of months) {
    const name = MONTH_YEAR.format(month.start).toLowerCase();
    const item = el("li", "chart-col");
    item.tabIndex = 0;
    item.setAttribute("aria-label", `${name}: ${month.count} watched`);

    const bar = el("span", "chart-bar");
    bar.style.setProperty("--share", String(month.count / max));
    if (month.count === 0) bar.classList.add("is-empty");

    if (month.count > 0 && (month === tallest || month === latest)) {
      bar.append(el("span", "chart-value", String(month.count)));
    }

    const tip = el("span", "chart-tip");
    tip.append(el("strong", "", `${month.count} watched`), el("span", "", name));

    item.append(bar, el("span", "chart-month", MONTH.format(month.start).toLowerCase()), tip);
    bars.appendChild(item);
  }

  chart.appendChild(bars);

  // the same numbers, readable without a pointer
  const table = el("details", "chart-table");
  table.appendChild(el("summary", "", "as a table"));
  const t = el("table");
  const head = el("tr");
  head.append(el("th", "", "month"), el("th", "", "watched"));
  t.appendChild(head);
  for (const month of months) {
    const tr = el("tr");
    tr.append(el("td", "", MONTH_YEAR.format(month.start).toLowerCase()), el("td", "", String(month.count)));
    t.appendChild(tr);
  }
  table.appendChild(t);

  return [chart, table];
}

// one line of a ranked list: the title, and both our hearts for it
function rankedLine(row) {
  const li = el("li", "stat-line");
  li.append(el("span", "stat-line-title", titleOf(row)));

  const scores = el("span", "stat-line-scores");
  for (const who of ["vlad", "vika"]) {
    const s = el("span", `stat-score ${who}`);
    s.append(el("span", `stat-dot ${who}`), `${who} ${row[`${who}_score`]}`);
    scores.appendChild(s);
  }
  li.appendChild(scores);
  return li;
}

function ranked(rows, empty) {
  if (!rows.length) return el("p", "stat-note", empty);
  const ol = el("ol", "stat-lines");
  ol.append(...rows.map(rankedLine));
  return ol;
}

/* ---------------------------
   THE PAGE
---------------------------- */

function draw() {
  const root = document.getElementById(ROOT_ID);
  if (!root) return;

  const state = cardsLoadState();
  if (state !== "loaded") {
    root.replaceChildren(el("p", "empty-note", state === "failed"
      ? "could not reach the database. reload to try again"
      : "the cards are on their way..."));
    return;
  }

  const rows = allCards();
  const watched = rows.filter(r => listOf(r) === LIST_WATCHED);
  const toWatch = rows.filter(r => listOf(r) !== LIST_WATCHED);
  const year = new Date().getFullYear();
  const thisYear = watched.filter(r => finishedOn(r)?.getFullYear() === year).length;
  const planned = toWatch.filter(r => stateOf(r) === STATE_PLANNED).length;

  // the last one we finished, and how long ago, counted in whole days
  const last = watched.filter(finishedOn).sort((a, b) => finishedOn(b) - finishedOn(a) || b.id - a.id)[0];
  const today = new Date(new Date().toDateString());
  const since = last ? Math.max(0, Math.round((today - finishedOn(last)) / DAY_MS)) : null;

  const headline = el("div", "stat-row");
  headline.append(
    tile("watched together", watched.length),
    tile("still to watch", toWatch.length, `${planned} planned · ${toWatch.length - planned} started`),
    tile(`in ${year}`, thisYear),
    tile("days since the last one", since ?? "—", last ? titleOf(last) : ""),
  );

  // each of us over the cards we gave hearts to: a 0 means not rated yet
  const hearts = el("div", "stat-row stat-row-two");
  for (const who of ["vlad", "vika"]) {
    const mine = watched.filter(r => scored(r, who)).map(r => r[`${who}_score`]);
    const box = tile(`${who}'s hearts, on average`, mine.length ? oneDecimal(average(mine)) : "—", `over ${mine.length} cards`);
    box.querySelector(".stat-label").prepend(el("span", `stat-dot ${who}`));
    hearts.appendChild(box);
  }

  // rated by both of us, and the later card first when two tie
  const both = watched.filter(r => scored(r, "vlad") && scored(r, "vika"));
  const byDate = (a, b) => (finishedOn(b)?.getTime() || 0) - (finishedOn(a)?.getTime() || 0) || b.id - a.id;
  const loved = [...both]
    .sort((a, b) => (b.vlad_score + b.vika_score) - (a.vlad_score + a.vika_score) || byDate(a, b))
    .slice(0, 5);
  const apart = both
    .filter(r => Math.abs(r.vlad_score - r.vika_score) >= 2)
    .sort((a, b) => Math.abs(b.vlad_score - b.vika_score) - Math.abs(a.vlad_score - a.vika_score) || byDate(a, b))
    .slice(0, 5);

  const firsts = el("div", "stat-row");
  for (const code of STATUS_CODES) {
    const box = tile(FIRSTS[code], watched.filter(r => normalizeStatusCode(r.status) === code).length);
    box.querySelector(".stat-label").prepend(el("span", `status s-${code}`, code));
    firsts.appendChild(box);
  }

  root.replaceChildren(
    headline,
    block("watched, month by month", ...monthChart(monthBuckets(watched))),
    block("our hearts", hearts),
    block("loved most", ranked(loved, "nothing we both gave hearts to yet")),
    block("where we disagree", ranked(apart, "we agree on everything, two hearts either way")),
    block("watched for the first time, or again", firsts),
  );
}

let raf = 0;

function scheduleDraw() {
  if (currentSection() !== "stats" || raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    draw();
  });
}

export function initializeStats() {
  onSectionChange(section => {
    if (section === "stats") scheduleDraw();
  });
  onStoreChange(scheduleDraw);
}
