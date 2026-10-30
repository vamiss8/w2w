// A shared decision game, with a live catalogue rather than a fixed shelf.
// The reveal is decorative; the result and all actions work with less motion.

import { imdbSearchUrl, imdbTitleUrl } from "./cards.js";
import { catalogueImdb, catalogueRequest, catalogueToken, discoverCatalogue, keepCatalogueToken } from "./catalogue.js";
import { closeDialog, openDialog, whileSaving } from "./dialogs.js";
import { openSuggestedCard } from "./editor.js";
import { fold } from "./search.js";
import { allCards, cardsLoaded } from "./store.js";

const field = id => document.getElementById(id);
const nameOf = r => r.title || r.name;
const normalized = s => fold(s).replace(/[^\p{L}\p{N}]/gu, "");
let selected = null;
let controller = null;
let connection = null;
let deck = [];
let deckKey = "";
const seen = new Set();

function known(item) {
  return allCards().some(r => (item.imdb_id && r.imdb_id === item.imdb_id) ||
    [nameOf(item), item.original_title || item.original_name].filter(Boolean)
      .some(title => normalized(title) === normalized(r.title)));
}

function clearPick() {
  selected = null;
  field("discoveryResult").hidden = true;
  field("discoveryAdd").disabled = true;
  field("discoveryPoster").removeAttribute("src");
}

function cancelDraw() {
  controller?.abort();
  controller = null;
  field("discoveryStage").classList.remove("is-drawing");
  field("discoveryStage").setAttribute("aria-busy", "false");
  field("discoveryDraw").disabled = false;
}

async function draw() {
  cancelDraw();
  clearPick();
  field("discoveryError").textContent = "";
  if (!catalogueToken()) {
    field("catalogueSettings").open = true;
    field("catalogueToken").focus();
    return;
  }
  if (!cardsLoaded()) {
    field("discoveryError").textContent = "wait for our lists to load, then try again";
    return;
  }
  const work = new AbortController();
  controller = work;
  const stage = field("discoveryStage");
  stage.setAttribute("aria-busy", "true");
  stage.classList.add("is-drawing");
  field("discoveryStatus").textContent = "finding a new story for us…";
  field("discoveryDraw").disabled = true;
  try {
    const key = `${field("discoveryKind").value}:${field("discoveryMood").value}`;
    if (deckKey !== key || !deck.length) {
      const loaded = await discoverCatalogue(field("discoveryKind").value, field("discoveryMood").value, work.signal);
      if (work.signal.aborted) return;
      deck = loaded;
      deckKey = key;
    }
    let candidates = deck.filter(r => !known(r) && !seen.has(`${r.media_type}:${r.id}`));
    while (candidates.length) {
      const item = candidates.splice(Math.floor(Math.random() * candidates.length), 1)[0];
      seen.add(`${item.media_type}:${item.id}`);
      // An unavailable IMDb ID should not discard an otherwise useful pick.
      try { item.imdb_id = await catalogueImdb(item, work.signal); } catch (e) {
        if (work.signal.aborted) throw e;
        item.imdb_id = null;
      }
      if (known(item)) continue;
      // Wait for the short reel once, without forcing motion on anyone.
      if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
        await new Promise(resolve => {
          const timer = setTimeout(resolve, 850);
          work.signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
        });
      }
      if (work.signal.aborted) return;
      selected = item;
      show(item);
      return;
    }
    // A later draw fetches another page, while the seen set prevents repeats.
    deck = [];
    field("discoveryStatus").textContent = "we have seen this batch. draw again for more, or change the mood";
  } catch (e) {
    if (!work.signal.aborted) {
      field("discoveryError").textContent = e.message;
      field("discoveryStatus").textContent = "the catalogue is taking a break";
    }
  } finally {
    if (controller === work) cancelDraw();
  }
}

function show(item) {
  field("discoveryStatus").textContent = "our next story?";
  field("discoveryTitle").textContent = nameOf(item);
  const year = (item.release_date || item.first_air_date || "").slice(0, 4);
  field("discoveryMeta").textContent = [item.media_type === "movie" ? "film" : "series", year,
    item.vote_average ? `${Number(item.vote_average).toFixed(1)}/10 on TMDB` : ""].filter(Boolean).join(" · ");
  field("discoveryOverview").textContent = item.overview || "a new story to explore together";
  const poster = field("discoveryPoster");
  const hasPoster = /^\/[a-zA-Z0-9]+\.(jpg|png)$/.test(item.poster_path || "");
  poster.hidden = !hasPoster;
  if (hasPoster) poster.src = `https://image.tmdb.org/t/p/w342${item.poster_path}`;
  field("discoveryImdb").href = item.imdb_id ? imdbTitleUrl(item.imdb_id) : imdbSearchUrl(nameOf(item));
  field("discoveryImdb").dataset.hint = item.imdb_id ? "open its page on imdb" : "search imdb for this title";
  field("discoveryResult").hidden = false;
  field("discoveryAdd").disabled = false;
  field("discoveryDraw").textContent = "another story";
}

export function initializeDiscovery() {
  document.querySelector("[data-discover]").addEventListener("click", () => {
    field("catalogueSettings").open = !catalogueToken();
    field("catalogueConnection").textContent = catalogueToken() ? "connected in this browser" : "connect once to start";
    openDialog("discoveryDialog", catalogueToken() ? "discoveryDraw" : "catalogueToken");
  });
  field("discoveryDialog").addEventListener("close", () => {
    cancelDraw();
    connection?.abort();
    field("catalogueToken").value = "";
  });
  field("discoveryDraw").addEventListener("click", draw);
  for (const id of ["discoveryKind", "discoveryMood"]) field(id).addEventListener("change", () => {
    cancelDraw();
    clearPick();
    field("discoveryError").textContent = "";
    field("discoveryStatus").textContent = "ready for a different story";
  });
  field("discoveryAdd").addEventListener("click", () => {
    if (!selected) return;
    if (known(selected)) {
      field("discoveryError").textContent = "this story is already in our lists";
      return;
    }
    closeDialog("discoveryDialog");
    openSuggestedCard({ title: nameOf(selected), imdb_id: selected.imdb_id });
  });
  field("catalogueForm").addEventListener("submit", e => {
    e.preventDefault();
    whileSaving(field("catalogueConnect"), async () => {
      const token = field("catalogueToken").value.trim().replace(/^Bearer\s+/i, "");
      if (!token) return;
      field("discoveryError").textContent = "";
      const work = new AbortController();
      connection = work;
      try {
        await catalogueRequest("configuration", {}, { token, signal: work.signal });
        if (work.signal.aborted) return;
        cancelDraw();
        clearPick();
        keepCatalogueToken(token);
        field("catalogueToken").value = "";
        field("catalogueSettings").open = false;
        field("catalogueConnection").textContent = "connected in this browser";
        deck = [];
        seen.clear();
        field("discoveryDraw").focus();
      } catch (e) {
        if (!work.signal.aborted) field("discoveryError").textContent = e.message;
      } finally {
        if (connection === work) connection = null;
      }
    });
  });
  field("catalogueForget").addEventListener("click", () => {
    cancelDraw();
    connection?.abort();
    keepCatalogueToken("");
    deck = [];
    seen.clear();
    clearPick();
    field("catalogueConnection").textContent = "disconnected in this browser";
    field("catalogueSettings").open = true;
    field("discoveryStatus").textContent = "a new story is waiting";
  });
}
