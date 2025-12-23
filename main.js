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
   STARFIELD (CANVAS)
---------------------------- */

// create a real random starfield + two comet types (no tiling patterns)
(function initStarfield() {
  const container = document.querySelector(".stars");
  if (!container) return;

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const canvas = document.createElement("canvas");
  canvas.className = "stars-canvas";
  container.appendChild(canvas);

  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return;

  let w = 0;
  let h = 0;
  let dpr = 1;

  let stars = [];
  let comets = [];

  let rafId = null;
  let lastTs = 0;

  // schedules (seconds)
  let nextBigCometAt = 0;
  let nextMicroCometAt = 0;

  // tune here (big comets)
  const BIG_COMET_MIN_INTERVAL = 6;
  const BIG_COMET_MAX_INTERVAL = 18;
  const BIG_COMET_SPAWN_CHANCE = 0.80;

  // tune here (micro meteors)
  const MICRO_COMET_MIN_INTERVAL = 0.8;
  const MICRO_COMET_MAX_INTERVAL = 2.1;
  const MICRO_COMET_SPAWN_CHANCE = 0.92;

  // caps (avoid too many trails at once)
  const MAX_BIG_COMETS = 1;
  const MAX_MICRO_COMETS = 4;

  const COMET_KIND_BIG = "big";
  const COMET_KIND_MICRO = "micro";

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  // bias some stars toward edges (so sides feel “alive”)
  function randomX() {
    const edgeChance = 0.35;
    const edgeZone = 0.22; // 22% from left/right

    if (Math.random() < edgeChance) {
      const left = Math.random() < 0.5;
      const t = Math.pow(Math.random(), 1.6) * (w * edgeZone);
      return left ? t : (w - t);
    }

    return Math.random() * w;
  }

  function scheduleNextBigComet(nowSeconds) {
    nextBigCometAt = nowSeconds + rand(BIG_COMET_MIN_INTERVAL, BIG_COMET_MAX_INTERVAL);
  }

  function scheduleNextMicroComet(nowSeconds) {
    nextMicroCometAt = nowSeconds + rand(MICRO_COMET_MIN_INTERVAL, MICRO_COMET_MAX_INTERVAL);
  }

  function countComets(kind) {
    let count = 0;
    for (let i = 0; i < comets.length; i += 1) {
      if (comets[i].kind === kind) count += 1;
    }
    return count;
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = container.clientWidth;
    h = container.clientHeight;

    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);

    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // rebuild stars on resize (fresh randomness)
    const target = Math.max(320, Math.min(950, Math.round((w * h) / 2400)));
    stars = createStars(target);

    // drop active comets on resize (avoids stretched trails)
    comets = [];

    const now = performance.now() / 1000;
    scheduleNextBigComet(now);
    scheduleNextMicroComet(now);
  }

  function createStars(count) {
    const arr = [];

    for (let i = 0; i < count; i += 1) {
      const z = Math.pow(Math.random(), 0.55); // more far stars, fewer near
      const radius = rand(0.28, 1.0) * (0.55 + z * 1.15);
      const baseAlpha = rand(0.15, 0.85) * (0.55 + z * 0.75);

      // speed in px/sec (different per star)
      const speedY = rand(4, 14) * (0.35 + z * 0.95);
      const driftX = rand(-3, 3) * (0.25 + z * 0.60);

      // twinkle
      const twinkle = rand(1.3, 3.7); // frequency
      const phase = rand(0, Math.PI * 2);

      // subtle tint (mostly white with tiny blue/purple shifts)
      const tintPick = Math.random();
      const tint =
        tintPick < 0.70 ? { r: 255, g: 255, b: 255 } :
        tintPick < 0.87 ? { r: 230, g: 232, b: 255 } :
                          { r: 220, g: 210, b: 255 };

      const isGlint = Math.random() < 0.03;

      arr.push({
        x: randomX(),
        y: Math.random() * h,
        z,
        radius,
        baseAlpha,
        speedY,
        driftX,
        twinkle,
        phase,
        tint,
        isGlint,
      });
    }

    return arr;
  }

  function drawStar(star, t) {
    const tw = 0.65 + 0.35 * Math.sin(t * star.twinkle + star.phase);
    const a = clamp(star.baseAlpha * tw, 0, 1);

    // bloom
    ctx.beginPath();
    ctx.fillStyle = `rgba(${star.tint.r}, ${star.tint.g}, ${star.tint.b}, ${a * 0.20})`;
    ctx.arc(star.x, star.y, star.radius * 2.6, 0, Math.PI * 2);
    ctx.fill();

    // core
    ctx.beginPath();
    ctx.fillStyle = `rgba(${star.tint.r}, ${star.tint.g}, ${star.tint.b}, ${a})`;
    ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
    ctx.fill();

    // rare tiny glint cross
    if (star.isGlint && a > 0.45) {
      const s = star.radius * 3.2;

      ctx.strokeStyle = `rgba(${star.tint.r}, ${star.tint.g}, ${star.tint.b}, ${a * 0.35})`;
      ctx.lineWidth = 1;

      ctx.beginPath();
      ctx.moveTo(star.x - s, star.y);
      ctx.lineTo(star.x + s, star.y);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(star.x, star.y - s);
      ctx.lineTo(star.x, star.y + s);
      ctx.stroke();
    }
  }

  /* ---------------------------
     COMETS (TWO TYPES)
  ---------------------------- */

  function spawnComet(kind) {
    if (w <= 0 || h <= 0) return;

    // enforce caps per kind (prevents overdraw)
    if (kind === COMET_KIND_BIG && countComets(COMET_KIND_BIG) >= MAX_BIG_COMETS) return;
    if (kind === COMET_KIND_MICRO && countComets(COMET_KIND_MICRO) >= MAX_MICRO_COMETS) return;

    const spawnChance = kind === COMET_KIND_BIG ? BIG_COMET_SPAWN_CHANCE : MICRO_COMET_SPAWN_CHANCE;
    if (Math.random() > spawnChance) return;

    // start slightly outside the viewport
    const startFromTop = Math.random() < (kind === COMET_KIND_BIG ? 0.55 : 0.70);

    const x = rand(w * 0.08, w * 0.92);
    const y = startFromTop ? rand(-90, -20) : rand(h * 0.05, h * 0.38);

    // angle: downwards diagonal
    const dir = Math.random() < 0.5 ? -1 : 1; // left/right
    const angle = kind === COMET_KIND_BIG
      ? rand(Math.PI * 0.20, Math.PI * 0.33) // ~36°..~59°
      : rand(Math.PI * 0.18, Math.PI * 0.30); // slightly "flatter" for micro

    const speed = kind === COMET_KIND_BIG
      ? rand(1100, 1800)
      : rand(1400, 2400);

    const vx = Math.cos(angle) * speed * dir;
    const vy = Math.sin(angle) * speed;

    const life = kind === COMET_KIND_BIG
      ? rand(0.55, 0.95)
      : rand(0.22, 0.45);

    const length = kind === COMET_KIND_BIG
      ? rand(230, 420)
      : rand(90, 170);

    const width = kind === COMET_KIND_BIG
      ? rand(1.2, 2.1)
      : rand(0.75, 1.15);

    const alpha = kind === COMET_KIND_BIG
      ? rand(0.55, 0.85)
      : rand(0.16, 0.32);

    // tint (keep micro more neutral)
    const tintPick = Math.random();
    const tint = kind === COMET_KIND_BIG
      ? (tintPick < 0.70 ? { r: 255, g: 255, b: 255 } : { r: 210, g: 220, b: 255 })
      : (tintPick < 0.85 ? { r: 255, g: 255, b: 255 } : { r: 230, g: 232, b: 255 });

    comets.push({
      kind,
      x,
      y,
      vx,
      vy,
      age: 0,
      life,
      length,
      width,
      alpha,
      tint,
    });
  }

  function updateComets(dt) {
    for (let i = comets.length - 1; i >= 0; i -= 1) {
      const c = comets[i];

      c.age += dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;

      const out =
        c.x < -c.length - 240 ||
        c.x > w + c.length + 240 ||
        c.y < -c.length - 240 ||
        c.y > h + c.length + 240;

      if (c.age >= c.life || out) {
        comets.splice(i, 1);
      }
    }
  }

  function drawComet(c) {
    // fade in/out
    const p = clamp(c.age / c.life, 0, 1);
    const fade = p < 0.18 ? (p / 0.18) : (p > 0.86 ? (1 - p) / 0.14 : 1);
    const a = clamp(c.alpha * fade, 0, 1);

    // direction unit vector
    const vlen = Math.hypot(c.vx, c.vy) || 1;
    const ux = c.vx / vlen;
    const uy = c.vy / vlen;

    // tail endpoint
    const tx = c.x - ux * c.length;
    const ty = c.y - uy * c.length;

    // micro meteors should be subtle (less glow)
    const glowMul = c.kind === COMET_KIND_BIG ? 3.2 : 2.0;
    const glowAlpha = c.kind === COMET_KIND_BIG ? 0.22 : 0.12;
    const coreMidStopAlpha = c.kind === COMET_KIND_BIG ? 0.35 : 0.22;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";

    // glow pass
    ctx.lineWidth = c.width * glowMul;

    let grad = ctx.createLinearGradient(c.x, c.y, tx, ty);
    grad.addColorStop(0, `rgba(${c.tint.r}, ${c.tint.g}, ${c.tint.b}, ${a * glowAlpha})`);
    grad.addColorStop(1, `rgba(${c.tint.r}, ${c.tint.g}, ${c.tint.b}, 0)`);
    ctx.strokeStyle = grad;

    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(tx, ty);
    ctx.stroke();

    // core pass
    ctx.lineWidth = c.width;

    grad = ctx.createLinearGradient(c.x, c.y, tx, ty);
    grad.addColorStop(0, `rgba(${c.tint.r}, ${c.tint.g}, ${c.tint.b}, ${a})`);
    grad.addColorStop(0.45, `rgba(${c.tint.r}, ${c.tint.g}, ${c.tint.b}, ${a * coreMidStopAlpha})`);
    grad.addColorStop(1, `rgba(${c.tint.r}, ${c.tint.g}, ${c.tint.b}, 0)`);
    ctx.strokeStyle = grad;

    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(tx, ty);
    ctx.stroke();

    ctx.restore();
  }

  /* ---------------------------
     TICK
  ---------------------------- */

  function tick(ts) {
    if (!lastTs) lastTs = ts;
    const dt = Math.min(0.05, (ts - lastTs) / 1000); // clamp dt
    lastTs = ts;

    ctx.clearRect(0, 0, w, h);

    const t = ts / 1000;

    // stars
    for (let i = 0; i < stars.length; i += 1) {
      const s = stars[i];

      // move
      s.y += s.speedY * dt;
      s.x += s.driftX * dt;

      // wrap (randomize x a bit on wrap to avoid “streams”)
      if (s.y > h + 20) {
        s.y = -20;
        s.x = randomX();
      }

      if (s.x < -30) s.x = w + 30;
      if (s.x > w + 30) s.x = -30;

      drawStar(s, t);
    }

    // scheduling: micro meteors
    if (t >= nextMicroCometAt) {
      spawnComet(COMET_KIND_MICRO);
      scheduleNextMicroComet(t);
    }

    // scheduling: big comets
    if (t >= nextBigCometAt) {
      spawnComet(COMET_KIND_BIG);
      scheduleNextBigComet(t);
    }

    // comets
    updateComets(dt);
    for (let i = 0; i < comets.length; i += 1) {
      drawComet(comets[i]);
    }

    rafId = requestAnimationFrame(tick);
  }

  function renderStatic() {
    ctx.clearRect(0, 0, w, h);
    const t = performance.now() / 1000;
    stars.forEach(s => drawStar(s, t));
  }

  function start() {
    resize();

    if (prefersReducedMotion) {
      renderStatic();
      return;
    }

    rafId = requestAnimationFrame(tick);
  }

  function stop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    lastTs = 0;
  }

  // pause animation when tab is hidden (saves CPU)
  document.addEventListener("visibilitychange", () => {
    if (prefersReducedMotion) return;

    if (document.hidden) {
      stop();
      return;
    }

    // resume
    if (!rafId) rafId = requestAnimationFrame(tick);
  });

  // handle resize (simple debounce)
  let resizeTimer = null;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      stop();
      start();
    }, 120);
  });

  start();
})();

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
    sortUnwatchedStartedToBottom();
    animateList(UNWATCHED_LIST_SELECTOR);
    return;
  }

  sortWatchedByStartDateDesc();
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

// format ISO date for UI (mm/dd/yyyy)
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
   DEFAULT SORTING
---------------------------- */

// cache initial DOM order to keep sorting stable (ties keep HTML order)
function cacheInitialOrder() {
  document.querySelectorAll(".lists ul").forEach(ul => {
    Array.from(ul.children).forEach((li, index) => {
      // set only once
      if (!li.dataset.initialIndex) {
        li.dataset.initialIndex = String(index);
      }
    });
  });
}

// get initial order index
function getInitialIndex(li) {
  const num = parseInt(li.dataset.initialIndex, 10);
  return Number.isNaN(num) ? Number.POSITIVE_INFINITY : num;
}

// helper: re-append sorted items back to UL
function sortUlItems(ul, comparator) {
  const items = Array.from(ul.querySelectorAll("li"));
  items.sort(comparator);
  items.forEach(li => ul.appendChild(li));
}

// tab 1: planned first (stable), started last (sorted by start date DESC)
function sortUnwatchedStartedToBottom() {
  const ul = document.querySelector(UNWATCHED_LIST_SELECTOR);
  if (!ul) return;

  sortUlItems(ul, (a, b) => {
    const aState = getState(a);
    const bState = getState(b);

    const aIsStarted = aState === STATE_STARTED;
    const bIsStarted = bState === STATE_STARTED;

    // started goes to the bottom
    if (aIsStarted !== bIsStarted) return aIsStarted ? 1 : -1;

    // planned group: keep original HTML order
    if (!aIsStarted && !bIsStarted) {
      return getInitialIndex(a) - getInitialIndex(b);
    }

    // started group: sort by start date DESC (newest first)
    const aDate = parseISODate(a.dataset.start);
    const bDate = parseISODate(b.dataset.start);

    // missing/invalid dates go to the bottom of the started group
    if (!aDate && !bDate) return getInitialIndex(a) - getInitialIndex(b);
    if (!aDate) return 1;
    if (!bDate) return -1;

    const diff = bDate.getTime() - aDate.getTime(); // DESC
    if (diff !== 0) return diff;

    // tie-breaker: keep original order stable
    return getInitialIndex(a) - getInitialIndex(b);
  });
}

// tab 2: watched sorted by data-start DESC (newest first)
// note: if there is start+end, we still sort by start
function sortWatchedByStartDateDesc() {
  const ul = document.querySelector(WATCHED_LIST_SELECTOR);
  if (!ul) return;

  sortUlItems(ul, (a, b) => {
    const aDate = parseISODate(a.dataset.start);
    const bDate = parseISODate(b.dataset.start);

    // put missing/invalid dates to the bottom
    if (!aDate && !bDate) return getInitialIndex(a) - getInitialIndex(b);
    if (!aDate) return 1;
    if (!bDate) return -1;

    const diff = bDate.getTime() - aDate.getTime(); // DESC
    if (diff !== 0) return diff;

    return getInitialIndex(a) - getInitialIndex(b);
  });
}

// apply both default sorts
function applyDefaultSorting() {
  sortUnwatchedStartedToBottom();
  sortWatchedByStartDateDesc();
}

/* ---------------------------
   BOOT
---------------------------- */

cacheInitialOrder();
applyDefaultSorting();

initializeTabs();
transformRatings();
renderWatchDates();
