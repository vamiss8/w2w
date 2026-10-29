// the two lists: which cards are on each, in what order, which ones the
// filters let through, and the tabs and controls that choose between them.
// everything here is worked out from the rows in src/store.js and then drawn,
// so the order and the filters never depend on what happens to be on screen.

import { LIST_TO_WATCH, LIST_WATCHED, STATE_STARTED, drawCard, listOf, normalizeStatusCode, stateOf } from "./cards.js";
import { parseISODate } from "./dates.js";
import { allCards, getComment, onStoreChange } from "./store.js";
import { getActiveUser, onUserChange } from "./user.js";

export const TAB_INPUT_SELECTOR = 'input[name="tabs"]';
export const UNWATCHED_TAB_ID = "tab-unwatched";

const LIST_SELECTOR = { [LIST_TO_WATCH]: ".lists ul.unwatched", [LIST_WATCHED]: ".lists ul.watched" };

/* ---------------------------
   ORDER
---------------------------- */

// the order cards were added in. ids only ever grow, so comparing two of them
// compares when the cards were added, and every device agrees on the answer
const byAdded = (a, b) => a.id - b.id;
const byAddedDesc = (a, b) => b.id - a.id;

// newest first, a card with no date below every dated one, and on the same
// day the card added last on top, so the title you just logged leads its day
function byDateDesc(a, b) {
  const aDate = parseISODate(a.start_date);
  const bDate = parseISODate(b.start_date);

  if (!aDate && !bDate) return byAddedDesc(a, b);
  if (!aDate) return 1;
  if (!bDate) return -1;

  return bDate - aDate || byAddedDesc(a, b);
}

// a score as a number. one that cannot be read sorts below every real score
function scoreOf(row, mode) {
  const vlad = Number.isFinite(row.vlad_score) ? row.vlad_score : Number.NEGATIVE_INFINITY;
  const vika = Number.isFinite(row.vika_score) ? row.vika_score : Number.NEGATIVE_INFINITY;
  if (mode === "vlad") return vlad;
  if (mode === "vika") return vika;
  return (vlad + vika) / 2;
}

// not watched yet: planned cards in the order they were added, then the
// started ones, the most recently started first
function sortToWatch(rows) {
  return rows.sort((a, b) => {
    const aStarted = stateOf(a) === STATE_STARTED;
    const bStarted = stateOf(b) === STATE_STARTED;
    if (aStarted !== bStarted) return aStarted ? 1 : -1;
    return aStarted ? byDateDesc(a, b) : byAdded(a, b);
  });
}

// watched: most recent first, or by one of our scores or their average, with
// the date breaking ties
function sortWatched(rows, mode) {
  if (mode === "recent") return rows.sort(byDateDesc);
  return rows.sort((a, b) => scoreOf(b, mode) - scoreOf(a, mode) || byDateDesc(a, b));
}

/* ---------------------------
   FILTERS
---------------------------- */

// every control is a radio, and every one remembers its choice
const CONTROLS = [
  { name: "uw-progress", key: "uwProgress", fallback: "uw-progress-all" },
  { name: "uw-status", key: "uwStatus", fallback: "uw-status-all" },
  { name: "w-sort", key: "wSort", fallback: "w-sort-recent" },
  { name: "w-status", key: "wStatus", fallback: "w-status-all" },
];

// the checked radio's id, minus the name in front of it: "all", "planned",
// "01", "vlad" and so on
function chosen(name) {
  const el = document.querySelector(`input[name="${name}"]:checked`);
  return el ? el.id.slice(name.length + 1) : "all";
}

function passes(row) {
  const list = listOf(row);
  const status = chosen(list === LIST_WATCHED ? "w-status" : "uw-status");
  if (status !== "all" && normalizeStatusCode(row.status) !== status) return false;

  if (list === LIST_TO_WATCH) {
    const progress = chosen("uw-progress");
    if (progress !== "all" && stateOf(row) !== progress) return false;
  }

  return true;
}

/* ---------------------------
   DRAWING
---------------------------- */

// the card on the page for each id, kept across redraws so that a card that
// did not change is left alone
const cardEls = new Map();

// what a card was last drawn from. a card is redrawn only when this changes:
// its row, a comment on it, or who is looking, which decides the hearts that
// answer clicks
function signature(row) {
  return JSON.stringify([row, getComment(row.id, "vlad"), getComment(row.id, "vika"), getActiveUser()]);
}

function cardFor(row) {
  const id = String(row.id);
  let li = cardEls.get(id);
  if (!li) {
    li = document.createElement("li");
    cardEls.set(id, li);
  }

  const sig = signature(row);
  if (li.dataset.sig !== sig) {
    drawCard(li, row);
    li.dataset.sig = sig;
  }
  return li;
}

function drawLists() {
  const rows = allCards();
  const live = new Set(rows.map(r => String(r.id)));

  // a card the database no longer has leaves the page
  for (const [id, li] of cardEls) {
    if (!live.has(id)) {
      li.remove();
      cardEls.delete(id);
    }
  }

  const lists = {
    [LIST_TO_WATCH]: sortToWatch(rows.filter(r => listOf(r) === LIST_TO_WATCH)),
    [LIST_WATCHED]: sortWatched(rows.filter(r => listOf(r) === LIST_WATCHED), chosen("w-sort")),
  };

  for (const [list, sorted] of Object.entries(lists)) {
    const ul = document.querySelector(LIST_SELECTOR[list]);
    if (!ul) continue;

    // appending a node that is already in the list moves it, so appending in
    // sorted order is the whole sort
    sorted.forEach(row => {
      const li = cardFor(row);
      li.classList.toggle("is-hidden", !passes(row));
      ul.appendChild(li);
    });
  }
}

/* ---------------------------
   THE FADE-IN, AND THE FOOTER AFTER IT
---------------------------- */

// seconds between one card fading in and the next, and how long the footer
// waits after the last one
const ANIMATION_STEP_DELAY = 0.08;
const FOOTER_EXTRA_DELAY = 0.4;

let footerTimer = 0;

// one footer timer at a time. the old one was never cancelled, so a second
// switch soon after the first let the footer in while the cards of the second
// were still fading
function showFooterAfter(seconds) {
  const footer = document.querySelector("footer");
  if (!footer) return;

  clearTimeout(footerTimer);

  if (seconds <= 0) {
    footer.classList.remove("instant-hide");
    footer.classList.add("visible");
    return;
  }

  footer.classList.remove("visible");
  footer.classList.add("instant-hide");
  footerTimer = setTimeout(() => {
    footer.classList.remove("instant-hide");
    footer.classList.add("visible");
  }, seconds * 1000);
}

function animateList(list) {
  const cards = document.querySelectorAll(`${LIST_SELECTOR[list]} li:not(.is-hidden)`);

  cards.forEach(card => card.classList.remove("is-animating"));

  // reading offsetHeight forces a reflow, so the removed class takes effect
  // before it comes back and the animation starts over
  void document.body.offsetHeight;

  cards.forEach((card, index) => {
    card.style.setProperty("--anim-delay", `${index * ANIMATION_STEP_DELAY}s`);
    card.classList.add("is-animating");
  });

  showFooterAfter(cards.length * ANIMATION_STEP_DELAY + FOOTER_EXTRA_DELAY);
}

export function activeList() {
  const tab = document.querySelector(`${TAB_INPUT_SELECTOR}:checked`);
  return tab && tab.id !== UNWATCHED_TAB_ID ? LIST_WATCHED : LIST_TO_WATCH;
}

let renderRaf = 0;
let renderAnimate = false;

// realtime can bring a burst of rows at once, and every one of them asks for
// a redraw. they are drawn once per frame instead of once per row
export function scheduleRender({ animate = false } = {}) {
  renderAnimate = renderAnimate || animate;
  if (renderRaf) return;

  renderRaf = requestAnimationFrame(() => {
    renderRaf = 0;
    const doAnimate = renderAnimate;
    renderAnimate = false;

    drawLists();
    if (doAnimate) animateList(activeList());
    else showFooterAfter(0);
  });
}

/* ---------------------------
   TABS AND CONTROLS
---------------------------- */

function restoreChecked(key, fallbackId) {
  const saved = document.getElementById(localStorage.getItem(key) || "");
  const el = saved || document.getElementById(fallbackId);
  if (el) el.checked = true;
}

const FILTERS_MENU_ID = "filtersMenu";
const LS_FILTERS_OPEN = "filtersOpen";

function setFiltersOpen(isOpen) {
  const menu = document.getElementById(FILTERS_MENU_ID);
  const button = document.querySelector(".filters-toggle");
  if (!menu || !button) return;

  menu.dataset.open = isOpen ? "true" : "false";
  button.setAttribute("aria-expanded", isOpen ? "true" : "false");
  button.classList.toggle("is-open", isOpen);
  localStorage.setItem(LS_FILTERS_OPEN, isOpen ? "true" : "false");
}

export function initializeLists() {
  // the open tab
  restoreChecked("activeTab", UNWATCHED_TAB_ID);
  document.querySelectorAll(TAB_INPUT_SELECTOR).forEach(tab => {
    tab.addEventListener("change", () => {
      localStorage.setItem("activeTab", tab.id);
      scheduleRender({ animate: true });
    });
  });

  // the filters and the sort
  for (const { name, key, fallback } of CONTROLS) {
    restoreChecked(key, fallback);
    document.querySelectorAll(`input[name="${name}"]`).forEach(input => {
      input.addEventListener("change", () => {
        localStorage.setItem(key, input.id);
        scheduleRender({ animate: true });
      });
    });
  }

  // the menu they sit in, closed on a first visit
  setFiltersOpen(localStorage.getItem(LS_FILTERS_OPEN) === "true");
  document.querySelector(".filters-toggle")?.addEventListener("click", () => {
    setFiltersOpen(document.getElementById(FILTERS_MENU_ID).dataset.open !== "true");
  });

  onStoreChange(() => scheduleRender());
  onUserChange(() => scheduleRender());
}
