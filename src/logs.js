// the activity panel in the corner: pages of the log, newest first, and new
// entries prepended live while the panel is open.

import { STATE_STARTED, STATE_WATCHED } from "./cards.js";
import { formatISOForUI } from "./dates.js";
import { remoteFetchLogs } from "./db.js";

export const LOGS_PANEL_ID = "logsPanel";
const LOGS_TOGGLE_ID = "logsToggle";
const LOGS_LIST_ID = "logsList";
const LOGS_MORE_ID = "logsMore";
const LOGS_PAGE_SIZE = 20;
const LS_LOGS_OPEN = "logsOpen";

// paging: where the next page starts, whether there is one, and whether a
// request is already out
let logsCursorTs = null;
let logsHasMore = true;
let logsIsLoading = false;

function persistLogsOpen(isOpen) {
  localStorage.setItem(LS_LOGS_OPEN, isOpen ? "true" : "false");
}

function restoreLogsOpen(defaultOpen = false) {
  const saved = localStorage.getItem(LS_LOGS_OPEN);
  if (saved === null) return defaultOpen;
  return saved === "true";
}

function setLogsOpen(isOpen) {
  const panel = document.getElementById(LOGS_PANEL_ID);
  const btn = document.getElementById(LOGS_TOGGLE_ID);
  if (!panel || !btn) return;

  panel.dataset.open = isOpen ? "true" : "false";
  btn.setAttribute("aria-expanded", isOpen ? "true" : "false");
  btn.classList.toggle("is-open", isOpen);

  persistLogsOpen(isOpen);

  // render on open
  if (isOpen) renderLogs();
}

function formatTimeAgo(iso) {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "unknown time";

  const diffMs = Date.now() - ts;
  const sec = Math.max(0, Math.floor(diffMs / 1000));

  if (sec < 10) return "just now";
  if (sec < 60) return `${sec} seconds ago`;

  const min = Math.floor(sec / 60);
  if (min === 1) return "1 minute ago";
  if (min < 60) return `${min} minutes ago`;

  const hr = Math.floor(min / 60);
  if (hr === 1) return "1 hour ago";
  if (hr < 24) return `${hr} hours ago`;

  const day = Math.floor(hr / 24);
  if (day === 1) return "1 day ago";
  return `${day} days ago`;
}

function capUser(u) {
  if (!u) return "Unknown";
  const s = String(u).trim().toLowerCase();
  return s === "vlad" ? "Vlad" : s === "vika" ? "Vika" : "Unknown";
}

function createUserSpan(userRaw, textOverride) {
  const u = String(userRaw || "").trim().toLowerCase();

  const span = document.createElement("span");
  span.className = `log-user ${u === "vlad" ? "vlad" : u === "vika" ? "vika" : ""}`;
  span.textContent = textOverride || capUser(u);

  return span;
}

function appendText(el, s) {
  el.appendChild(document.createTextNode(String(s || "")));
}

function renderLogLine(entry, textEl) {
  const userRaw = String(entry.user || "").trim().toLowerCase();

  textEl.innerHTML = "";

  const title = entry.details?.title || "unknown title";

  function titleEm(text) {
    const em = document.createElement("em");
    em.className = "log-title";
    em.textContent = text || "unknown title";
    return em;
  }

  // a change of watch dates in words
  function describeWatchDates(state, startIso, endIso) {
    const s = (startIso || "").toString().trim();
    const e = (endIso || "").toString().trim();

    if (!s && !e) return "removed watch dates";

    if (state === STATE_STARTED) return `set start date to ${formatISOForUI(s)}`;

    if (state === STATE_WATCHED) {
      if (s && e && s !== e) return `set watch dates to ${formatISOForUI(s)} – ${formatISOForUI(e)}`;
      const single = s || e;
      return `set watch date to ${formatISOForUI(single)}`;
    }

    // fallback
    if (s && e && s !== e) return `set dates to ${formatISOForUI(s)} – ${formatISOForUI(e)}`;
    const single = s || e;
    return `set date to ${formatISOForUI(single)}`;
  }

  // one branch per action the site writes

  if (entry.action === "login") {
    textEl.appendChild(createUserSpan(userRaw));
    appendText(textEl, " signed in.");
    return;
  }

  if (entry.action === "rate") {
    const score = entry.details?.score ?? "—";

    const scoreEl = document.createElement("span");
    scoreEl.className = `log-score ${userRaw === "vlad" ? "vlad" : userRaw === "vika" ? "vika" : ""}`;
    scoreEl.textContent = `${score}/10`;

    textEl.appendChild(createUserSpan(userRaw));
    appendText(textEl, " rated ");
    textEl.appendChild(titleEm(title));
    appendText(textEl, " ");
    textEl.appendChild(scoreEl);
    appendText(textEl, " hearts!");
    return;
  }

  if (entry.action === "comment") {
    textEl.appendChild(createUserSpan(userRaw));
    appendText(textEl, " left a comment on ");
    textEl.appendChild(titleEm(title));
    return;
  }

  if (entry.action === "add_card") {
    textEl.appendChild(createUserSpan(userRaw));
    appendText(textEl, " added ");
    textEl.appendChild(titleEm(title));
    return;
  }

  if (entry.action === "edit_title") {
    const from = entry.details?.from || "unknown";
    const to = entry.details?.to || "unknown";

    textEl.appendChild(createUserSpan(userRaw));
    appendText(textEl, " renamed ");
    textEl.appendChild(titleEm(from));
    appendText(textEl, " to ");
    textEl.appendChild(titleEm(to));
    return;
  }

  if (entry.action === "set_state") {
    const from = entry.details?.from || "—";
    const to = entry.details?.to || "—";

    textEl.appendChild(createUserSpan(userRaw));
    appendText(textEl, " changed state of ");
    textEl.appendChild(titleEm(title));
    appendText(textEl, ` from ${from} to ${to}.`);
    return;
  }

  if (entry.action === "set_status") {
    const from = entry.details?.from || "—";
    const to = entry.details?.to || "—";

    textEl.appendChild(createUserSpan(userRaw));
    appendText(textEl, " changed status of ");
    textEl.appendChild(titleEm(title));
    appendText(textEl, ` from ${from} to ${to}.`);
    return;
  }

  if (entry.action === "set_watch_dates") {
    const state = entry.details?.state || "";
    const toStart = entry.details?.to_start || null;
    const toEnd = entry.details?.to_end || null;

    textEl.appendChild(createUserSpan(userRaw));
    appendText(textEl, " ");
    appendText(textEl, describeWatchDates(state, toStart, toEnd));
    appendText(textEl, " of ");
    textEl.appendChild(titleEm(title));
    return;
  }

  if (entry.action === "delete_card") {
    textEl.appendChild(createUserSpan(userRaw));
    appendText(textEl, " deleted ");
    textEl.appendChild(titleEm(title));
    return;
  }

  // edit_card is no longer written, but the earliest logs still hold it

  if (entry.action === "edit_card") {
    textEl.appendChild(createUserSpan(userRaw));
    appendText(textEl, " saved changes on ");
    textEl.appendChild(titleEm(title));
    return;
  }

  // anything else still says who did it
  textEl.appendChild(createUserSpan(userRaw));
  appendText(textEl, ` did ${entry.action}.`);
}

async function renderLogs() {
  const listEl = document.getElementById(LOGS_LIST_ID);
  if (!listEl) return;

  listEl.innerHTML = "";
  logsCursorTs = null;
  logsHasMore = true;

  const moreBtn = document.getElementById(LOGS_MORE_ID);
  if (moreBtn) {
    moreBtn.disabled = true;
    moreBtn.textContent = "loading...";
  }

  await loadMoreLogsPage({ reset: true });

  if (moreBtn) {
    moreBtn.disabled = !logsHasMore;
    moreBtn.textContent = logsHasMore ? "load more" : "no more";
  }
}

async function loadMoreLogsPage({ reset = false } = {}) {
  const listEl = document.getElementById(LOGS_LIST_ID);
  if (!listEl) return;

  if (logsIsLoading) return;
  if (!logsHasMore && !reset) return;

  logsIsLoading = true;

  const moreBtn = document.getElementById(LOGS_MORE_ID);
  if (moreBtn) {
    moreBtn.disabled = true;
    moreBtn.textContent = "loading...";
  }

  const { data, error } = await remoteFetchLogs(LOGS_PAGE_SIZE, logsCursorTs);

  if (error || !data) {
    const li = document.createElement("li");
    li.className = "log-item";
    li.innerHTML = `
      <div class="log-time">logs unavailable</div>
      <div class="log-text">could not load remote logs.</div>
    `;
    listEl.appendChild(li);

    logsHasMore = false;
    logsIsLoading = false;

    if (moreBtn) {
      moreBtn.disabled = true;
      moreBtn.textContent = "no more";
    }
    return;
  }

  if (data.length === 0 && listEl.children.length === 0) {
    const li = document.createElement("li");
    li.className = "log-item";
    li.innerHTML = `
      <div class="log-time">no activity yet</div>
      <div class="log-text">sign in, rate something, move cards, leave comments — it will appear here.</div>
    `;
    listEl.appendChild(li);

    logsHasMore = false;
    logsIsLoading = false;

    if (moreBtn) {
      moreBtn.disabled = true;
      moreBtn.textContent = "no more";
    }
    return;
  }

  data.forEach(entry => {
    const li = document.createElement("li");
    li.className = "log-item";
    li.dataset.ts = entry.ts;
    li.dataset.key = String(entry.id);

    const time = document.createElement("div");
    time.className = "log-time";
    time.textContent = formatTimeAgo(entry.ts);

    const text = document.createElement("div");
    text.className = "log-text";

    renderLogLine(
      { user: entry.user_name, action: entry.action, details: entry.details },
      text
    );

    li.appendChild(time);
    li.appendChild(text);
    listEl.appendChild(li);
  });

  // the next page starts below the oldest entry of this one
  const last = data[data.length - 1];
  logsCursorTs = last ? last.ts : logsCursorTs;

  logsHasMore = data.length === LOGS_PAGE_SIZE;
  logsIsLoading = false;

  if (moreBtn) {
    moreBtn.disabled = !logsHasMore;
    moreBtn.textContent = logsHasMore ? "load more" : "no more";
  }
}

export function refreshLogsUI() {
  const panel = document.getElementById(LOGS_PANEL_ID);
  if (!panel) return;

  // update only when open (saves work)
  if (panel.dataset.open === "true") renderLogs();
}

export function prependRemoteLog(row) {
  const listEl = document.getElementById(LOGS_LIST_ID);
  if (!listEl) return;

  // prevent duplicates if realtime reconnects
  const key = row.id ? String(row.id) : `${row.ts}-${row.user_name}-${row.action}`;
  if (listEl.querySelector(`.log-item[data-key="${CSS.escape(key)}"]`)) return;

  const li = document.createElement("li");
  li.className = "log-item";
  li.dataset.ts = row.ts;
  li.dataset.key = key;

  const time = document.createElement("div");
  time.className = "log-time";
  time.textContent = formatTimeAgo(row.ts);

  const text = document.createElement("div");
  text.className = "log-text";

  renderLogLine(
    { user: row.user_name, action: row.action, details: row.details },
    text
  );

  li.appendChild(time);
  li.appendChild(text);

  listEl.insertBefore(li, listEl.firstChild);

  // keep list capped
  const MAX = 60;
  while (listEl.children.length > MAX) {
    listEl.removeChild(listEl.lastChild);
  }
}

function refreshLogTimesOnly() {
  document.querySelectorAll(`#${LOGS_LIST_ID} .log-item[data-ts]`).forEach(li => {
    const ts = li.dataset.ts;
    const timeEl = li.querySelector(".log-time");
    if (!timeEl) return;
    timeEl.textContent = formatTimeAgo(ts);
  });
}

export function initializeLogsWidget() {
  const panel = document.getElementById(LOGS_PANEL_ID);
  const btn = document.getElementById(LOGS_TOGGLE_ID);
  if (!panel || !btn) return;

  setLogsOpen(restoreLogsOpen(false));

  btn.addEventListener("click", () => {
    const isOpen = panel.dataset.open === "true";
    setLogsOpen(!isOpen);
  });

  // keep "time ago" fresh if open
  window.setInterval(() => refreshLogTimesOnly(), 30 * 1000);

  const moreBtn = document.getElementById(LOGS_MORE_ID);
  if (moreBtn) {
    moreBtn.addEventListener("click", () => {
      loadMoreLogsPage();
    });
  }
}
