// a card on the page, drawn from its row and the comments on it. nothing is
// ever read back from a card: src/store.js holds the rows, and a card is only
// what they look like.

import { formatISOForUI } from "./dates.js";
import { parseEntries, progressLine, spoken } from "./episodes.js";
import { renderRatings } from "./ratings.js";
import { getComment } from "./store.js";
import { getActiveUser } from "./user.js";

// a card's progress, the state column. it also says which list the card is
// on: only a watched card sits in the watched one
export const STATE_PLANNED = "planned";
export const STATE_STARTED = "started";
export const STATE_WATCHED = "watched";

export const LIST_TO_WATCH = "unwatched";
export const LIST_WATCHED = "watched";

const STATES = [STATE_PLANNED, STATE_STARTED, STATE_WATCHED];

// planned for anything the page does not know
export function stateOf(row) {
  return STATES.includes(row?.state) ? row.state : STATE_PLANNED;
}

export function listOf(row) {
  return stateOf(row) === STATE_WATCHED ? LIST_WATCHED : LIST_TO_WATCH;
}

// the status is two digits, vika's and then vlad's, and a 1 means that person
// had seen it before: 01 is new to vika, 11 a rewatch for both. the database
// keeps the digits; the page says them in words, since there is room on a
// card and the digits had to be learnt
export const STATUS_CODES = ["00", "01", "10", "11"];

export const STATUS_TEXT = {
  "00": "new to both of us",
  "01": "new to vika",
  "10": "new to vlad",
  "11": "a rewatch",
};

// who has seen it before, by the digits
export const seenBefore = code => ({ vika: code[0] === "1", vlad: code[1] === "1" });
export const statusOf = ({ vika, vlad }) => `${vika ? 1 : 0}${vlad ? 1 : 0}`;

export function normalizeStatusCode(value) {
  const s = String(value || "").trim();
  return STATUS_CODES.includes(s) ? s : "00";
}

export const titleOf = row => row?.title || "unknown title";

// imdb: the page of a film, and a search for a title that has none yet
export const imdbTitleUrl = id => `https://www.imdb.com/title/${id}/`;
export const imdbSearchUrl = title => `https://www.imdb.com/find/?q=${encodeURIComponent(title)}&s=tt`;

// the line next to the title: nothing for a planned card, the start for a
// started one, the day or the span for a watched one
function watchDateText(row) {
  const start = row.start_date || "";
  const end = row.end_date || "";
  const state = stateOf(row);

  if (state === STATE_STARTED) {
    return start ? `started on ${formatISOForUI(start)}` : null;
  }

  if (state === STATE_WATCHED) {
    if (start && end && start !== end) {
      return `watched from ${formatISOForUI(start)} to ${formatISOForUI(end)}`;
    }
    const single = start || end;
    return single ? `watched on ${formatISOForUI(single)}` : null;
  }

  return null;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// which comments are unfolded, by card and author. a card is redrawn whenever
// its row or a comment on it changes, and this outlives the redraw
const openComments = new Set();

export function setCommentOpen(cardId, who, open) {
  const k = `${cardId}:${who}`;
  if (open) openComments.add(k);
  else openComments.delete(k);
}

function commentToggles(row) {
  const box = el("div", "comment-lines");

  for (const who of ["vlad", "vika"]) {
    const text = getComment(row.id, who).trim();
    if (!text) continue;

    const open = openComments.has(`${row.id}:${who}`);

    const btn = el("button", `comment-toggle ${who}`, `${who}'s comment`);
    btn.type = "button";
    btn.dataset.who = who;
    btn.dataset.hint = `show or hide what ${who} wrote about it`;
    btn.setAttribute("aria-expanded", open ? "true" : "false");

    const body = el("div", "comment-body");
    renderComment(body, text);
    body.dataset.open = open ? "true" : "false";

    box.append(btn, body);
  }

  return box;
}

// Keep the original comment in the store and editor. Only complete, valid
// episode entries become rows; the prose between them stays in its place.
function renderComment(body, text) {
  let cursor = 0;
  let timeline = null;
  for (const entry of parseEntries(text)) {
    const between = text.slice(cursor, entry.index);
    if (between.trim()) {
      body.append(el("div", "comment-prose", between));
      timeline = null;
    }
    if (!timeline) {
      timeline = el("ol", "episode-timeline");
      timeline.setAttribute("aria-label", "watch history");
      body.append(timeline);
    }
    const item = el("li", "episode-entry");
    const date = entry.date;
    const time = el("time", "episode-date", new Intl.DateTimeFormat("en-US", {
      month: "short", day: "numeric", year: "numeric",
    }).format(date));
    time.dateTime = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    item.append(time, el("span", "episode-code", spoken(entry)));
    timeline.append(item);
    cursor = entry.index + entry.length;
  }
  const tail = text.slice(cursor);
  if (tail.trim()) body.append(el("div", "comment-prose", tail));
}

// built node by node: a title is typed by one of us, and nothing typed should
// ever be read as markup
export function drawCard(li, row) {
  const restoreEpisodeFocus = li.contains(document.activeElement) && document.activeElement.matches(".ep-next");
  const code = normalizeStatusCode(row.status);

  li.dataset.id = String(row.id);
  li.dataset.status = code;
  li.dataset.state = stateOf(row);

  // under the title, the dates and who has seen it before, in words, with a
  // dot of the colour the card's edge has
  const title = el("div", "filmTitle", titleOf(row));
  const sub = el("span", "card-sub");
  const date = watchDateText(row);
  if (date) sub.append(el("span", "watch-date", date));
  const status = el("span", `card-status s-${code}`);
  status.append(el("span", "status-dot"), STATUS_TEXT[code]);
  sub.append(status);

  // its page on imdb, or a search there for a card nobody linked yet
  const imdb = el("a", row.imdb_id ? "imdb-link" : "imdb-link is-search", "imdb ↗");
  imdb.href = row.imdb_id ? imdbTitleUrl(row.imdb_id) : imdbSearchUrl(titleOf(row));
  imdb.target = "_blank";
  imdb.rel = "noopener noreferrer";
  imdb.dataset.hint = row.imdb_id ? "open its page on imdb" : "no page linked yet: search imdb for this title";
  sub.append(imdb);
  title.append(sub);

  // under the title: the hearts of a watched card, how far into a started
  // one we are, and the comments. a card with none of them has nothing there
  // at all, rather than a dash standing in. the episodes are read out of the
  // comments, which a guest never gets, so only one of us sees them
  const meta = el("div", "meta");
  if (stateOf(row) === STATE_WATCHED) meta.append(renderRatings(row));
  if (stateOf(row) === STATE_STARTED && getActiveUser()) meta.append(progressLine(row));
  const comments = commentToggles(row);
  if (comments.childElementCount) meta.append(comments);

  const left = el("div", "left");
  left.append(title, meta);

  const actions = el("button", "card-actions", "⋯");
  actions.type = "button";
  actions.setAttribute("aria-label", "Card actions");
  actions.dataset.hint = "edit, comment on or delete this card";

  const right = el("div", "right");
  right.append(actions);

  const menu = el("div", "card-menu");
  menu.dataset.open = "false";
  for (const [action, label] of [["edit", "edit"], ["comment", "comment"], ["delete", "delete"]]) {
    if (action === "delete") menu.append(el("div", "menu-sep"));
    const b = el("button", action === "delete" ? "danger" : "", label);
    b.type = "button";
    b.dataset.action = action;
    menu.append(b);
  }

  li.replaceChildren(left, right, menu);
  if (restoreEpisodeFocus) li.querySelector(".ep-next")?.focus({ preventScroll: true });
}
