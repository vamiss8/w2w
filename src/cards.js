// a card on the page: drawing one from a database row, and reading its state
// back from the dom. a card's data lives in the data-* attributes of its li,
// which the sorting, the filters and the editor all read.

import { formatISOForUI } from "./dates.js";
import { renderRatings, updateHeartsFill, updateRatingEditability } from "./ratings.js";

export const TAB_UNWATCHED = "unwatched";
export const TAB_WATCHED = "watched";
export const UNWATCHED_LIST_SELECTOR = ".unwatched";
export const WATCHED_LIST_SELECTOR = ".watched";

// a card's progress, the state column. only watched cards sit in the watched
// list, so the tab column always follows from it
export const STATE_PLANNED = "planned";
export const STATE_STARTED = "started";
export const STATE_WATCHED = "watched";

function getListsUlByTab(tab) {
  return tab === TAB_WATCHED
    ? document.querySelector(WATCHED_LIST_SELECTOR)
    : document.querySelector(UNWATCHED_LIST_SELECTOR);
}

// the right-hand side of a card: the status badge, and the ⋯ button with its
// menu next to it. running it twice is harmless, the second time finds the
// badge already wrapped
function ensureRightControls(li) {
  if (!li) return;

  const status = li.querySelector(".status");
  if (!status) return;

  // already wrapped
  if (status.parentElement && status.parentElement.classList.contains("right")) return;

  const right = document.createElement("div");
  right.className = "right";

  li.insertBefore(right, status);
  right.appendChild(status);

  if (!li.querySelector(".card-actions")) {
    const btn = document.createElement("button");
    btn.className = "card-actions";
    btn.type = "button";
    btn.setAttribute("aria-label", "Card actions");
    btn.textContent = "⋯";
    right.appendChild(btn);
  }

  let menu = li.querySelector(".card-menu");
  if (!menu) {
    menu = document.createElement("div");
    menu.className = "card-menu";
    menu.dataset.open = "false";
    li.appendChild(menu);
  }

  menu.innerHTML = `
    <button type="button" data-action="edit">edit</button>
    <button type="button" data-action="comment">comment</button>
    <div class="menu-sep"></div>
    <button type="button" data-action="delete" style="color: #ff7abf;">delete</button>
  `;
}

// a toggle per comment under the card. whether each one is open survives a
// redraw: it is kept in data-* on the card, and every realtime update of the
// row rebuilds this box
function ensureCommentsUi(li) {
  const meta = li.querySelector(".meta");
  if (!meta) return;

  let box = meta.querySelector(".comment-lines");
  if (!box) {
    box = document.createElement("div");
    box.className = "comment-lines";
    meta.appendChild(box);
  }

  const vText = (li.dataset.vladComment || "").trim();
  const kText = (li.dataset.vikaComment || "").trim();

  const vOpen = (li.dataset.commentOpenVlad || "false") === "true";
  const kOpen = (li.dataset.commentOpenVika || "false") === "true";

  box.innerHTML = "";

  function addToggle(who, text, isOpen) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `comment-toggle ${who}`;
    btn.dataset.who = who;
    btn.textContent = `${who}'s comment`;

    const body = document.createElement("div");
    body.className = "comment-body";
    body.dataset.open = isOpen ? "true" : "false";
    body.textContent = text;

    box.appendChild(btn);
    box.appendChild(body);
  }

  if (vText) addToggle("vlad", vText, vOpen);
  if (kText) addToggle("vika", kText, kOpen);
}

// everything the rest of the page reads about a card is copied onto its li
// here, so sorting and filtering never go back to the row
function setCardDatasetFromRow(li, row) {
  li.dataset.id = String(row.id);
  li.dataset.status = String(row.status || "00");
  li.dataset.state = String(row.state || "planned");

  li.dataset.start = row.start_date ? String(row.start_date) : "";
  li.dataset.end = row.end_date ? String(row.end_date) : "";

  li.dataset.vladScore = String(row.vlad_score ?? 0);
  li.dataset.vikaScore = String(row.vika_score ?? 0);

  li.dataset.vladComment = String(row.vlad_comment ?? "");
  li.dataset.vikaComment = String(row.vika_comment ?? "");
}

function createCardLiFromRow(row) {
  const li = document.createElement("li");
  li.dataset.id = String(row.id);

  li.innerHTML = `
    <div class="left">
      <div class="filmTitle"></div>
      <div class="meta">—</div>
    </div>
    <div class="status">00</div>
  `;

  const title = li.querySelector(".filmTitle");
  if (title) title.textContent = row.title || "unknown title";

  setCardDatasetFromRow(li, row);

  syncStatusBadge(li);
  upsertWatchDateLabel(li);

  ensureRightControls(li);

  // hearts on a watched card, the dash from the markup on any other
  if (row.tab === TAB_WATCHED) {
    const meta = li.querySelector(".meta");
    if (meta) {
      renderRatings(meta, { vladScore: row.vlad_score ?? 0, vikaScore: row.vika_score ?? 0 });
    }
  }

  ensureCommentsUi(li);
  return li;
}

function moveCardToTab(li, tab) {
  const targetUl = getListsUlByTab(tab);
  if (!targetUl) return;

  const currentUl = li.closest("ul");
  if (currentUl === targetUl) return;

  targetUl.appendChild(li);
}

function ensureCardExistsFromRow(row) {
  const id = String(row.id);
  let li = document.querySelector(`.lists li[data-id="${CSS.escape(id)}"]`);

  if (!li) {
    li = createCardLiFromRow(row);
    const ul = getListsUlByTab(row.tab);
    if (ul) ul.appendChild(li);

    ensureRightControls(li);
    return li;
  }

  return li;
}

// draws a row from the database onto its card, creating the card when the
// page has not seen it yet. every realtime insert and update comes through
// here, so it has to be safe on a card that is already up to date
export function applyRemoteCardToDom(row) {
  const li = ensureCardExistsFromRow(row);
  if (!li) return;

  setCardDatasetFromRow(li, row);

  moveCardToTab(li, row.tab);

  const titleEl = li.querySelector(".filmTitle");
  if (titleEl) {
    // the title element also holds the date label, so only its text node is
    // replaced
    titleEl.childNodes.forEach(n => {
      if (n.nodeType === Node.TEXT_NODE) n.nodeValue = row.title || "unknown title";
    });

    // if there was no text node yet
    if (!titleEl.childNodes.length) titleEl.textContent = row.title || "unknown title";
  }

  // a watched card gets its hearts drawn once and refilled after that
  if (row.tab === TAB_WATCHED) {
    const meta = li.querySelector(".meta");
    if (meta) {
      const hasRating = !!meta.querySelector(".rating");
      if (!hasRating) {
        renderRatings(meta, { vladScore: row.vlad_score ?? 0, vikaScore: row.vika_score ?? 0 });
      } else {
        const vRow = li.querySelector('.rating-row[data-owner="vlad"] .rating-stars');
        const kRow = li.querySelector('.rating-row[data-owner="vika"] .rating-stars');
        if (vRow) updateHeartsFill(vRow, parseInt(li.dataset.vladScore || "0", 10));
        if (kRow) updateHeartsFill(kRow, parseInt(li.dataset.vikaScore || "0", 10));
      }
    }
  } else {
    // moved back out of watched: the hearts go and the dash returns
    const meta = li.querySelector(".meta");
    if (meta && meta.querySelector(".rating")) {
      meta.innerHTML = "—";
    }
  }

  syncStatusBadge(li);

  upsertWatchDateLabel(li);

  ensureCommentsUi(li);

  // new hearts answer clicks only in the signed-in person's row
  updateRatingEditability();
}

// the id as a string, or null for anything that is not a positive number
export function getCardId(li) {
  const raw = (li?.dataset?.id || "").trim();
  const n = parseInt(raw, 10);
  if (!Number.isNaN(n) && n > 0) return String(n);
  return null;
}

export function getTabFromLi(li) {
  if (!li) return "unwatched";
  const parent = li.closest("ul");
  if (!parent) return "unwatched";
  return parent.classList.contains("watched") ? "watched" : "unwatched";
}

export function readTitleFromLi(li) {
  const el = li?.querySelector(".filmTitle");
  if (!el) return "unknown title";
  // the first child is the title text, the date label comes after it
  return (el.childNodes[0]?.textContent || el.textContent || "").trim();
}

export function getTitleFromCard(li) {
  const t = li?.querySelector(".filmTitle");
  return t ? t.childNodes[0].textContent.trim() : "unknown title";
}

// the card's state, planned when data-state is missing or not one of the three
export function getState(li) {
  const state = (li.dataset.state || "").trim().toLowerCase();

  if (!state) return STATE_PLANNED;

  if (state !== STATE_PLANNED && state !== STATE_STARTED && state !== STATE_WATCHED) {
    return STATE_PLANNED;
  }

  return state;
}

// the status is two digits, vika's and then vlad's, and a 1 means that person
// had seen it before: 01 is a first time for vika, 11 a rewatch for both
const STATUS_TOOLTIP_TEXT = {
  "00": "no one watched.",
  "01": "vika's first time.",
  "10": "vlad's first time.",
  "11": "rewatch.",
};

const STATUS_CODES = ["00", "01", "10", "11"];

export function normalizeStatusCode(value) {
  const s = String(value || "").trim();
  return STATUS_CODES.includes(s) ? s : "00";
}

function syncStatusBadge(li) {
  const badge = li?.querySelector(".status");
  if (!badge) return;

  const code = normalizeStatusCode(li.dataset.status || badge.textContent);

  // keep li data-status normalized
  li.dataset.status = code;

  // the colour comes from an s-XX class
  STATUS_CODES.forEach(c => badge.classList.remove(`s-${c}`));
  badge.classList.add(`s-${code}`);

  // the tooltip is a child of the badge, so only the text node is replaced
  const tip = badge.querySelector(".tooltip");
  let textNode = null;

  badge.childNodes.forEach(n => {
    if (n.nodeType === Node.TEXT_NODE) textNode = n;
  });

  if (!textNode) {
    textNode = document.createTextNode(code);
    badge.insertBefore(textNode, tip || null);
  } else {
    textNode.nodeValue = code;
  }

  const text = STATUS_TOOLTIP_TEXT[code];
  if (!text) return;

  badge.setAttribute("tabindex", "0");
  badge.setAttribute("role", "button");
  badge.setAttribute("aria-label", `Status ${code} info`);

  if (tip) {
    tip.innerHTML = text;
  } else {
    const newTip = document.createElement("span");
    newTip.className = "tooltip";
    newTip.innerHTML = text;
    badge.appendChild(newTip);
  }
}

const WATCH_DATE_CLASS = "watch-date";

// the line next to the title: nothing for a planned card, the start for a
// started one, the day or the span for a watched one
function buildWatchDateText(state, start, end) {
  if (state === STATE_STARTED) {
    if (!start) return null;
    return `started on ${formatISOForUI(start)}`;
  }

  if (state === STATE_WATCHED) {
    if (!start && !end) return null;

    // series: start + end
    if (start && end && start !== end) {
      return `watched from ${formatISOForUI(start)} to ${formatISOForUI(end)}`;
    }

    // movie: single date
    const single = start || end;
    return single ? `watched on ${formatISOForUI(single)}` : null;
  }

  // planned: no label
  return null;
}

// create/update watch-date label near the title
function upsertWatchDateLabel(li) {
  const titleEl = li.querySelector(".filmTitle");
  if (!titleEl) return;

  // remove existing label to keep the operation idempotent
  const existing = titleEl.querySelector(`.${WATCH_DATE_CLASS}`);
  if (existing) existing.remove();

  const state = getState(li);
  const start = (li.dataset.start || "").trim();
  const end = (li.dataset.end || "").trim();

  const text = buildWatchDateText(state, start, end);
  if (!text) return;

  const label = document.createElement("span");
  label.className = WATCH_DATE_CLASS;
  label.textContent = text;

  titleEl.appendChild(label);
}
