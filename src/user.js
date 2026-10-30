// who is using the site: vlad, vika, or a guest. a magic link signs a browser
// in, supabase keeps the session, and app_user() in the database says which
// of us the session belongs to. a guest reads the cards and the activity log
// and nothing else: the database refuses everything more.

import { onAuthChange, remoteInsertLog, remoteSendMagicLink, remoteSignOut, remoteWhoAmI } from "./db.js";
import { closeDialog, openDialog } from "./dialogs.js";

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

// settled once the first session supabase-js reports, the one restored from
// the last visit or brought by a link, has been put to the database. the
// first pull waits for it, so a member's cards arrive with their comments in
// one go instead of a guest's first and ours a moment later
let settle;
const settled = new Promise(resolve => { settle = resolve; });

export function whenIdentityKnown() {
  // and never longer than a few seconds, should supabase not answer at all
  return Promise.race([settled, new Promise(resolve => setTimeout(resolve, 4000))]);
}

async function refreshIdentity(session) {
  hasSession = !!session;
  const next = session ? await remoteWhoAmI() : null;
  const changed = next !== activeUser;
  activeUser = next;

  updateUserUI();
  if (changed) listeners.forEach(fn => fn(activeUser));
  settle();

  if (activeUser && ARRIVED_FROM_LINK && !arrivalLogged) {
    arrivalLogged = true;
    await remoteInsertLog("login", { as: activeUser }, null);
  }
}

function updateUserUI() {
  document.body.classList.toggle("is-guest", !activeUser);

  // the pill says who is signed in, in that person's colour
  const btn = document.getElementById("userToggle");
  if (btn) {
    btn.textContent = activeUser || (hasSession ? "?" : "sign in");
    btn.dataset.user = activeUser || "";
    btn.dataset.hint = activeUser
      ? `signed in as ${activeUser}. click to sign out`
      : hasSession ? "signed in with an account that is not one of ours" : "sign in: we email you a link, no password";
    btn.setAttribute("aria-label", activeUser
      ? `signed in as ${activeUser}`
      : hasSession ? "signed in with an account that is not one of ours" : "sign in");
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
}

function setAuthStatus(text) {
  const status = document.getElementById("authStatus");
  if (status) status.textContent = text || "";
}

export function openAuthDialog() {
  openDialog("authDialog", hasSession ? "authSignOut" : "authEmail");
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
  const dialog = document.getElementById("authDialog");
  if (!dialog) return;

  // whatever it last said about a link goes with it when it closes
  dialog.addEventListener("close", () => setAuthStatus(""));

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
      closeDialog("authDialog");
    });
  }

  document.getElementById("userToggle")?.addEventListener("click", openAuthDialog);

  // the other ways in: the note a guest finds where the wishlists would be
  document.addEventListener("click", e => {
    if (e.target.closest("[data-sign-in]")) openAuthDialog();
  });

  // with no supabase-js there is no session to wait for
  if (!onAuthChange((event, session) => {
    // supabase-js holds a lock while it runs this callback, and a query
    // started from inside it would wait for that lock forever. the work is
    // moved out of the callback instead
    setTimeout(() => refreshIdentity(session), 0);
  })) settle();

  // a link that expired or was already used lands here with an error instead
  // of a session. it is said once, and taken out of the address bar
  if (LINK_ERROR) {
    history.replaceState(null, "", location.pathname + location.search);
    openAuthDialog();
    setAuthStatus(`${LINK_ERROR.toLowerCase()}. send a new one`);
  }

  updateUserUI();
}
