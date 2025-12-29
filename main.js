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

/* =========================
   REALTIME (SUPABASE)
   ========================= */

let realtimeChannel = null; // --------------------------- declare explicitly ----------------------------


async function initializeRealtime() {
  const sb = getSupabase();
  if (!sb) return;

  // --------------------------- seed once if db empty ----------------------------
  await remoteSeedIfEmpty();

  // --------------------------- initial pull ----------------------------
  await remotePullAll();

  realtimeChannel = sb
    .channel("w2w-db")
    .on("postgres_changes", { event: "*", schema: "public", table: "cards" }, payload => {
      if (payload.eventType === "DELETE") return;
      if (payload.new) applyRemoteCardToDom(payload.new);
      scheduleActiveTabView({ animate: false });
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "logs" }, payload => {
      if (!payload.new) return;
      const panel = document.getElementById(LOGS_PANEL_ID);
      if (panel && panel.dataset.open === "true") prependRemoteLog(payload.new);
    })
    .subscribe((status) => {
      console.log("[realtime]", status);
    });
}

function prependRemoteLog(row) {
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

  // prepend
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

async function remoteSeedIfEmpty() {
  const sb = getSupabase();
  if (!sb) return;

  const { data, error } = await sb.from("cards").select("id").limit(1);
  if (error) {
    console.error("[supabase] seed check failed", error);
    return;
  }

  if (data && data.length > 0) return;

  const payload = Array.from(document.querySelectorAll(".lists li"))
    .map(li => readCardPayloadFromLi(li))
    .filter(Boolean);

  const res = await sb.from("cards").upsert(payload, { onConflict: "id" });
  if (res.error) console.error("[supabase] seed upsert failed", res.error);
  else console.log("[supabase] seeded", payload.length, "cards");
}

/* =========================
   REMOTE SYNC (SUPABASE)
   ========================= */

const REMOTE = {
  enabled: true,
  url: "https://esdhstxcxxgcexddkxqi.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzZGhzdHhjeHhnY2V4ZGRreHFpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2Nzg1ODcsImV4cCI6MjA4MjI1NDU4N30.Tnes90BskmTxvxNaOSJkI1ah6MuQz7rmnKAeG_mtbiA",
  pollMs: 10_000,
};

function getSupabase() {
  if (!REMOTE.enabled) return null;
  if (!window.supabase) return null;

  if (!getSupabase.client) {
    getSupabase.client = window.supabase.createClient(REMOTE.url, REMOTE.anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }

  return getSupabase.client;
}

function getTabFromLi(li) {
  if (!li) return "unwatched";
  const parent = li.closest("ul");
  if (!parent) return "unwatched";
  return parent.classList.contains("watched") ? "watched" : "unwatched";
}

function readTitleFromLi(li) {
  const el = li?.querySelector(".filmTitle");
  if (!el) return "unknown title";
  // take only the title node (watch-date label is appended later)
  return (el.childNodes[0]?.textContent || el.textContent || "").trim();
}

function readCardPayloadFromLi(li) {
  const id = parseInt(getCardId(li) || "0", 10);
  if (!id) return null;

  return {
    id,
    title: readTitleFromLi(li),
    tab: getTabFromLi(li),
    state: getState(li),
    status: (li.dataset.status || "00").trim(),
    start_date: (li.dataset.start || "").trim() || null,
    end_date: (li.dataset.end || "").trim() || null,
    vlad_score: parseInt(li.dataset.vladScore || "0", 10) || 0,
    vika_score: parseInt(li.dataset.vikaScore || "0", 10) || 0,
  };
}

function applyRemoteCardToDom(row) {
  const id = String(row.id);
  const li = document.querySelector(`.lists li[data-id="${CSS.escape(id)}"]`);
  if (!li) return;

  li.dataset.vladScore = String(row.vlad_score ?? 0);
  li.dataset.vikaScore = String(row.vika_score ?? 0);

  // --------------------------- keep local cache in sync with server ----------------------------
  storeScore(li, "vlad", parseInt(li.dataset.vladScore || "0", 10) || 0);
  storeScore(li, "vika", parseInt(li.dataset.vikaScore || "0", 10) || 0);

  const vRow = li.querySelector('.rating-row[data-owner="vlad"] .rating-stars');
  const kRow = li.querySelector('.rating-row[data-owner="vika"] .rating-stars');
  if (vRow) updateHeartsFill(vRow, parseInt(li.dataset.vladScore || "0", 10));
  if (kRow) updateHeartsFill(kRow, parseInt(li.dataset.vikaScore || "0", 10));

  // update watch-date label
  upsertWatchDateLabel(li);

  // update status badge ui (text + color + tooltip)
  syncStatusBadge(li);

  // update watch-date label
  upsertWatchDateLabel(li);
}

let remoteLastSyncIso = null;

/* =========================
   REMOTE CURSOR HELPERS
   ========================= */

function maxUpdatedAt(rows) {
  let max = null;
  rows.forEach(r => {
    const v = r.updated_at;
    if (!v) return;
    if (!max || String(v) > String(max)) max = v; // iso strings compare ok
  });
  return max;
}

async function remotePullAll() {
  const sb = getSupabase();
  if (!sb) return;

  const { data, error } = await sb
    .from("cards")
    .select("*")
    .order("id", { ascending: true });

  if (error || !data) {
    console.error("[supabase] remotePullAll failed", error);
    return;
  }

  data.forEach(row => applyRemoteCardToDom(row));

  // cursor: use server updated_at, not client time
  remoteLastSyncIso = maxUpdatedAt(data) || remoteLastSyncIso;
}

async function remotePullChanges() {
  const sb = getSupabase();
  if (!sb) return;

  const cursor = remoteLastSyncIso || "1970-01-01T00:00:00.000Z";

  const { data, error } = await sb
    .from("cards")
    .select("*")
    .gt("updated_at", cursor)
    .order("updated_at", { ascending: true });

  if (error || !data) {
    console.error("[supabase] remotePullChanges failed", error);
    return;
  }

  if (data.length > 0) {
    data.forEach(row => applyRemoteCardToDom(row));

    // re-apply sorting/filters, but do not restart animations
    scheduleActiveTabView({ animate: false });

    remoteLastSyncIso = maxUpdatedAt(data) || remoteLastSyncIso;
  }
}

async function remoteUpdateRating(cardId, owner, score) {
  const sb = getSupabase();
  if (!sb) return;

  const id = parseInt(cardId, 10);
  if (Number.isNaN(id)) return;

  const patch = owner === "vlad" ? { vlad_score: score } : { vika_score: score };

  const { error } = await sb.from("cards").update(patch).eq("id", id);
  if (error) console.error("[supabase] update rating failed", error);
}

async function remoteInsertLog(action, details, cardIdOrNull) {
  const sb = getSupabase();
  if (!sb) return;

  const user = getActiveUser();
  if (!user) return;

  const cardId = cardIdOrNull ? parseInt(cardIdOrNull, 10) : null;

  const { error } = await sb.from("logs").insert({
    user_name: user,
    action,
    card_id: Number.isNaN(cardId) ? null : cardId,
    details: details || {},
  });

  if (error) console.error("[supabase] insert log failed", error);
}

async function initializeRemoteSync() {
  if (!REMOTE.enabled) return;

  await remoteSeedIfEmpty();
  await remotePullAll();

  window.setInterval(() => {
    remotePullChanges();
  }, REMOTE.pollMs);
}

/* ---------------------------
   AUTH (VLAD / VIKA) + LOGS
---------------------------- */

const LS_ACTIVE_USER = "activeUser";
const LS_EVENT_LOG = "eventLog";

function getActiveUser() {
  const v = (localStorage.getItem(LS_ACTIVE_USER) || "").trim().toLowerCase();
  return v === "vlad" || v === "vika" ? v : null;
}

function writeLog(action, details = {}) {
  const list = JSON.parse(localStorage.getItem(LS_EVENT_LOG) || "[]");

  list.push({
    ts: new Date().toISOString(),
    user: getActiveUser() || "unknown",
    action,
    details,
  });

  // keep log size sane
  const MAX_LOG_ITEMS = 250;
  while (list.length > MAX_LOG_ITEMS) list.shift();

  localStorage.setItem(LS_EVENT_LOG, JSON.stringify(list));

  // refresh logs ui if present
  refreshLogsUI();
}

async function setActiveUser(user) {
  const normalized = String(user || "").trim().toLowerCase();
  if (normalized !== "vlad" && normalized !== "vika") return;

  localStorage.setItem(LS_ACTIVE_USER, normalized);

  updateUserUI();
  closeAuthOverlay();

  // --------------------------- log login to remote ----------------------------
  await remoteInsertLog("login", { as: normalized }, null);
}

function updateUserUI() {
  const btn = document.getElementById("userToggle");
  if (!btn) return;

  const user = getActiveUser();
  btn.textContent = `USER: ${user ? user.toUpperCase() : "—"}`;

  updateRatingEditability();
}

function openAuthOverlay() {
  const overlay = document.getElementById("authOverlay");
  if (!overlay) return;

  overlay.classList.add("is-open");
  overlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("auth-open");

  const first = overlay.querySelector(".auth-choice");
  if (first) first.focus();
}

function closeAuthOverlay() {
  const overlay = document.getElementById("authOverlay");
  if (!overlay) return;

  overlay.classList.remove("is-open");
  overlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("auth-open");
}

function initializeAuth() {
  const overlay = document.getElementById("authOverlay");
  if (!overlay) return;

  // choices
  overlay.querySelectorAll(".auth-choice").forEach(btn => {
    btn.addEventListener("click", () => {
      setActiveUser(btn.dataset.user);
    });
  });

  // switch user button
  const userBtn = document.getElementById("userToggle");
  if (userBtn) {
    userBtn.addEventListener("click", () => {
      openAuthOverlay();
    });
  }

  // initial state
  updateUserUI();

  if (!getActiveUser()) {
    openAuthOverlay();
  }
}

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

// restart CSS animation for visible cards (so sorting/filtering feels responsive)
function restartListAnimations(listSelector) {
  const cards = document.querySelectorAll(`${listSelector} li:not(.is-hidden)`);

  cards.forEach(card => {
    card.style.animation = "none";
  });

  // force reflow once
  void document.body.offsetHeight;

  cards.forEach(card => {
    card.style.animation = "";
  });
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

/* =========================
   VIEW REFRESH SCHEDULER
   ========================= */

let viewRefreshRaf = 0;
let viewRefreshAnimate = false;

function scheduleActiveTabView({ animate = false } = {}) {
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
  scheduleActiveTabView({ animate: true })
}

function initializeTabs() {
  document.querySelectorAll(TAB_INPUT_SELECTOR).forEach(tab => {
    tab.addEventListener("change", () => handleTabChange(tab));
  });

  restoreActiveTab();   // just sets the checked tab if saved
}

/* ---------------------------
   FILTERS TOGGLE (PERSIST)
---------------------------- */

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

function initializeFiltersToggle() {
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

/* ---------------------------
   LOGS WIDGET (BOTTOM LEFT)
---------------------------- */

const LOGS_PANEL_ID = "logsPanel";
const LOGS_TOGGLE_ID = "logsToggle";
const LOGS_LIST_ID = "logsList";

const LS_LOGS_OPEN = "logsOpen";

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

function renderLogLine(entry, textEl) {
  const userRaw = String(entry.user || "").trim().toLowerCase();
  const user = capUser(userRaw);

  // clear
  textEl.innerHTML = "";

  if (entry.action === "rate") {
    const title = entry.details?.title || "unknown title";
    const score = entry.details?.score ?? "—";

    const em = document.createElement("em");
    em.className = "log-title";
    em.textContent = title;

    const scoreEl = document.createElement("span");
    scoreEl.className = `log-score ${userRaw === "vlad" ? "vlad" : userRaw === "vika" ? "vika" : ""}`;
    scoreEl.textContent = `${score}/10`;

    textEl.appendChild(document.createTextNode(`${user} rated `));
    textEl.appendChild(em);
    textEl.appendChild(document.createTextNode(" "));
    textEl.appendChild(scoreEl);
    textEl.appendChild(document.createTextNode(" hearts!"));
    return;
  }

  if (entry.action === "comment") {
    const title = entry.details?.title || "unknown title";
    const c = entry.details?.text || "";

    const em = document.createElement("em");
    em.className = "log-title";
    em.textContent = title;

    textEl.appendChild(document.createTextNode(`${user} left a comment to `));
    textEl.appendChild(em);
    textEl.appendChild(document.createTextNode(`: "${c}"`));
    return;
  }

  // fallback
  textEl.textContent = `${user} did ${entry.action}.`;
}

function logEntryToText(entry) {
  const user = capUser(entry.user);

  if (entry.action === "login") {
    const as = (entry.details?.as || "").toString().toUpperCase();
    return `${user} signed in as ${as}.`;
  }

  if (entry.action === "rate") {
    const title = entry.details?.title || "unknown title";
    const score = entry.details?.score ?? "—";
    return `${user} rated ${title} ${score}/10 hearts!`;
  }

  if (entry.action === "comment") {
    const title = entry.details?.title || "unknown title";
    const text = entry.details?.text || "";
    return `${user} left a comment to ${title}: "${text}"`;
  }

  // fallback
  return `${user} did ${entry.action}.`;
}

/* =========================
   LOGS (REMOTE FIRST)
   ========================= */

async function renderLogs() {
  const listEl = document.getElementById(LOGS_LIST_ID);
  if (!listEl) return;

  listEl.innerHTML = "";

  const sb = getSupabase();

  // if remote enabled -> load from server
  if (sb) {
    const { data, error } = await sb
      .from("logs")
      .select("*")
      .order("ts", { ascending: false })
      .limit(60);

    if (error || !data) {
      // fallback ui
      const li = document.createElement("li");
      li.className = "log-item";
      li.innerHTML = `
        <div class="log-time">logs unavailable</div>
        <div class="log-text">could not load remote logs.</div>
      `;
      listEl.appendChild(li);
      return;
    }

    if (data.length === 0) {
      const li = document.createElement("li");
      li.className = "log-item";
      li.innerHTML = `
        <div class="log-time">no activity yet</div>
        <div class="log-text">pick a user, rate something, move cards, leave comments — it will appear here.</div>
      `;
      listEl.appendChild(li);
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


    return;
  }

  // fallback to local (old behavior) if remote disabled
  const list = JSON.parse(localStorage.getItem(LS_EVENT_LOG) || "[]");
  const sorted = list.slice().reverse();

  if (sorted.length === 0) {
    const li = document.createElement("li");
    li.className = "log-item";

    const t = document.createElement("div");
    t.className = "log-time";
    t.textContent = "no activity yet";

    const txt = document.createElement("div");
    txt.className = "log-text";
    txt.textContent = "pick a user, rate something, move cards, leave comments — it will appear here.";

    li.appendChild(t);
    li.appendChild(txt);
    listEl.appendChild(li);
    return;
  }

  sorted.forEach(entry => {
    const li = document.createElement("li");
    li.className = "log-item";

    const time = document.createElement("div");
    time.className = "log-time";
    time.textContent = formatTimeAgo(entry.ts);

    const text = document.createElement("div");
    text.className = "log-text";
    renderLogLine(entry, text);

    li.appendChild(time);
    li.appendChild(text);
    listEl.appendChild(li);
  });
}

function refreshLogsUI() {
  const panel = document.getElementById(LOGS_PANEL_ID);
  if (!panel) return;

  // update only when open (saves work)
  if (panel.dataset.open === "true") renderLogs();
}

function initializeLogsWidget() {
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
}

/* ---------------------------
   TOOLTIP AUTO-FLIP (UP/DOWN)
---------------------------- */

function autoFlipTooltip(anchorEl) {
  const tooltip = anchorEl.querySelector(".tooltip");
  if (!tooltip) return;

  // reset to default (up)
  tooltip.classList.remove("tooltip-down");

  const a = anchorEl.getBoundingClientRect();
  const tooltipHeight = tooltip.offsetHeight || 0;

  // approximate space we need (height + arrow + a bit of air)
  const needed = tooltipHeight + 18;

  const spaceTop = a.top;
  const spaceBottom = window.innerHeight - a.bottom;

  // if there's not enough space above, and more space below -> flip down
  if (needed > spaceTop && spaceBottom > spaceTop) {
    tooltip.classList.add("tooltip-down");
  }
}

function initializeTooltipAutoFlip() {
  const anchors = document.querySelectorAll(".chip, .info-badge, .status");

  anchors.forEach(anchor => {
    anchor.addEventListener("mouseenter", () => autoFlipTooltip(anchor));
    anchor.addEventListener("focusin", () => autoFlipTooltip(anchor));
  });

  // keep it robust on resize
  window.addEventListener("resize", () => {
    // nothing to do until next hover/focus
  });
}

/* ---------------------------
   CARD STATUS TOOLTIPS (00/01/10/11)
---------------------------- */

const STATUS_TOOLTIP_TEXT = {
  "00": "no one watched.",
  "01": "vika's first time.",
  "10": "vlad's first time.",
  "11": "rewatch.",
};

const STATUS_CODES = ["00", "01", "10", "11"];

function normalizeStatusCode(value) {
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

function syncAllStatusBadges() {
  document.querySelectorAll(".lists li").forEach(li => syncStatusBadge(li));
}

function initializeCardStatusTooltips() {
  document.querySelectorAll(".lists li").forEach(li => {
    const badge = li.querySelector(".status");
    if (!badge) return;

    // avoid duplicates
    if (badge.querySelector(".tooltip")) return;

    const code = (li.dataset.status || badge.textContent || "").trim();
    const text = STATUS_TOOLTIP_TEXT[code];
    if (!text) return;

    // keyboard accessibility
    badge.setAttribute("tabindex", "0");
    badge.setAttribute("role", "button");
    badge.setAttribute("aria-label", `Status ${code} info`);

    const tip = document.createElement("span");
    tip.className = "tooltip";
    tip.innerHTML = text;

    badge.appendChild(tip);
  });
}

/* ---------------------------
   CONTROLS (SORT/FILTER)
---------------------------- */

const LS_UW_PROGRESS = "uwProgress";
const LS_UW_STATUS = "uwStatus";
const LS_W_SORT = "wSort";
const LS_W_STATUS = "wStatus";

function getCheckedIdByName(name) {
  const el = document.querySelector(`input[name="${name}"]:checked`);
  return el ? el.id : null;
}

function safeInt(value, fallback = Number.NEGATIVE_INFINITY) {
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? fallback : n;
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

// watched sorting: recent OR favorites
function sortWatchedByMode() {
  const ul = document.querySelector(WATCHED_LIST_SELECTOR);
  if (!ul) return;

  const mode = getWatchedSortMode();

  sortUlItems(ul, (a, b) => {
    const aDate = parseISODate(a.dataset.start);
    const bDate = parseISODate(b.dataset.start);

    // helper: date desc (newest first)
    function dateDesc() {
      if (!aDate && !bDate) return getInitialIndex(a) - getInitialIndex(b);
      if (!aDate) return 1;
      if (!bDate) return -1;

      const diff = bDate.getTime() - aDate.getTime();
      if (diff !== 0) return diff;

      return getInitialIndex(a) - getInitialIndex(b);
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

/* =========================
   APPLY VIEW (ANIMATABLE)
   ========================= */

function applyUnwatchedView({ animate = true } = {}) {
  sortUnwatchedStartedToBottom();
  applyUnwatchedFilters();

  if (animate) animateList(UNWATCHED_LIST_SELECTOR);
  else showFooterInstantly();
}

function applyWatchedView({ animate = true } = {}) {
  sortWatchedByMode();
  applyWatchedFilters();

  if (animate) animateList(WATCHED_LIST_SELECTOR);
  else showFooterInstantly();
}

function applyActiveTabView({ animate = true } = {}) {
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

function initializeControls() {
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

    // data for click handling
    heart.dataset.owner = owner;
    heart.dataset.score = String(currentScore);

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
  row.dataset.owner = name;

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
  document.querySelectorAll(".watched li").forEach(li => {
    const meta = li.querySelector(".meta");
    if (!meta) return;

    // prefer stored ratings; fallback to meta text parse
    const stored = getStoredScores(li);

    let scores = null;

    if (stored && (stored.vladScore !== null || stored.vikaScore !== null)) {
      scores = {
        vladScore: stored.vladScore ?? 0,
        vikaScore: stored.vikaScore ?? 0,
      };
    } else {
      scores = extractScores(meta.textContent.trim());
      if (!scores) return;

      // seed storage once from initial html meta
      storeScore(li, "vlad", scores.vladScore);
      storeScore(li, "vika", scores.vikaScore);
    }

    // store scores on the card for sorting
    li.dataset.vladScore = String(scores.vladScore);
    li.dataset.vikaScore = String(scores.vikaScore);

    renderRatings(meta, scores);
  });

  // apply editability styles
  updateRatingEditability();
}

/* ---------------------------
   RATINGS STORAGE + EDITING
---------------------------- */

const LS_RATINGS_MAP = "ratingsMap";

// stable per-card key (uses title text)
/* =========================
   CARD ID (STABLE KEY)
   ========================= */

function getCardId(li) {
  const raw = (li?.dataset?.id || "").trim();
  const n = parseInt(raw, 10);
  if (!Number.isNaN(n) && n > 0) return String(n);
  return null;
}

// stable per-card key
function getCardKey(li) {
  const id = getCardId(li);
  if (id) return id;

  // fallback (legacy): title-based
  const titleEl = li?.querySelector(".filmTitle");
  const raw = titleEl ? titleEl.textContent : "";
  return raw.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 120) || "unknown";
}

function loadRatingsMap() {
  try {
    return JSON.parse(localStorage.getItem(LS_RATINGS_MAP) || "{}");
  } catch {
    return {};
  }
}

function saveRatingsMap(map) {
  localStorage.setItem(LS_RATINGS_MAP, JSON.stringify(map || {}));
}

function getStoredScores(li) {
  const key = getCardKey(li);
  const map = loadRatingsMap();
  const entry = map[key];
  if (!entry) return null;

  const vladScore = parseInt(entry.vlad, 10);
  const vikaScore = parseInt(entry.vika, 10);

  return {
    vladScore: Number.isNaN(vladScore) ? null : vladScore,
    vikaScore: Number.isNaN(vikaScore) ? null : vikaScore,
  };
}

function storeScore(li, owner, score) {
  const key = getCardKey(li);
  const map = loadRatingsMap();

  if (!map[key]) map[key] = {};
  map[key][owner] = score;

  saveRatingsMap(map);
}

function updateRatingEditability() {
  const active = getActiveUser();

  document.querySelectorAll(".rating-row").forEach(row => {
    const owner = (row.dataset.owner || "").trim().toLowerCase();
    row.classList.toggle("is-editable", !!active && owner === active);
  });
}

function getTitleFromCard(li) {
  const t = li?.querySelector(".filmTitle");
  return t ? t.childNodes[0].textContent.trim() : "unknown title";
}

function updateHeartsFill(wrapper, score) {
  wrapper.querySelectorAll(".rating-heart").forEach(h => {
    const s = parseInt(h.dataset.score || "0", 10);
    h.classList.toggle("filled", !Number.isNaN(s) && s <= score);
  });
}

/* =========================
   AUTH (SUPABASE EMAIL OTP) — THROTTLED + CORRECT USER
   ========================= */

const LS_OTP_LAST_AT = "otpLastAtMs";
const OTP_COOLDOWN_MS = 65_000;

async function getSessionEmailLower(sb) {
  const { data } = await sb.auth.getSession();
  const email = data?.session?.user?.email || "";
  return email.trim().toLowerCase() || null;
}

/* =========================
   RATING CLICK HANDLER (NO AUTH)
   ========================= */

async function handleRatingClick(target) {
  const heart = target.closest(".rating-heart");
  if (!heart) return;

  const owner = (heart.dataset.owner || "").trim().toLowerCase();
  const score = parseInt(heart.dataset.score || "0", 10);
  if (!owner || Number.isNaN(score)) return;

  const active = getActiveUser();
  if (!active || active !== owner) return;

  const li = heart.closest("li");
  if (!li) return;

  const cardId = getCardId(li);
  const sb = getSupabase();

  // persist locally for instant ui + offline fallback
  storeScore(li, owner, score);

  if (sb && cardId) {
    await remoteUpdateRating(cardId, owner, score);
    await remoteInsertLog("rate", { title: getTitleFromCard(li), score }, cardId);
  } else {
    writeLog("rate", { title: getTitleFromCard(li), score });
  }

  // update card dataset for sorting
  if (owner === "vlad") li.dataset.vladScore = String(score);
  if (owner === "vika") li.dataset.vikaScore = String(score);

  // update ui
  const row = heart.closest(".rating-row");
  if (!row) return;

  const stars = row.querySelector(".rating-stars");
  if (stars) updateHeartsFill(stars, score);

  clearRatingHoverPreview(row);

  const activeTab = document.querySelector(`${TAB_INPUT_SELECTOR}:checked`);
  if (activeTab && activeTab.id !== UNWATCHED_TAB_ID) {
    scheduleActiveTabView({ animate: false });
  }
}

/* ---------------------------
   RATING HOVER PREVIEW
---------------------------- */

function setRatingHoverPreview(row, hoverScore) {
  const hearts = row.querySelectorAll(".rating-heart");

  hearts.forEach(h => {
    const s = parseInt(h.dataset.score || "0", 10);
    if (Number.isNaN(s)) return;

    const on = s <= hoverScore;

    h.classList.toggle("hovered", on);
    h.classList.toggle("hovered-peak", s === hoverScore);
  });
}

function clearRatingHoverPreview(row) {
  row.querySelectorAll(".rating-heart").forEach(h => {
    h.classList.remove("hovered");
    h.classList.remove("hovered-peak");
  });
}

function initializeRatingEditing() {
  // click to commit rating
  document.addEventListener("click", e => handleRatingClick(e.target));

  // hover preview (only editable row)
  document.addEventListener("mouseover", e => {
    const heart = e.target.closest(".rating-heart");
    if (!heart) return;

    const row = heart.closest(".rating-row");
    if (!row || !row.classList.contains("is-editable")) return;

    const score = parseInt(heart.dataset.score || "0", 10);
    if (Number.isNaN(score)) return;

    setRatingHoverPreview(row, score);
  });

  document.addEventListener("mouseout", e => {
    const row = e.target.closest(".rating-row");
    if (!row || !row.classList.contains("is-editable")) return;

    // clear only when leaving the row (not moving between hearts)
    if (row.contains(e.relatedTarget)) return;

    clearRatingHoverPreview(row);
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

/* =========================
   BOOT
   ========================= */

(async function boot() {
  cacheInitialOrder();

  transformRatings();
  renderWatchDates();
  syncAllStatusBadges();

  initializeAuth(); // --------------------------- ui first ----------------------------
  initializeFiltersToggle();
  initializeLogsWidget();
  initializeRatingEditing();
  initializeTooltipAutoFlip();
  initializeControls();
  initializeTabs();

  try {
    await initializeRealtime();
  } catch (e) {
    console.error("[supabase] initializeRealtime crashed", e);
  }

  applyActiveTabView({ animate: true });
})();
