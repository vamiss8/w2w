// what the lists show: the active tab, the filters and sorting on top of it,
// the staggered fade-in of the cards and the footer that waits for it.

import { STATE_PLANNED, STATE_STARTED, UNWATCHED_LIST_SELECTOR, WATCHED_LIST_SELECTOR, getState } from "./cards.js";
import { sortUnwatchedStartedToBottom, sortWatchedByMode } from "./sort.js";

const footer = document.querySelector("footer");
export const TAB_INPUT_SELECTOR = 'input[name="tabs"]';
export const UNWATCHED_TAB_ID = "tab-unwatched";
const ANIMATION_STEP_DELAY = 0.08;
const FOOTER_EXTRA_DELAY = 0.4;

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

function showFooterInstantly() {
  if (!footer) return;

  footer.classList.remove("instant-hide");
  footer.classList.add("visible");
}

// animate list appearance (staggered visible cards)
function animateList(listSelector) {
  const cards = document.querySelectorAll(`${listSelector} li:not(.is-hidden)`);

  hideFooterInstantly();

  // remove animation class so we can restart it cleanly
  cards.forEach(card => {
    card.classList.remove("is-animating");
    card.style.removeProperty("--anim-delay");
  });

  // force reflow once
  void document.body.offsetHeight;

  cards.forEach((card, index) => {
    card.style.setProperty("--anim-delay", `${index * ANIMATION_STEP_DELAY}s`);
    card.classList.add("is-animating");
  });

  const totalDelay = cards.length * ANIMATION_STEP_DELAY + FOOTER_EXTRA_DELAY;
  showFooterWithDelay(totalDelay);
}

let viewRefreshRaf = 0;
let viewRefreshAnimate = false;

export function scheduleActiveTabView({ animate = false } = {}) {
  // if any caller wants animation, keep it
  viewRefreshAnimate = viewRefreshAnimate || !!animate;

  if (viewRefreshRaf) return;

  viewRefreshRaf = requestAnimationFrame(() => {
    viewRefreshRaf = 0;
    const doAnimate = viewRefreshAnimate;
    viewRefreshAnimate = false;

    applyActiveTabView({ animate: doAnimate });
  });
}

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
  scheduleActiveTabView({ animate: true })
}

export function initializeTabs() {
  document.querySelectorAll(TAB_INPUT_SELECTOR).forEach(tab => {
    tab.addEventListener("change", () => handleTabChange(tab));
  });

  restoreActiveTab();   // just sets the checked tab if saved
}

const FILTERS_MENU_ID = "filtersMenu";
const FILTERS_TOGGLE_SELECTOR = ".filters-toggle";

// localStorage key for menu open state
const LS_FILTERS_OPEN = "filtersOpen";

function persistFiltersOpen(isOpen) {
  localStorage.setItem(LS_FILTERS_OPEN, isOpen ? "true" : "false");
}

function restoreFiltersOpen(defaultOpen = false) {
  const saved = localStorage.getItem(LS_FILTERS_OPEN);
  if (saved === null) return defaultOpen;
  return saved === "true";
}

function setFiltersOpen(isOpen) {
  const menu = document.getElementById(FILTERS_MENU_ID);
  const button = document.querySelector(FILTERS_TOGGLE_SELECTOR);
  if (!menu || !button) return;

  menu.dataset.open = isOpen ? "true" : "false";
  button.setAttribute("aria-expanded", isOpen ? "true" : "false");
  button.classList.toggle("is-open", isOpen);

  // persist state
  persistFiltersOpen(isOpen);
}

export function initializeFiltersToggle() {
  const menu = document.getElementById(FILTERS_MENU_ID);
  const button = document.querySelector(FILTERS_TOGGLE_SELECTOR);
  if (!menu || !button) return;

  // restore state (closed by default on first ever visit)
  setFiltersOpen(restoreFiltersOpen(false));

  button.addEventListener("click", () => {
    const isOpen = menu.dataset.open === "true";
    setFiltersOpen(!isOpen);
  });
}

const LS_UW_PROGRESS = "uwProgress";
const LS_UW_STATUS = "uwStatus";
const LS_W_SORT = "wSort";
const LS_W_STATUS = "wStatus";

function getCheckedIdByName(name) {
  const el = document.querySelector(`input[name="${name}"]:checked`);
  return el ? el.id : null;
}

function applyUnwatchedFilters() {
  const progressId = getCheckedIdByName("uw-progress");
  const statusId = getCheckedIdByName("uw-status");

  const progress =
    progressId === "uw-progress-planned" ? STATE_PLANNED :
    progressId === "uw-progress-started" ? STATE_STARTED :
    "all";

  const status =
    statusId === "uw-status-00" ? "00" :
    statusId === "uw-status-01" ? "01" :
    statusId === "uw-status-10" ? "10" :
    statusId === "uw-status-11" ? "11" :
    "all";

  document.querySelectorAll(`${UNWATCHED_LIST_SELECTOR} li`).forEach(li => {
    const liState = getState(li);
    const liStatus = (li.dataset.status || "").trim();

    const matchesProgress = progress === "all" ? true : liState === progress;
    const matchesStatus = status === "all" ? true : liStatus === status;

    li.classList.toggle("is-hidden", !(matchesProgress && matchesStatus));
  });
}

function getWatchedSortMode() {
  const id = getCheckedIdByName("w-sort");

  if (id === "w-sort-vlad") return "vlad";
  if (id === "w-sort-vika") return "vika";
  if (id === "w-sort-avg") return "avg";

  return "recent";
}

function applyWatchedFilters() {
  const statusId = getCheckedIdByName("w-status");

  const status =
    statusId === "w-status-00" ? "00" :
    statusId === "w-status-01" ? "01" :
    statusId === "w-status-10" ? "10" :
    statusId === "w-status-11" ? "11" :
    "all";

  document.querySelectorAll(`${WATCHED_LIST_SELECTOR} li`).forEach(li => {
    const liStatus = (li.dataset.status || "").trim();
    const matchesStatus = status === "all" ? true : liStatus === status;
    li.classList.toggle("is-hidden", !matchesStatus);
  });
}

function applyUnwatchedView({ animate = true } = {}) {
  sortUnwatchedStartedToBottom();
  applyUnwatchedFilters();

  if (animate) animateList(UNWATCHED_LIST_SELECTOR);
  else showFooterInstantly();
}

function applyWatchedView({ animate = true } = {}) {
  sortWatchedByMode(getWatchedSortMode());
  applyWatchedFilters();

  if (animate) animateList(WATCHED_LIST_SELECTOR);
  else showFooterInstantly();
}

export function applyActiveTabView({ animate = true } = {}) {
  const activeTab = document.querySelector(`${TAB_INPUT_SELECTOR}:checked`);
  if (!activeTab) return;

  if (activeTab.id === UNWATCHED_TAB_ID) {
    applyUnwatchedView({ animate });
    return;
  }

  applyWatchedView({ animate });
}

// persist + restore controls
function persistControl(key, inputId) {
  localStorage.setItem(key, inputId);
}

function restoreControl(key, fallbackId) {
  const saved = localStorage.getItem(key);
  const el = document.getElementById(saved || "");
  const fallback = document.getElementById(fallbackId);

  if (el) {
    el.checked = true;
    return;
  }

  if (fallback) fallback.checked = true;
}

export function initializeControls() {
  // restore saved states
  restoreControl(LS_UW_PROGRESS, "uw-progress-all");
  restoreControl(LS_UW_STATUS, "uw-status-all");
  restoreControl(LS_W_SORT, "w-sort-recent");
  restoreControl(LS_W_STATUS, "w-status-all");

  // unwatched group listeners
  document.querySelectorAll('input[name="uw-progress"]').forEach(input => {
    input.addEventListener("change", () => {
      persistControl(LS_UW_PROGRESS, input.id);
      applyActiveTabView();
    });
  });

  document.querySelectorAll('input[name="uw-status"]').forEach(input => {
    input.addEventListener("change", () => {
      persistControl(LS_UW_STATUS, input.id);
      applyActiveTabView();
    });
  });

  // watched group listeners
  document.querySelectorAll('input[name="w-sort"]').forEach(input => {
    input.addEventListener("change", () => {
      persistControl(LS_W_SORT, input.id);
      applyActiveTabView();
    });
  });

  document.querySelectorAll('input[name="w-status"]').forEach(input => {
    input.addEventListener("change", () => {
      persistControl(LS_W_STATUS, input.id);
      applyActiveTabView();
    });
  });
}
