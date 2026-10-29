// our two wishlists. they are short, so any change to the table, from either
// of us, simply fetches them again.
//
// a wish that came true is ticked off rather than deleted: it moves down into
// its column's done list, with the day and who ticked it, and can be unticked
// from there if it was ticked by mistake.

import { formatTimestampForUI } from "./dates.js";
import { remoteDeleteWish, remoteFetchWishes, remoteInsertWish, remoteUpdateWish } from "./db.js";
import { closeModal, openModal } from "./modals.js";
import { getActiveUser } from "./user.js";

const OWNERS = { vlad: "Vlad", vika: "Vika" };
const LS_DONE_OPEN = "wishesDoneOpen";

let wishesData = [];

export async function remotePullWishes() {
  const data = await remoteFetchWishes();
  if (!data) return;

  wishesData = data;
  renderWishes();
}

function renderWishes() {
  for (const owner of Object.keys(OWNERS)) {
    const active = document.getElementById(`wishes${OWNERS[owner]}`);
    const done = document.getElementById(`wishes${OWNERS[owner]}Done`);
    const doneBox = document.querySelector(`.wishes-done[data-owner="${owner}"]`);
    if (!active || !done || !doneBox) continue;

    const own = wishesData.filter(w => w.owner === owner);

    // still wished for: in the order they were added, the way they came in.
    // came true: the most recent first
    const open = own.filter(w => !w.done_at);
    const came = own.filter(w => w.done_at).sort((a, b) => String(b.done_at).localeCompare(String(a.done_at)));

    active.replaceChildren(...open.map(renderWish));
    done.replaceChildren(...came.map(renderWish));

    doneBox.hidden = came.length === 0;
    doneBox.querySelector(".wishes-done-count").textContent = String(came.length);
  }
}

// built node by node rather than from a string of html: the title and the
// links are typed by one of us and shown to the other, and nothing typed
// should ever be read as markup
function renderWish(w) {
  const li = document.createElement("li");
  li.className = w.done_at ? "wish-item is-done" : "wish-item";
  li.dataset.id = String(w.id);

  const check = document.createElement("button");
  check.className = "wish-check";
  check.type = "button";
  check.dataset.id = String(w.id);
  check.setAttribute("aria-pressed", w.done_at ? "true" : "false");
  check.setAttribute("aria-label", w.done_at ? "not done after all" : "mark as done");
  check.appendChild(tooltip(w.done_at ? "not done after all" : "mark as done"));

  const info = document.createElement("div");
  info.className = "wish-info";

  const title = document.createElement("span");
  title.className = "wish-title";
  title.textContent = w.title;
  info.appendChild(title);

  (w.links || []).forEach(link => {
    const href = safeLink(link);
    if (!href) return;

    const a = document.createElement("a");
    a.className = "wish-link";
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = "link ↗";
    info.appendChild(a);
  });

  if (w.done_at) {
    const note = document.createElement("span");
    note.className = "wish-done-note";
    note.textContent = `done ${formatTimestampForUI(w.done_at)}${w.done_by ? ` · ${w.done_by}` : ""}`;
    info.appendChild(note);
  }

  // the × carries the site's own tooltip rather than a title attribute
  const del = document.createElement("button");
  del.className = "wish-delete";
  del.type = "button";
  del.dataset.id = String(w.id);
  del.setAttribute("aria-label", "delete wish");
  del.append("×", tooltip("delete wish"));

  li.append(check, info, del);
  return li;
}

function tooltip(text) {
  const tip = document.createElement("span");
  tip.className = "tooltip";
  tip.textContent = text;
  return tip;
}

// a link is only ever an http or https address. anything else, javascript:
// included, is dropped instead of being put on the page: it used to go into
// the markup as typed, so a link could run code in the other person's browser
function safeLink(raw) {
  if (!raw) return null;

  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

// the list moves the moment the box is ticked, before the database has
// answered; if it refuses, a fresh pull puts the wish back where it was
async function toggleDone(id) {
  const wish = wishesData.find(w => String(w.id) === String(id));
  if (!wish) return;

  const doneAt = wish.done_at ? null : new Date().toISOString();
  wish.done_at = doneAt;
  wish.done_by = doneAt ? getActiveUser() : null;
  renderWishes();

  const saved = await remoteUpdateWish(id, { done_at: doneAt });
  if (!saved) await remotePullWishes();
}

function restoreDoneOpen() {
  let open = {};
  try {
    open = JSON.parse(localStorage.getItem(LS_DONE_OPEN) || "{}");
  } catch {
    open = {};
  }

  document.querySelectorAll(".wishes-done").forEach(box => {
    box.open = !!open[box.dataset.owner];
    box.addEventListener("toggle", () => {
      open[box.dataset.owner] = box.open;
      localStorage.setItem(LS_DONE_OPEN, JSON.stringify(open));
    });
  });
}

// which wish the delete modal is about
let wishDeleteTargetId = null;

export function initializeWishlists() {
  // open wishlist modal
  const toggle = document.getElementById("wishlistToggle");
  if (toggle) toggle.addEventListener("click", () => openModal("wishlistModal"));

  restoreDoneOpen();

  // one listener for the modals and for the wish buttons, which are redrawn on
  // every change
  document.addEventListener("click", async e => {

    // close main wishlist modal
    if (e.target.closest("#wishlistClose")) {
      closeModal("wishlistModal");
      return;
    }

    const check = e.target.closest(".wish-check");
    if (check) {
      await toggleDone(check.dataset.id);
      return;
    }

    // open add wish modal
    const addBtn = e.target.closest(".add-wish-btn");
    if (addBtn) {
      const owner = addBtn.dataset.owner;
      document.getElementById("wishAddOwner").value = owner;
      document.getElementById("wishInputTitle").value = "";
      document.getElementById("wishInputLink").value = "";
      document.getElementById("wishAddTitle").textContent = `add wish for ${owner}`;

      closeModal("wishlistModal");
      openModal("wishAddModal");
      return;
    }

    // cancel adding wish
    if (e.target.closest("#wishAddCancel")) {
      closeModal("wishAddModal");
      openModal("wishlistModal");
      return;
    }

    // save new wish
    if (e.target.closest("#wishAddSave")) {
      const owner = document.getElementById("wishAddOwner").value;
      const title = (document.getElementById("wishInputTitle").value || "").trim();
      let link = (document.getElementById("wishInputLink").value || "").trim();

      if (!title) {
        alert("please enter a title!");
        return;
      }

      // auto-prepend https:// if missing
      if (link && !link.startsWith("http://") && !link.startsWith("https://")) {
        link = "https://" + link;
      }

      await remoteInsertWish(owner, title, link ? [link] : []);

      closeModal("wishAddModal");
      openModal("wishlistModal");
      return;
    }

    // trigger delete wish modal
    const delBtn = e.target.closest(".wish-delete");
    if (delBtn) {
      wishDeleteTargetId = delBtn.dataset.id;
      closeModal("wishlistModal");
      openModal("wishDeleteModal");
      return;
    }

    // cancel delete wish
    if (e.target.closest("#wishDeleteCancel")) {
      wishDeleteTargetId = null;
      closeModal("wishDeleteModal");
      openModal("wishlistModal");
      return;
    }

    // confirm delete wish
    if (e.target.closest("#wishDeleteConfirm")) {
      if (!wishDeleteTargetId) return;

      await remoteDeleteWish(wishDeleteTargetId);
      wishDeleteTargetId = null;

      closeModal("wishDeleteModal");
      openModal("wishlistModal");
      return;
    }
  });
}
