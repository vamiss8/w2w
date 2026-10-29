// the two rows of hearts on a watched card. each of us can fill in only our
// own row, so which one answers clicks follows the signed-in user.

import { remoteInsertLog, remoteUpdateRating } from "./db.js";
import { getCard, patchCard } from "./store.js";
import { getActiveUser } from "./user.js";

const OWNERS = ["vlad", "vika"];

function createRatingRow(owner, score) {
  const row = document.createElement("div");
  row.className = "rating-row";
  row.dataset.owner = owner;
  row.classList.toggle("is-editable", getActiveUser() === owner);

  const label = document.createElement("div");
  label.className = "rating-name";
  label.textContent = owner;

  const hearts = document.createElement("div");
  hearts.className = "rating-stars";

  for (let s = 1; s <= 10; s += 1) {
    const heart = document.createElement("span");
    heart.className = `rating-heart ${owner}`;
    heart.textContent = "❤";
    heart.dataset.owner = owner;
    heart.dataset.score = String(s);
    heart.classList.toggle("filled", s <= score);
    hearts.appendChild(heart);
  }

  row.append(label, hearts);
  return row;
}

export function renderRatings(row) {
  const rating = document.createElement("div");
  rating.className = "rating";
  OWNERS.forEach(owner => rating.appendChild(createRatingRow(owner, row[`${owner}_score`] ?? 0)));
  return rating;
}

// a click in your own row sets your score. the card shows it at once, and if
// the database refuses, the score it had comes back
async function handleRatingClick(target) {
  const heart = target.closest(".rating-heart");
  if (!heart) return;

  const owner = heart.dataset.owner;
  const score = parseInt(heart.dataset.score || "0", 10);
  if (!OWNERS.includes(owner) || Number.isNaN(score)) return;
  if (getActiveUser() !== owner) return;

  const id = heart.closest("li")?.dataset.id;
  const card = id && getCard(id);
  if (!card) return;

  const before = patchCard(id, { [`${owner}_score`]: score });
  const saved = await remoteUpdateRating(id, owner, score);

  if (!saved) {
    patchCard(id, { [`${owner}_score`]: before[`${owner}_score`] });
    return;
  }

  await remoteInsertLog("rate", { title: card.title, score }, id);
}

function setRatingHoverPreview(row, hoverScore) {
  row.querySelectorAll(".rating-heart").forEach(h => {
    const s = parseInt(h.dataset.score || "0", 10);
    h.classList.toggle("hovered", s <= hoverScore);
    h.classList.toggle("hovered-peak", s === hoverScore);
  });
}

function clearRatingHoverPreview(row) {
  row.querySelectorAll(".rating-heart").forEach(h => h.classList.remove("hovered", "hovered-peak"));
}

export function initializeRatingEditing() {
  document.addEventListener("click", e => handleRatingClick(e.target));

  // the preview only in the row that would answer the click
  document.addEventListener("mouseover", e => {
    const heart = e.target.closest(".rating-heart");
    const row = heart?.closest(".rating-row");
    if (!row || !row.classList.contains("is-editable")) return;
    setRatingHoverPreview(row, parseInt(heart.dataset.score || "0", 10));
  });

  document.addEventListener("mouseout", e => {
    const row = e.target.closest(".rating-row");
    if (!row || !row.classList.contains("is-editable")) return;
    // only on the way out of the row, not from one heart to the next
    if (row.contains(e.relatedTarget)) return;
    clearRatingHoverPreview(row);
  });
}
