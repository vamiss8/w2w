// changing cards by hand: the add and edit form, comments, deleting, and the
// menu on every card that leads to them. every change is written to the
// database and logged, and a card is drawn from the row the database saved,
// so what you see is what was saved. realtime brings the same row back a
// moment later, which changes nothing.

import { LIST_WATCHED, STATE_PLANNED, STATE_STARTED, STATE_WATCHED, imdbSearchUrl, imdbTitleUrl, normalizeStatusCode, seenBefore, setCommentOpen, stateOf, statusOf, titleOf } from "./cards.js";
import { remoteDeleteCard, remoteInsertCard, remoteInsertLog, remoteSaveComment, remoteUpdateCard } from "./db.js";
import { closeDialog, confirmDialog, openDialog, whileSaving } from "./dialogs.js";
import { activeList } from "./lists.js";
import { dropCard, getCard, getComment, putCard, putComment } from "./store.js";
import { toast } from "./toast.js";
import { getActiveUser, openAuthDialog } from "./user.js";

// what the open forms are about: null while adding a card, the id otherwise
let editingId = null;
let commentCardId = null;

const field = id => document.getElementById(id);

// the status, asked as what it means: which of us has seen it before
function setSeen(code) {
  const seen = seenBefore(code);
  field("cardSeenVlad").checked = seen.vlad;
  field("cardSeenVika").checked = seen.vika;
}

// a card added from the watched list starts out watched, and one added from
// the other list planned
function openAddCard(list) {
  editingId = null;

  field("cardDialogTitle").textContent = "add card";
  field("cardDialogDesc").textContent = "create a new entry in the list";

  field("cardTitle").value = "";
  field("cardState").value = list === LIST_WATCHED ? STATE_WATCHED : STATE_PLANNED;
  setSeen("00");
  field("cardImdb").value = "";
  field("cardStart").value = "";
  field("cardEnd").value = "";
  field("cardError").textContent = "";
  syncImdbSearch();

  openDialog("cardDialog", "cardTitle");
}

function openEditCard(id) {
  const row = getCard(id);
  if (!row) return;
  editingId = String(row.id);

  field("cardDialogTitle").textContent = "edit card";
  field("cardDialogDesc").textContent = "update fields and sync to the server";

  field("cardTitle").value = titleOf(row);
  field("cardState").value = stateOf(row);
  setSeen(normalizeStatusCode(row.status));
  field("cardImdb").value = row.imdb_id ? imdbTitleUrl(row.imdb_id) : "";
  field("cardStart").value = row.start_date || "";
  field("cardEnd").value = row.end_date || "";
  field("cardError").textContent = "";
  syncImdbSearch();

  openDialog("cardDialog", "cardTitle");
}

function openComment(id) {
  const active = getActiveUser();
  if (!active) {
    openAuthDialog();
    return;
  }

  commentCardId = String(id);
  field("commentText").value = getComment(id, active);
  field("commentError").textContent = "";
  openDialog("commentDialog", "commentText");
}

function closeAllCardMenus() {
  document.querySelectorAll(".card-menu[data-open='true']").forEach(m => {
    m.dataset.open = "false";
    m.closest("li")?.classList.remove("menu-open");
  });
}

function toggleCardMenu(li) {
  const menu = li.querySelector(".card-menu");
  if (!menu) return;

  const open = menu.dataset.open === "true";
  closeAllCardMenus();

  menu.dataset.open = open ? "false" : "true";
  li.classList.toggle("menu-open", !open);
}

// the tt number out of whatever was pasted: a whole address, from the app or
// the site, or the number alone. undefined when there is something that holds
// no number, null when the field is empty
function imdbIdOf(raw) {
  const text = raw.trim();
  if (!text) return null;
  return /\btt\d{7,10}\b/.exec(text)?.[0];
}

function syncImdbSearch() {
  const title = field("cardTitle").value.trim();
  field("cardImdbFind").href = title ? imdbSearchUrl(title) : "https://www.imdb.com/";
}

// the fields that a change is logged for, the same way from a row on the
// page and from the row the database saved
function snapshot(row) {
  return {
    title: titleOf(row),
    state: stateOf(row),
    status: normalizeStatusCode(row.status),
    start_date: row.start_date || null,
    end_date: row.end_date || null,
    imdb_id: row.imdb_id || null,
  };
}

// one log line per kind of change, so the activity can say what changed
// rather than only that something did
async function logEditDiffs(before, after, cardId) {
  if (before.title !== after.title) {
    await remoteInsertLog("edit_title", { from: before.title, to: after.title }, cardId);
  }

  if (before.state !== after.state) {
    await remoteInsertLog("set_state", { title: after.title, from: before.state, to: after.state }, cardId);
  }

  if (before.status !== after.status) {
    await remoteInsertLog("set_status", { title: after.title, from: before.status, to: after.status }, cardId);
  }

  if (before.imdb_id !== after.imdb_id) {
    await remoteInsertLog("set_imdb", { title: after.title, imdb_id: after.imdb_id }, cardId);
  }

  if (before.start_date !== after.start_date || before.end_date !== after.end_date) {
    await remoteInsertLog("set_watch_dates", {
      title: after.title,
      state: after.state,
      from_start: before.start_date,
      from_end: before.end_date,
      to_start: after.start_date,
      to_end: after.end_date,
    }, cardId);
  }
}

async function saveCardForm() {
  const title = field("cardTitle").value.trim();
  if (!title) return;

  const picked = field("cardState").value;

  const imdb = imdbIdOf(field("cardImdb").value);
  if (imdb === undefined) {
    field("cardError").textContent = "that does not look like a page on imdb: paste the address of the film's page, or leave it empty";
    field("cardImdb").focus();
    return;
  }

  // which list the card lands on follows from the state alone
  const payload = {
    title,
    state: [STATE_PLANNED, STATE_STARTED, STATE_WATCHED].includes(picked) ? picked : STATE_PLANNED,
    status: statusOf({ vika: field("cardSeenVika").checked, vlad: field("cardSeenVlad").checked }),
    start_date: field("cardStart").value.trim() || null,
    end_date: field("cardEnd").value.trim() || null,
    imdb_id: imdb,
  };

  // no id when adding: the database numbers cards itself and rejects one sent
  // from here. the row it returns carries the id it chose
  const before = editingId ? getCard(editingId) : null;
  const row = editingId
    ? await remoteUpdateCard(editingId, payload)
    : await remoteInsertCard({ ...payload, vlad_score: 0, vika_score: 0 });

  // the form stays open with what was typed, and says so
  if (!row) {
    field("cardError").textContent = "could not save the card, try again";
    return;
  }

  putCard(row);
  closeDialog("cardDialog");

  if (before) await logEditDiffs(snapshot(before), snapshot(row), row.id);
  else await remoteInsertLog("add_card", { title: row.title }, row.id);
}

async function saveCommentForm() {
  const active = getActiveUser();
  const id = commentCardId;
  if (!active || !id) return;

  const text = field("commentText").value.trim();
  if (!await remoteSaveComment(id, active, text)) {
    field("commentError").textContent = "could not save the comment, try again";
    return;
  }

  putComment(id, active, text);
  closeDialog("commentDialog");
  await remoteInsertLog("comment", { title: titleOf(getCard(id)) }, id);
}

async function deleteCard(id) {
  const row = getCard(id);
  if (!row) return;

  const title = titleOf(row);
  const sure = await confirmDialog({ title: "delete card", question: "are you sure you want to delete ", name: title });
  if (!sure) return;

  const result = await remoteDeleteCard(id);
  if (result === "failed") {
    toast(`could not delete ${title}`);
    return;
  }

  dropCard(id);

  // only a delete that actually happened goes into the activity log
  if (result === "deleted") await remoteInsertLog("delete_card", { title }, null);
}

export function initializeCardUi() {
  // one listener for every card, the ones drawn later included
  document.addEventListener("click", e => {
    // the add button belongs to whichever list is open
    if (e.target.closest("[data-add]")) {
      openAddCard(activeList());
      return;
    }

    // a comment under a card, unfolded or folded again
    const toggle = e.target.closest(".comment-toggle");
    if (toggle) {
      const body = toggle.nextElementSibling;
      const li = toggle.closest("li");
      if (!body || !li) return;

      const open = body.dataset.open !== "true";
      body.dataset.open = open ? "true" : "false";
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      setCommentOpen(li.dataset.id, toggle.dataset.who, open);
      return;
    }

    const actions = e.target.closest(".card-actions");
    if (actions) {
      toggleCardMenu(actions.closest("li"));
      return;
    }

    const item = e.target.closest(".card-menu button[data-action]");
    if (item) {
      const id = item.closest("li")?.dataset.id;
      closeAllCardMenus();
      if (!id) return;

      if (item.dataset.action === "edit") openEditCard(id);
      if (item.dataset.action === "comment") openComment(id);
      if (item.dataset.action === "delete") deleteCard(id);
      return;
    }

    // a click anywhere else closes an open menu
    if (!e.target.closest(".card-menu")) closeAllCardMenus();
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeAllCardMenus();
  });

  field("cardTitle")?.addEventListener("input", syncImdbSearch);

  field("cardForm")?.addEventListener("submit", e => {
    e.preventDefault();
    whileSaving(field("cardSave"), saveCardForm);
  });

  field("commentForm")?.addEventListener("submit", e => {
    e.preventDefault();
    whileSaving(field("commentSave"), saveCommentForm);
  });
}
