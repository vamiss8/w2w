// changing cards by hand: the add and edit form, comments, deleting, and the
// menu on every card that leads to them. every change is written to the
// database and logged, and a card is drawn from the row the database saved,
// so what you see is what was saved. realtime brings the same row back a
// moment later, which changes nothing.

import { LIST_WATCHED, STATE_PLANNED, STATE_STARTED, STATE_WATCHED, normalizeStatusCode, setCommentOpen, stateOf, titleOf } from "./cards.js";
import { remoteDeleteCard, remoteInsertCard, remoteInsertLog, remoteSaveComment, remoteUpdateCard } from "./db.js";
import { closeDialog, confirmDialog, openDialog } from "./dialogs.js";
import { dropCard, getCard, getComment, putCard, putComment } from "./store.js";
import { getActiveUser, openAuthDialog } from "./user.js";

// what the open forms are about: null while adding a card, the id otherwise
let editingId = null;
let commentCardId = null;

const field = id => document.getElementById(id);

// a card added from the watched list starts out watched, and one added from
// the other list planned
function openAddCard(list) {
  editingId = null;

  field("cardDialogTitle").textContent = "add card";
  field("cardDialogDesc").textContent = "create a new entry in the list";

  field("cardTitle").value = "";
  field("cardState").value = list === LIST_WATCHED ? STATE_WATCHED : STATE_PLANNED;
  field("cardStatus").value = "00";
  field("cardStart").value = "";
  field("cardEnd").value = "";

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
  field("cardStatus").value = normalizeStatusCode(row.status);
  field("cardStart").value = row.start_date || "";
  field("cardEnd").value = row.end_date || "";

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

// the fields that a change is logged for, the same way from a row on the
// page and from the row the database saved
function snapshot(row) {
  return {
    title: titleOf(row),
    state: stateOf(row),
    status: normalizeStatusCode(row.status),
    start_date: row.start_date || null,
    end_date: row.end_date || null,
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

  // which list the card lands on follows from the state alone
  const payload = {
    title,
    state: [STATE_PLANNED, STATE_STARTED, STATE_WATCHED].includes(picked) ? picked : STATE_PLANNED,
    status: normalizeStatusCode(field("cardStatus").value),
    start_date: field("cardStart").value.trim() || null,
    end_date: field("cardEnd").value.trim() || null,
  };

  if (!editingId) {
    // no id: the database numbers cards itself and rejects one sent from
    // here. the row it returns carries the id it chose
    const row = await remoteInsertCard({ ...payload, vlad_score: 0, vika_score: 0 });
    if (row) {
      putCard(row);
      await remoteInsertLog("add_card", { title: row.title }, row.id);
    }
  } else {
    const before = getCard(editingId);
    const row = await remoteUpdateCard(editingId, payload);
    if (row) {
      putCard(row);
      if (before) await logEditDiffs(snapshot(before), snapshot(row), row.id);
    }
  }

  closeDialog("cardDialog");
}

async function saveCommentForm() {
  const active = getActiveUser();
  const id = commentCardId;
  if (!active || !id) return;

  const text = field("commentText").value.trim();
  const saved = await remoteSaveComment(id, active, text);
  if (saved) {
    putComment(id, active, text);
    await remoteInsertLog("comment", { title: titleOf(getCard(id)) }, id);
  }

  closeDialog("commentDialog");
}

async function deleteCard(id) {
  const row = getCard(id);
  if (!row) return;

  const title = titleOf(row);
  const sure = await confirmDialog({ title: "delete card", question: "are you sure you want to delete ", name: title });
  if (!sure) return;

  const result = await remoteDeleteCard(id);
  if (result === "failed") return;

  dropCard(id);

  // only a delete that actually happened goes into the activity log
  if (result === "deleted") await remoteInsertLog("delete_card", { title }, null);
}

export function initializeCardUi() {
  // one listener for every card, the ones drawn later included
  document.addEventListener("click", e => {
    const add = e.target.closest("[data-add]");
    if (add) {
      openAddCard(add.closest(".view")?.dataset.list);
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

  field("cardForm")?.addEventListener("submit", e => {
    e.preventDefault();
    saveCardForm();
  });

  field("commentForm")?.addEventListener("submit", e => {
    e.preventDefault();
    saveCommentForm();
  });
}
