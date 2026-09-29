// the order of each list. comparators only: which one applies is decided in
// view.js, from the controls.

import { STATE_STARTED, UNWATCHED_LIST_SELECTOR, WATCHED_LIST_SELECTOR, getCardId, getState } from "./cards.js";
import { parseISODate } from "./dates.js";

function safeInt(value, fallback = Number.NEGATIVE_INFINITY) {
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? fallback : n;
}

// the order cards were added in. ids only ever grow, so comparing two of them
// compares when the cards were added, and every device agrees on the answer.
// ties used to fall back on the order cards happened to be drawn in, which
// put the card added last at the bottom of its day, under older ones
function compareAdded(a, b) {
  return Number(getCardId(a)) - Number(getCardId(b));
}

function compareAddedDesc(a, b) {
  return compareAdded(b, a);
}

// helper: re-append sorted items back to UL
function sortUlItems(ul, comparator) {
  const items = Array.from(ul.querySelectorAll("li"));
  items.sort(comparator);
  items.forEach(li => ul.appendChild(li));
}

// watched sorting: recent OR favorites
export function sortWatchedByMode(mode) {
  const ul = document.querySelector(WATCHED_LIST_SELECTOR);
  if (!ul) return;

  sortUlItems(ul, (a, b) => {
    const aDate = parseISODate(a.dataset.start);
    const bDate = parseISODate(b.dataset.start);

    // helper: date desc (newest first), and on the same date the card added
    // last, so the title you just logged lands on top of that day
    function dateDesc() {
      if (!aDate && !bDate) return compareAddedDesc(a, b);
      if (!aDate) return 1;
      if (!bDate) return -1;

      const diff = bDate.getTime() - aDate.getTime();
      if (diff !== 0) return diff;

      return compareAddedDesc(a, b);
    }

    if (mode === "recent") return dateDesc();

    const aVlad = safeInt(a.dataset.vladScore);
    const bVlad = safeInt(b.dataset.vladScore);
    const aVika = safeInt(a.dataset.vikaScore);
    const bVika = safeInt(b.dataset.vikaScore);

    const aScore = mode === "vlad" ? aVlad : mode === "vika" ? aVika : (aVlad + aVika) / 2;
    const bScore = mode === "vlad" ? bVlad : mode === "vika" ? bVika : (bVlad + bVika) / 2;

    // primary: score desc
    const scoreDiff = bScore - aScore;
    if (scoreDiff !== 0) return scoreDiff;

    // secondary: date desc
    return dateDesc();
  });
}

// tab 1: planned first (stable), started last (sorted by start date DESC)
export function sortUnwatchedStartedToBottom() {
  const ul = document.querySelector(UNWATCHED_LIST_SELECTOR);
  if (!ul) return;

  sortUlItems(ul, (a, b) => {
    const aState = getState(a);
    const bState = getState(b);

    const aIsStarted = aState === STATE_STARTED;
    const bIsStarted = bState === STATE_STARTED;

    // started goes to the bottom
    if (aIsStarted !== bIsStarted) return aIsStarted ? 1 : -1;

    // planned group: in the order it was added
    if (!aIsStarted && !bIsStarted) {
      return compareAdded(a, b);
    }

    // started group: sort by start date DESC (newest first)
    const aDate = parseISODate(a.dataset.start);
    const bDate = parseISODate(b.dataset.start);

    // missing/invalid dates go to the bottom of the started group
    if (!aDate && !bDate) return compareAddedDesc(a, b);
    if (!aDate) return 1;
    if (!bDate) return -1;

    const diff = bDate.getTime() - aDate.getTime(); // DESC
    if (diff !== 0) return diff;

    // same day: the card added last first, the same way the dates run
    return compareAddedDesc(a, b);
  });
}
