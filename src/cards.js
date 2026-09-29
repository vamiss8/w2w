// a card on the page: drawing one from a database row, and reading its state
// back from the dom. a card's data lives in the data-* attributes of its li,
// which the sorting, the filters and the editor all read.

import { formatISOForUI } from "./dates.js";
import { renderRatings, updateHeartsFill, updateRatingEditability } from "./ratings.js";

export const TAB_UNWATCHED = "unwatched";
export const TAB_WATCHED = "watched";
export const UNWATCHED_LIST_SELECTOR = ".unwatched";
export const WATCHED_LIST_SELECTOR = ".watched";
export const STATE_PLANNED = "planned";
export const STATE_STARTED = "started";
export const STATE_WATCHED = "watched";

function getListsUlByTab(tab) {
  return tab === TAB_WATCHED
    ? document.querySelector(WATCHED_LIST_SELECTOR)
    : document.querySelector(UNWATCHED_LIST_SELECTOR);
}

function ensureRightControls(li) {
  if (!li) return;

  const status = li.querySelector(".status");
  if (!status) return;

  // already wrapped
  if (status.parentElement && status.parentElement.classList.contains("right")) return;

  const right = document.createElement("div");
  right.className = "right";

  // move status into right
  li.insertBefore(right, status);
  right.appendChild(status);

  // add menu button
  if (!li.querySelector(".card-actions")) {
    const btn = document.createElement("button");
    btn.className = "card-actions";
    btn.type = "button";
    btn.setAttribute("aria-label", "Card actions");
    btn.textContent = "⋯";
    right.appendChild(btn);
  }

    // --------------------------- menu container (upgrade-safe) ----------------------------
  let menu = li.querySelector(".card-menu");
  if (!menu) {
    menu = document.createElement("div");
    menu.className = "card-menu";
    menu.dataset.open = "false";
    li.appendChild(menu);
  }

  // always rewrite menu so legacy buttons disappear
  menu.innerHTML = `
    <button type="button" data-action="edit">edit</button>
    <button type="button" data-action="comment">comment</button>
    <div class="menu-sep"></div>
    <button type="button" data-action="delete" style="color: #ff7abf;">delete</button>
  `;
}

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

  // tooltip + color class + date label
  syncStatusBadge(li);
  upsertWatchDateLabel(li);

  ensureRightControls(li);

  // if this is watched -> render rating widget in meta
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

    // make sure layout is upgraded
    ensureRightControls(li);
    return li;
  }

  return li;
}

export function applyRemoteCardToDom(row) {
  const li = ensureCardExistsFromRow(row);
  if (!li) return;

  // update all datasets
  setCardDatasetFromRow(li, row);

  // move between tabs if needed
  moveCardToTab(li, row.tab);

  // update title
  const titleEl = li.querySelector(".filmTitle");
  if (titleEl) {
    // keep only title text node clean (watch-date appended later)
    titleEl.childNodes.forEach(n => {
      if (n.nodeType === Node.TEXT_NODE) n.nodeValue = row.title || "unknown title";
    });

    // if there was no text node yet
    if (!titleEl.childNodes.length) titleEl.textContent = row.title || "unknown title";
  }

  // watched tab: ensure rating widget exists and matches db
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
    // unwatched: keep meta as dash if it has no rating container
    const meta = li.querySelector(".meta");
    if (meta && meta.querySelector(".rating")) {
      meta.innerHTML = "—";
    }
  }

  // status + tooltips
  syncStatusBadge(li);

  // dates label
  upsertWatchDateLabel(li);

  // comments
  ensureCommentsUi(li);

  // editability (ratings) depends on active user
  updateRatingEditability();
}

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
  // take only the title node (watch-date label is appended later)
  return (el.childNodes[0]?.textContent || el.textContent || "").trim();
}

export function getTitleFromCard(li) {
  const t = li?.querySelector(".filmTitle");
  return t ? t.childNodes[0].textContent.trim() : "unknown title";
}

// read explicit state from data-state
export function getState(li) {
  const state = (li.dataset.state || "").trim().toLowerCase();

  // fallback if someone forgot to set data-state
  if (!state) return STATE_PLANNED;

  // guard against typos in HTML
  if (state !== STATE_PLANNED && state !== STATE_STARTED && state !== STATE_WATCHED) {
    return STATE_PLANNED;
  }

  return state;
}

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

  // update badge color class (s-00/s-01/...)
  STATUS_CODES.forEach(c => badge.classList.remove(`s-${c}`));
  badge.classList.add(`s-${code}`);

  // update badge text without destroying tooltip node
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

  // ensure tooltip exists + matches current code
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

// date label config
const WATCH_DATE_CLASS = "watch-date";

// build label text from state + dates (ISO -> UI)
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
