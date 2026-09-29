// who is using the site right now, vlad or vika. it is a choice remembered in
// localStorage, not a sign-in: it decides whose hearts and comments a click
// changes and whose name goes into the activity log.

import { remoteInsertLog } from "./db.js";
import { updateRatingEditability } from "./ratings.js";

const LS_ACTIVE_USER = "activeUser";

export function getActiveUser() {
  const v = (localStorage.getItem(LS_ACTIVE_USER) || "").trim().toLowerCase();
  return v === "vlad" || v === "vika" ? v : null;
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

export function openAuthOverlay() {
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

export function initializeAuth() {
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
