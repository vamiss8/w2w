// a card on the page, drawn from its row and the comments on it. nothing is
// ever read back from a card: src/store.js holds the rows, and a card is only
// what they look like.

import { formatISOForUI } from "./dates.js";
import { progressLine } from "./episodes.js";
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
// had seen it before: 01 is a first time for vika, 11 a rewatch for both
export const STATUS_CODES = ["00", "01", "10", "11"];

export const STATUS_TEXT = {
  "00": "no one watched.",
  "01": "vika's first time.",
  "10": "vlad's first time.",
  "11": "rewatch.",
};

export function normalizeStatusCode(value) {
  const s = String(value || "").trim();
  return STATUS_CODES.includes(s) ? s : "00";
}

export const titleOf = row => row?.title || "unknown title";

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

    const body = el("div", "comment-body", text);
    body.dataset.open = open ? "true" : "false";

    box.append(btn, body);
  }

  return box;
}

// built node by node: a title is typed by one of us, and nothing typed should
// ever be read as markup
export function drawCard(li, row) {
  const code = normalizeStatusCode(row.status);

  li.dataset.id = String(row.id);
  li.dataset.status = code;
  li.dataset.state = stateOf(row);

  const title = el("div", "filmTitle", titleOf(row));
  const date = watchDateText(row);
  if (date) title.append(el("span", "watch-date", date));

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

  const status = el("div", `status s-${code}`, code);
  status.tabIndex = 0;
  status.setAttribute("role", "button");
  status.setAttribute("aria-label", `Status ${code} info`);
  status.append(el("span", "tooltip", STATUS_TEXT[code]));

  const actions = el("button", "card-actions", "⋯");
  actions.type = "button";
  actions.setAttribute("aria-label", "Card actions");
  actions.dataset.hint = "edit, comment on or delete this card";

  const right = el("div", "right");
  right.append(status, actions);

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
}
