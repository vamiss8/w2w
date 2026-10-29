// the two lists: which cards are on each, in what order, and which ones the
// filters let through. everything here is worked out from the rows in
// src/store.js and then drawn, so the order and the filters never depend on
// what happens to be on screen.

import { LIST_TO_WATCH, LIST_WATCHED, STATE_PLANNED, STATE_STARTED, drawCard, listOf, normalizeStatusCode, stateOf } from "./cards.js";
import { parseISODate } from "./dates.js";
import { currentSection, onSectionChange } from "./router.js";
import { matchesSearch, onSearchChange, searchQuery } from "./search.js";
import { allCards, cardsLoadState, getComment, onStoreChange } from "./store.js";
import { getActiveUser, onUserChange } from "./user.js";

const VIEW_OF = { [LIST_TO_WATCH]: "#view-to-watch", [LIST_WATCHED]: "#view-watched" };
const SECTION_OF = { "to-watch": LIST_TO_WATCH, watched: LIST_WATCHED };

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
  if (!matchesSearch(row)) return false;

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
    const view = document.querySelector(VIEW_OF[list]);
    const ul = view?.querySelector("ul.cards");
    if (!ul) continue;

    const other = lists[list === LIST_WATCHED ? LIST_TO_WATCH : LIST_WATCHED];
    pointElsewhere(view, list, other.filter(passes).length);

    // appending a node that is already in the list moves it, so appending in
    // sorted order is the whole sort
    let shown = 0;
    sorted.forEach(row => {
      const li = cardFor(row);
      const pass = passes(row);
      li.classList.toggle("is-hidden", !pass);
      if (pass) shown += 1;
      ul.appendChild(li);
    });

    describeList(view, list, sorted, shown);
  }
}

// a search that finds titles on the other list says how many, with a link
// there. only while something is typed: an empty box finds everything
function pointElsewhere(view, list, found) {
  const hint = view.querySelector("[data-search-hint]");
  const link = hint?.querySelector("[data-search-other]");
  if (!hint || !link) return;

  hint.hidden = !searchQuery() || found === 0;
  link.textContent = `${found} more in ${list === LIST_WATCHED ? "not watched yet" : "watched already"} →`;
}

// the line under a list's title, and what an empty list says instead of
// nothing at all
function describeList(view, list, rows, shown) {
  const count = view.querySelector("[data-count]");
  const empty = view.querySelector("[data-empty]");
  const state = cardsLoadState();

  if (empty) {
    empty.hidden = state === "loaded" && shown > 0;
    empty.textContent =
      state === "loading" ? "the cards are on their way..." :
      state === "failed" ? "could not reach the database. reload to try again" :
      searchQuery() ? "no title like that here" :
      rows.length ? "nothing here with these filters" : "nothing here yet";
  }

  if (!count || state !== "loaded") return;

  if (list === LIST_WATCHED) {
    count.textContent = `${rows.length} watched together`;
  } else {
    const planned = rows.filter(r => stateOf(r) === STATE_PLANNED).length;
    count.textContent = `${planned} planned · ${rows.length - planned} started`;
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
  const cards = document.querySelectorAll(`${VIEW_OF[list]} ul.cards > li:not(.is-hidden)`);

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

// the list on screen, or null when the section is not one of the two
export function activeList() {
  return SECTION_OF[currentSection()] || null;
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
    const list = activeList();
    if (doAnimate && list) animateList(list);
    else showFooterAfter(0);
  });
}

/* ---------------------------
   CONTROLS
---------------------------- */

function restoreChecked(key, fallbackId) {
  const saved = document.getElementById(localStorage.getItem(key) || "");
  const el = saved || document.getElementById(fallbackId);
  if (el) el.checked = true;
}

// the filters of both lists open and close together, and stay as they were
// left, closed on a first visit
const LS_FILTERS_OPEN = "filtersOpen";

function setFiltersOpen(isOpen) {
  document.querySelectorAll(".filters-toggle").forEach(button => {
    const menu = document.getElementById(button.getAttribute("aria-controls"));
    if (menu) menu.dataset.open = isOpen ? "true" : "false";
    button.setAttribute("aria-expanded", isOpen ? "true" : "false");
  });
  localStorage.setItem(LS_FILTERS_OPEN, isOpen ? "true" : "false");
}

export function initializeLists() {
  for (const { name, key, fallback } of CONTROLS) {
    restoreChecked(key, fallback);
    document.querySelectorAll(`input[name="${name}"]`).forEach(input => {
      input.addEventListener("change", () => {
        localStorage.setItem(key, input.id);
        scheduleRender({ animate: true });
      });
    });
  }

  setFiltersOpen(localStorage.getItem(LS_FILTERS_OPEN) === "true");
  document.querySelectorAll(".filters-toggle").forEach(button => {
    button.addEventListener("click", () => setFiltersOpen(button.getAttribute("aria-expanded") !== "true"));
  });

  // a list fades in each time it is opened. the first time, the cards are
  // usually not there yet, and the first pull asks for the fade instead
  onSectionChange((section, { first }) => {
    if (!first) scheduleRender({ animate: true });
  });
  onStoreChange(() => scheduleRender());
  onUserChange(() => scheduleRender());
  onSearchChange(() => scheduleRender());
}
