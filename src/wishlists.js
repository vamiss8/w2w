// our two wishlists, side by side on a wide screen and one under the other on
// a phone. they are short, so any change to the table, from either of us,
// simply fetches them again.
//
// a wish that came true is ticked off rather than deleted: it moves down into
// its column's done list, with the day and who ticked it, and can be unticked
// from there if it was ticked by mistake. a wish can be edited, moved to the
// other list, and carry as many links as it needs.

import { formatTimestampForUI } from "./dates.js";
import { remoteDeleteWish, remoteFetchWishes, remoteInsertWish, remoteUpdateWish } from "./db.js";
import { closeDialog, confirmDialog, openDialog } from "./dialogs.js";
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

  const check = button("wish-check", w.done_at ? "not done after all" : "mark as done", w.id);
  check.setAttribute("aria-pressed", w.done_at ? "true" : "false");

  const info = document.createElement("div");
  info.className = "wish-info";

  const title = document.createElement("span");
  title.className = "wish-title";
  title.textContent = w.title;
  info.appendChild(title);

  const links = (w.links || []).map(safeLink).filter(Boolean);
  if (links.length) {
    const box = document.createElement("div");
    box.className = "wish-links";

    // named by the site they lead to: with several links on one wish, five
    // identical "link" labels would not tell them apart
    links.forEach(href => {
      const a = document.createElement("a");
      a.className = "wish-link";
      a.href = href;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = `${new URL(href).hostname.replace(/^www\./, "")} ↗`;
      box.appendChild(a);
    });

    info.appendChild(box);
  }

  if (w.done_at) {
    const note = document.createElement("span");
    note.className = "wish-done-note";
    note.textContent = `done ${formatTimestampForUI(w.done_at)}${w.done_by ? ` · ${w.done_by}` : ""}`;
    info.appendChild(note);
  }

  const actions = document.createElement("div");
  actions.className = "wish-actions";

  const edit = button("wish-btn wish-edit", "edit wish", w.id);
  edit.prepend("✎");

  // the × carries the site's own tooltip rather than a title attribute
  const del = button("wish-btn wish-delete", "delete wish", w.id);
  del.prepend("×");

  actions.append(edit, del);
  li.append(check, info, actions);
  return li;
}

function button(className, label, id) {
  const b = document.createElement("button");
  b.className = className;
  b.type = "button";
  b.dataset.id = String(id);
  b.setAttribute("aria-label", label);

  const tip = document.createElement("span");
  tip.className = "tooltip";
  tip.textContent = label;
  b.appendChild(tip);
  return b;
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

// what one of us typed, as a link to keep, or null when it is not one. a bare
// address gets https in front, and something with no dot in its host, like a
// stray word, is not taken for an address at all
function normalizeLink(raw) {
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  const href = safeLink(withScheme);
  if (!href) return null;
  return new URL(href).hostname.includes(".") ? href : null;
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

/* ---------------------------
   THE WISH FORM
---------------------------- */

// null while adding, the id of the wish while editing one
let editingId = null;

const linkRows = () => document.getElementById("wishLinkRows");

function addLinkRow(value = "", after = null) {
  const row = document.createElement("div");
  row.className = "wish-link-row";

  const input = document.createElement("input");
  input.className = "field-input";
  input.type = "text";
  input.inputMode = "url";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.placeholder = "e.g. ozon.ru/t/... or https://...";
  input.value = value;
  input.setAttribute("aria-label", "link");

  const remove = document.createElement("button");
  remove.className = "wish-link-remove";
  remove.type = "button";
  remove.setAttribute("aria-label", "remove this link");
  remove.textContent = "×";

  row.append(input, remove);
  if (after) after.after(row);
  else linkRows().appendChild(row);
  return input;
}

// an address never has a space in it, so a link field holding several
// address-like pieces means they were pasted at once, from a note or a
// message: each gets a row. words that are not addresses stay as typed, for
// the check on save to point at
function splitPastedLinks(input) {
  const parts = input.value.split(/\s+/).filter(Boolean);
  if (parts.length < 2 || !parts.every(part => part.includes(".") || part.includes("://"))) return;

  input.value = parts[0];
  let row = input.closest(".wish-link-row");
  let last = input;
  parts.slice(1).forEach(part => {
    last = addLinkRow(part, row);
    row = last.closest(".wish-link-row");
  });
  last.focus();
}

function setWishError(text, field = null) {
  document.getElementById("wishError").textContent = text || "";
  if (field) field.focus();
}

function openWishForm({ owner, wish = null }) {
  editingId = wish ? String(wish.id) : null;

  document.getElementById("wishDialogTitle").textContent = wish ? "edit wish" : "add wish";
  const who = wish ? wish.owner : owner;
  document.getElementById("wishOwnerVlad").checked = who === "vlad";
  document.getElementById("wishOwnerVika").checked = who === "vika";
  document.getElementById("wishTitle").value = wish ? wish.title : "";

  linkRows().replaceChildren();
  const links = wish && wish.links && wish.links.length ? wish.links : [""];
  links.forEach(link => addLinkRow(link));
  setWishError("");

  openDialog("wishDialog", "wishTitle");
}

async function saveWishForm() {
  const titleField = document.getElementById("wishTitle");
  const title = titleField.value.trim();
  if (!title) {
    setWishError("a wish needs a few words", titleField);
    return;
  }

  const links = [];
  for (const input of linkRows().querySelectorAll("input")) {
    const raw = input.value.trim();
    if (!raw) continue;

    const href = normalizeLink(raw);
    if (!href) {
      setWishError(`"${raw}" does not look like a link`, input);
      return;
    }
    if (!links.includes(href)) links.push(href);
  }

  const owner = document.getElementById("wishOwnerVika").checked ? "vika" : "vlad";
  const saved = editingId
    ? await remoteUpdateWish(editingId, { owner, title, links })
    : await remoteInsertWish(owner, title, links);

  if (!saved) {
    setWishError("could not save the wish, try again");
    return;
  }

  // realtime brings the change back too, but the list should not wait for it
  await remotePullWishes();
  closeDialog("wishDialog");
}

function initializeWishForm() {
  const form = document.getElementById("wishForm");
  if (!form) return;

  form.addEventListener("submit", e => {
    e.preventDefault();
    saveWishForm();
  });

  document.getElementById("wishAddLink").addEventListener("click", () => {
    addLinkRow().focus();
  });

  linkRows().addEventListener("input", e => {
    if (e.target.matches("input")) splitPastedLinks(e.target);
  });

  // the last row is emptied rather than removed, so there is always one to
  // type into
  linkRows().addEventListener("click", e => {
    const remove = e.target.closest(".wish-link-remove");
    if (!remove) return;

    const row = remove.closest(".wish-link-row");
    if (linkRows().children.length > 1) row.remove();
    else row.querySelector("input").value = "";
  });
}

async function deleteWish(id) {
  const wish = wishesData.find(w => String(w.id) === String(id));
  if (!wish) return;

  const sure = await confirmDialog({ title: "delete wish", question: "are you sure you want to delete ", name: wish.title });
  if (!sure) return;

  await remoteDeleteWish(id);
  await remotePullWishes();
}

export function initializeWishlists() {
  restoreDoneOpen();
  initializeWishForm();

  // the wish buttons are redrawn on every change, so one listener serves them
  document.addEventListener("click", async e => {
    const check = e.target.closest(".wish-check");
    if (check) {
      await toggleDone(check.dataset.id);
      return;
    }

    const addBtn = e.target.closest(".add-wish-btn");
    if (addBtn) {
      openWishForm({ owner: addBtn.dataset.owner });
      return;
    }

    const editBtn = e.target.closest(".wish-edit");
    if (editBtn) {
      const wish = wishesData.find(w => String(w.id) === editBtn.dataset.id);
      if (wish) openWishForm({ wish });
      return;
    }

    const delBtn = e.target.closest(".wish-delete");
    if (delBtn) deleteWish(delBtn.dataset.id);
  });
}
