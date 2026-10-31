// how far into a series we are, kept the way it was already being kept: in a
// comment, an entry per evening, the month first. "9.25.2026 - ep2;" for a
// show with one season, "8.20.2026 - s2ep10;" for one with several.
//
// a started card and the latest entry either of us wrote down show the same
// stopping point: the episode to resume from, or ep1 when there are no entries.
// +1 marks the displayed episode as watched and saves the next stopping point
// in the comment of whoever pressed it. an evening has one entry: a second +1
// on the same day moves that day's entry on; a new day adds a new entry. it all
// stays plain text, so a new season or a mistake is fixed by editing the comment.

import { remoteInsertLog, remoteSaveComment } from "./db.js";
import { getCard, getComment, putComment } from "./store.js";
import { toast } from "./toast.js";
import { getActiveUser } from "./user.js";

// an entry, wherever it sits in the comment: "10.1.2026 - s3ep2;", with or
// without the season, the spaces or the semicolon
const ENTRY = /(?<![\w.])(\d{1,2})\.(\d{1,2})\.(\d{4})\s*-\s*(?:s(\d+)\s*)?ep\s*(\d+)(?![\w.])[ \t]*;?/gi;

export function parseEntries(text) {
  return [...String(text || "").matchAll(ENTRY)].map(m => ({
    date: new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2])),
    season: m[4] ? Number(m[4]) : null,
    episode: Number(m[5]),
    index: m.index,
    length: m[0].length,
  })).filter(e => {
    const original = String(text).slice(e.index, e.index + e.length).match(/^(\d+)\.(\d+)\.(\d+)/);
    return e.date.getFullYear() === Number(original[3]) && e.date.getMonth() + 1 === Number(original[1]) &&
      e.date.getDate() === Number(original[2]) && Number.isSafeInteger(e.episode) && e.episode > 0 &&
      (e.season === null || (Number.isSafeInteger(e.season) && e.season > 0));
  });
}

// A realtime echo may redraw the button before the request finishes.
const pending = new Set();

// later means a later day, then a later season, then a later episode
function later(a, b) {
  return (a.date - b.date) || ((a.season ?? 0) - (b.season ?? 0)) || (a.episode - b.episode);
}

export function furthest(texts) {
  const all = texts.flatMap(parseEntries);
  return all.length ? all.reduce((best, e) => (later(e, best) > 0 ? e : best)) : null;
}

export const codeOf = ({ season, episode }) => (season ? `s${season}ep${episode}` : `ep${episode}`);
export const spoken = ({ season, episode }) => (season ? `s${season} ep${episode}` : `ep${episode}`);

const sameDay = (a, b) => a.toDateString() === b.toDateString();

// the comment with the next episode written into it: today's entry moved on
// when there is one, a new entry at the end when there is not
export function withEpisode(comment, next, today = new Date()) {
  const date = `${today.getMonth() + 1}.${today.getDate()}.${today.getFullYear()}`;
  const entry = `${date} - ${codeOf(next)};`;
  const text = String(comment || "");

  const todays = parseEntries(text).filter(e => sameDay(e.date, today)).at(-1);
  if (todays) return text.slice(0, todays.index) + entry + text.slice(todays.index + todays.length);

  return text.trim() ? `${text.trimEnd()} ${entry}` : entry;
}

export function nextAfter(latest) {
  return latest ? { season: latest.season, episode: latest.episode + 1 } : { season: null, episode: 1 };
}

// the line on a started card: our saved stopping point, and the button to move on
export function progressLine(row) {
  const latest = furthest([getComment(row.id, "vlad"), getComment(row.id, "vika")]);
  const current = latest || { season: null, episode: 1 };

  const box = document.createElement("div");
  box.className = "progress";

  const now = document.createElement("span");
  now.className = "progress-now";
  now.textContent = spoken(current);
  now.dataset.hint = "the episode where we stopped";
  box.appendChild(now);

  if (latest) {
    const when = document.createElement("span");
    when.className = "progress-when";
    when.textContent = `stopped ${latest.date.getMonth() + 1}/${latest.date.getDate()}`;
    box.appendChild(when);
  }

  const button = document.createElement("button");
  button.className = "ep-next";
  button.type = "button";
  button.disabled = pending.has(String(row.id));
  button.textContent = "+1 ep";
  button.setAttribute("aria-label", `we watched ${spoken(current)}`);
  button.dataset.hint = `we watched ${spoken(current)}: save ${spoken(nextAfter(current))} as today's stopping point`;
  box.appendChild(button);

  return box;
}

async function nextEpisode(button) {
  const me = getActiveUser();
  const id = button.closest("li")?.dataset.id;
  const row = id && getCard(id);
  if (!me || !row || pending.has(id)) return;

  const current = furthest([getComment(id, "vlad"), getComment(id, "vika")]) || { season: null, episode: 1 };
  const next = nextAfter(current);
  const text = withEpisode(getComment(id, me), next);
  const hadFocus = document.activeElement === button;

  pending.add(id);
  button.disabled = true;
  try {
    if (!await remoteSaveComment(id, me, text)) {
      toast(`could not write down ${spoken(next)}, try again`);
      return;
    }
    putComment(id, me, text);
    await remoteInsertLog("episode", { title: row.title, episode: codeOf(current) }, id);
  } finally {
    pending.delete(id);
    const current = document.querySelector(`.cards > li[data-id="${id}"] .ep-next`);
    if (current) current.disabled = false;
    button.disabled = false;
    if (hadFocus && current && document.activeElement === document.body) current.focus({ preventScroll: true });
  }
}

export function initializeEpisodes() {
  document.addEventListener("click", e => {
    const button = e.target.closest(".ep-next");
    if (button && !button.disabled) nextEpisode(button);
  });
}
