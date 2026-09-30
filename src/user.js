// who is using the site: vlad, vika, or a guest. a magic link signs a browser
// in, supabase keeps the session, and app_user() in the database says which
// of us the session belongs to. a guest reads the cards and the activity log
// and nothing else: the database refuses everything more.

import { onAuthChange, remoteInsertLog, remoteSendMagicLink, remoteSignOut, remoteWhoAmI } from "./db.js";
import { updateRatingEditability } from "./ratings.js";

// the old sign-in stored a name picked from two buttons here. it means
// nothing now, so it goes
localStorage.removeItem("activeUser");

// read before supabase-js takes the tokens out of the address bar. arriving
// through the link is the one sign-in worth a line in the activity log:
// supabase reports SIGNED_IN again every time the tab comes back into focus
const linkParams = new URLSearchParams(location.hash.slice(1));
const ARRIVED_FROM_LINK = linkParams.has("access_token");
const LINK_ERROR = linkParams.get("error_description");

let activeUser = null;
let hasSession = false;
let arrivalLogged = false;
const listeners = [];

// "vlad", "vika", or null for a guest and for an account that is not ours
export function getActiveUser() {
  return activeUser;
}

// called with the new name whenever it changes, so what only a member may
// read is fetched on the way in and cleared on the way out
export function onUserChange(fn) {
  listeners.push(fn);
}

async function refreshIdentity(session) {
  hasSession = !!session;
  const next = session ? await remoteWhoAmI() : null;
  const changed = next !== activeUser;
  activeUser = next;

  updateUserUI();
  if (changed) listeners.forEach(fn => fn(activeUser));

  if (activeUser && ARRIVED_FROM_LINK && !arrivalLogged) {
    arrivalLogged = true;
    await remoteInsertLog("login", { as: activeUser }, null);
  }
}

function updateUserUI() {
  document.body.classList.toggle("is-guest", !activeUser);

  const btn = document.getElementById("userToggle");
  if (btn) {
    btn.textContent = activeUser ? `USER: ${activeUser.toUpperCase()}` : hasSession ? "USER: ?" : "SIGN IN";
  }

  const title = document.getElementById("authTitle");
  const desc = document.getElementById("authDesc");
  const form = document.getElementById("authForm");
  const signedIn = document.getElementById("authSignedIn");

  if (title) title.textContent = hasSession ? "signed in" : "sign in";
  if (desc) {
    desc.textContent = !hasSession
      ? "we send a link to your email, no password"
      : activeUser
        ? `as ${activeUser}`
        : "with an account that is not one of ours";
  }
  if (form) form.hidden = hasSession;
  if (signedIn) signedIn.hidden = !hasSession;

  updateRatingEditability();
}

function setAuthStatus(text) {
  const status = document.getElementById("authStatus");
  if (status) status.textContent = text || "";
}

export function openAuthOverlay() {
  const overlay = document.getElementById("authOverlay");
  if (!overlay) return;

  overlay.classList.add("is-open");
  overlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("auth-open");

  const first = overlay.querySelector(hasSession ? "#authSignOut" : "#authEmail");
  if (first) first.focus();
}

function closeAuthOverlay() {
  const overlay = document.getElementById("authOverlay");
  if (!overlay) return;

  overlay.classList.remove("is-open");
  overlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("auth-open");
  setAuthStatus("");
}

// supabase answers a refused address and a rate limit with different errors.
// only the rate limit is worth telling apart: saying which addresses are ours
// would tell a stranger the same
function describeSendError(error) {
  const text = `${error.status || ""} ${error.message || ""}`.toLowerCase();
  if (text.includes("429") || text.includes("rate") || text.includes("seconds")) {
    return "too many links in a row, try again in a minute";
  }
  return "could not send a link to this address";
}

export function initializeAuth() {
  const overlay = document.getElementById("authOverlay");
  if (!overlay) return;

  const form = document.getElementById("authForm");
  const input = document.getElementById("authEmail");
  const send = document.getElementById("authSend");

  if (form && input) {
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const email = input.value.trim();
      if (!email) return;

      if (send) send.disabled = true;
      setAuthStatus("sending...");

      const { error } = await remoteSendMagicLink(email);

      if (send) send.disabled = false;
      setAuthStatus(error ? describeSendError(error) : "check your inbox: the link signs this browser in");
    });
  }

  const signOut = document.getElementById("authSignOut");
  if (signOut) {
    signOut.addEventListener("click", async () => {
      await remoteSignOut();
      closeAuthOverlay();
    });
  }

  overlay.querySelectorAll("[data-auth-close]").forEach(btn => {
    btn.addEventListener("click", closeAuthOverlay);
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeAuthOverlay();
  });

  const userBtn = document.getElementById("userToggle");
  if (userBtn) userBtn.addEventListener("click", openAuthOverlay);

  onAuthChange((event, session) => {
    // supabase-js holds a lock while it runs this callback, and a query
    // started from inside it would wait for that lock forever. the work is
    // moved out of the callback instead
    setTimeout(() => refreshIdentity(session), 0);
  });

  // a link that expired or was already used lands here with an error instead
  // of a session. it is said once, and taken out of the address bar
  if (LINK_ERROR) {
    history.replaceState(null, "", location.pathname + location.search);
    openAuthOverlay();
    setAuthStatus(`${LINK_ERROR.toLowerCase()}. send a new one`);
  }

  updateUserUI();
}
