// the two rows of hearts on a watched card. each of us can fill in only our
// own row, so which one answers clicks follows the signed-in user.

import { getCardId, getTitleFromCard } from "./cards.js";
import { getSupabase, remoteInsertLog, remoteUpdateRating } from "./db.js";
import { getActiveUser } from "./user.js";
import { TAB_INPUT_SELECTOR, UNWATCHED_TAB_ID, scheduleActiveTabView } from "./view.js";

function createHearts(score, owner) {
  const wrapper = document.createElement("div");
  wrapper.className = "rating-stars";

  for (let currentScore = 1; currentScore <= 10; currentScore += 1) {
    const heart = document.createElement("span");
    heart.className = `rating-heart ${owner}`;
    heart.textContent = "❤";

    // read back by the click handler
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

export function renderRatings(metaElement, scores) {
  const rating = document.createElement("div");
  rating.className = "rating";

  rating.appendChild(createRatingRow("vlad", scores.vladScore));
  rating.appendChild(createRatingRow("vika", scores.vikaScore));

  metaElement.innerHTML = "";
  metaElement.appendChild(rating);
}

export function updateRatingEditability() {
  const active = getActiveUser();

  document.querySelectorAll(".rating-row").forEach(row => {
    const owner = (row.dataset.owner || "").trim().toLowerCase();
    row.classList.toggle("is-editable", !!active && owner === active);
  });
}

export function updateHeartsFill(wrapper, score) {
  wrapper.querySelectorAll(".rating-heart").forEach(h => {
    const s = parseInt(h.dataset.score || "0", 10);
    h.classList.toggle("filled", !Number.isNaN(s) && s <= score);
  });
}

// a click in your own row sets your score. the hearts fill at once, and the
// realtime echo of the saved row lands on the same value a moment later
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

  if (sb && cardId) {
    await remoteUpdateRating(cardId, owner, score);
    await remoteInsertLog("rate", { title: getTitleFromCard(li), score }, cardId);
  }

  // the favourites sort reads scores off the card, so it has to see this one
  // before the echo does
  if (owner === "vlad") li.dataset.vladScore = String(score);
  if (owner === "vika") li.dataset.vikaScore = String(score);

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

export function initializeRatingEditing() {
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
