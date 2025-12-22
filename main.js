const footer = document.querySelector("footer");

const TAB_INPUT_SELECTOR = 'input[name="tabs"]';
const UNWATCHED_TAB_ID = "tab-unwatched";
const UNWATCHED_LIST_SELECTOR = ".unwatched";
const WATCHED_LIST_SELECTOR = ".watched";

const RATING_DELIMITER = "|";
const ANIMATION_STEP_DELAY = 0.2;
const FOOTER_EXTRA_DELAY = 0.4;

// date label config
const WATCH_DATE_CLASS = "watch-date";
const STATE_PLANNED = "planned";
const STATE_STARTED = "started";
const STATE_WATCHED = "watched";

/* ---------------------------
   FOOTER ANIMATION HELPERS
---------------------------- */

// hide footer immediately (no fade)
function hideFooterInstantly() {
  if (!footer) return;

  footer.classList.remove("visible");
  footer.classList.add("instant-hide");
}

// show footer after total animation delay
function showFooterWithDelay(totalDelaySeconds) {
  if (!footer) return;

  setTimeout(() => {
    footer.classList.remove("instant-hide");
    footer.classList.add("visible");
  }, totalDelaySeconds * 1000);
}

// animate list appearance (staggered cards)
function animateList(listSelector) {
  const cards = document.querySelectorAll(`${listSelector} li`);

  hideFooterInstantly();

  cards.forEach((card, index) => {
    card.style.animationDelay = `${index * ANIMATION_STEP_DELAY}s`;
  });

  const totalDelay = cards.length * ANIMATION_STEP_DELAY + FOOTER_EXTRA_DELAY;
  showFooterWithDelay(totalDelay);
}

/* ---------------------------
   TABS (PERSIST/RESTORE)
---------------------------- */

function persistActiveTab(tabId) {
  localStorage.setItem("activeTab", tabId);
}

function restoreActiveTab() {
  const savedTab = localStorage.getItem("activeTab");
  if (!savedTab) return null;

  const savedTabInput = document.getElementById(savedTab);
  if (!savedTabInput) return null;

  savedTabInput.checked = true;
  return savedTab;
}

function handleTabChange(tab) {
  persistActiveTab(tab.id);

  if (tab.id === UNWATCHED_TAB_ID) {
    animateList(UNWATCHED_LIST_SELECTOR);
    return;
  }

  animateList(WATCHED_LIST_SELECTOR);
}

function initializeTabs() {
  document.querySelectorAll(TAB_INPUT_SELECTOR).forEach(tab => {
    tab.addEventListener("change", () => handleTabChange(tab));
  });

  const restoredTab = restoreActiveTab();
  if (restoredTab) {
    animateList(restoredTab === UNWATCHED_TAB_ID ? UNWATCHED_LIST_SELECTOR : WATCHED_LIST_SELECTOR);
  } else {
    animateList(UNWATCHED_LIST_SELECTOR);
  }
}

/* ---------------------------
   RATINGS (TEXT -> HEARTS)
---------------------------- */

function createHearts(score, owner) {
  const wrapper = document.createElement("div");
  wrapper.className = "rating-stars";

  for (let currentScore = 1; currentScore <= 10; currentScore += 1) {
    const heart = document.createElement("span");
    heart.className = `rating-heart ${owner}`;
    heart.textContent = "❤";

    if (currentScore <= score) {
      heart.classList.add("filled");
    }

    wrapper.appendChild(heart);
  }

  return wrapper;
}

function createRatingRow(name, score) {
  const row = document.createElement("div");
  row.className = "rating-row";

  const label = document.createElement("div");
  label.className = "rating-name";
  label.textContent = name;

  row.appendChild(label);
  row.appendChild(createHearts(score, name));

  return row;
}

function extractScores(metaText) {
  if (!metaText.includes(RATING_DELIMITER)) return null;

  const [vladPart, vikaPart] = metaText.split(RATING_DELIMITER);
  const vladScore = parseInt(vladPart.split(":")[1], 10);
  const vikaScore = parseInt(vikaPart.split(":")[1], 10);

  if (Number.isNaN(vladScore) || Number.isNaN(vikaScore)) return null;

  return { vladScore, vikaScore };
}

function renderRatings(metaElement, scores) {
  const rating = document.createElement("div");
  rating.className = "rating";

  rating.appendChild(createRatingRow("vlad", scores.vladScore));
  rating.appendChild(createRatingRow("vika", scores.vikaScore));

  metaElement.innerHTML = "";
  metaElement.appendChild(rating);
}

function transformRatings() {
  document.querySelectorAll(".watched .meta").forEach(meta => {
    const scores = extractScores(meta.textContent.trim());
    if (!scores) return;
    renderRatings(meta, scores);
  });
}

/* ---------------------------
   WATCH DATES (DATA-* -> LABEL)
---------------------------- */

// read explicit state from data-state
function getState(li) {
  const state = (li.dataset.state || "").trim().toLowerCase();

  // fallback if someone forgot to set data-state
  if (!state) return STATE_PLANNED;

  // guard against typos in HTML
  if (state !== STATE_PLANNED && state !== STATE_STARTED && state !== STATE_WATCHED) {
    return STATE_PLANNED;
  }

  return state;
}

// date format config
const DATE_PLACEHOLDER_UI = "xx/xx/xxxx";
const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

// parse ISO date safely (YYYY-MM-DD)
function parseISODate(value) {
  if (!value) return null;

  const trimmed = value.trim();

  // guard against typos
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;

  const date = new Date(`${trimmed}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;

  return date;
}

// format ISO date for UI (dd/mm/yyyy)
function formatISOForUI(value) {
  const date = parseISODate(value);
  if (!date) return DATE_PLACEHOLDER_UI;
  return DATE_FORMATTER.format(date);
}

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

// render dates for all cards
function renderWatchDates() {
  document.querySelectorAll(".lists li").forEach(li => upsertWatchDateLabel(li));
}

/* ---------------------------
   BOOT
---------------------------- */

initializeTabs();
transformRatings();
renderWatchDates();
