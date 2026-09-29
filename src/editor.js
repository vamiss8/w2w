// changing cards by hand: the add and edit form, comments, deleting, and the
// menu on every card that leads to them. every change is written to the
// database and logged, and an added or edited card is drawn when realtime
// brings the saved row back, so what you see is what was saved.

import { STATE_PLANNED, STATE_WATCHED, TAB_UNWATCHED, TAB_WATCHED, getCardId, getState, getTabFromLi, getTitleFromCard, normalizeStatusCode, readTitleFromLi } from "./cards.js";
import { remoteDeleteCard, remoteInsertCard, remoteInsertLog, remoteUpdateCard } from "./db.js";
import { escapeHtml } from "./html.js";
import { closeModal, openModal } from "./modals.js";
import { getActiveUser, openAuthOverlay } from "./user.js";
import { TAB_INPUT_SELECTOR, UNWATCHED_TAB_ID, scheduleActiveTabView } from "./view.js";

const CARD_MODAL_ID = "cardModal";
const CARD_FORM_ID = "cardForm";
const COMMENT_MODAL_ID = "commentModal";
const COMMENT_FORM_ID = "commentForm";
let cardModalMode = "add"; // --------------------------- add | edit ----------------------------
let cardModalCardId = null;
let commentModalCardId = null;
let deleteModalTargetLi = null;

function fillCardModalFromLi(li) {
  const title = readTitleFromLi(li);

  document.getElementById("cardTitle").value = title;
  document.getElementById("cardTab").value = getTabFromLi(li);
  document.getElementById("cardState").value = getState(li);
  document.getElementById("cardStatus").value = normalizeStatusCode(li.dataset.status || "00");

  document.getElementById("cardStart").value = (li.dataset.start || "").trim();
  document.getElementById("cardEnd").value = (li.dataset.end || "").trim();
}

function openAddCardModal(prefTab) {
  cardModalMode = "add";
  cardModalCardId = null;

  document.getElementById("cardModalTitle").textContent = "add card";
  document.getElementById("cardModalDesc").textContent = "create a new entry in the list";

  document.getElementById("cardTitle").value = "";
  document.getElementById("cardTab").value = prefTab === TAB_WATCHED ? TAB_WATCHED : TAB_UNWATCHED;
  document.getElementById("cardState").value = "planned";
  document.getElementById("cardStatus").value = "00";
  document.getElementById("cardStart").value = "";
  document.getElementById("cardEnd").value = "";

  openModal(CARD_MODAL_ID);

  const input = document.getElementById("cardTitle");
  if (input) input.focus();
}

function openEditCardModal(li) {
  cardModalMode = "edit";
  cardModalCardId = getCardId(li);

  document.getElementById("cardModalTitle").textContent = "edit card";
  document.getElementById("cardModalDesc").textContent = "update fields and sync to the server";

  fillCardModalFromLi(li);

  openModal(CARD_MODAL_ID);

  const input = document.getElementById("cardTitle");
  if (input) input.focus();
}

function openCommentModal(li) {
  const active = getActiveUser();
  if (!active) {
    openAuthOverlay();
    return;
  }

  commentModalCardId = getCardId(li);

  const current =
    active === "vlad"
      ? (li.dataset.vladComment || "")
      : (li.dataset.vikaComment || "");

  document.getElementById("commentText").value = current;

  openModal(COMMENT_MODAL_ID);

  const area = document.getElementById("commentText");
  if (area) area.focus();
}

function closeAllCardMenus() {
  document.querySelectorAll(".card-menu[data-open='true']").forEach(m => {
    m.dataset.open = "false";
    const li = m.closest("li");
    if (li) li.classList.remove("menu-open");
  });
}

function toggleCardMenu(li) {
  const menu = li.querySelector(".card-menu");
  if (!menu) return;

  const open = menu.dataset.open === "true";
  closeAllCardMenus();

  const next = open ? "false" : "true";
  menu.dataset.open = next;

  li.classList.toggle("menu-open", next === "true");
}

function deleteCard(li) {
  const title = getTitleFromCard(li);
  if (!title) return;

  deleteModalTargetLi = li;
  
  const desc = document.getElementById("deleteModalDesc");
  if (desc) {
    desc.innerHTML = `are you sure you want to delete <br><span style="color: rgba(230, 232, 255, 0.94); font-weight: 600; font-family: var(--font-content); margin-top: 6px; display: inline-block;">${escapeHtml(title)}</span>?`;
  }

  openModal("deleteModal");
}

async function saveCommentForActiveUser(li, text) {
  const active = getActiveUser();
  if (!active) return;

  const id = getCardId(li);
  if (!id) return;

  const key = active === "vlad" ? "vlad_comment" : "vika_comment";
  const patch = {};
  patch[key] = String(text || "");

  const row = await remoteUpdateCard(id, patch);
  if (row) {
    await remoteInsertLog("comment", { title: getTitleFromCard(li) }, id);
  }
}

function snapshotCardForLogs(li) {
  return {
    title: getTitleFromCard(li),
    tab: getTabFromLi(li),
    state: getState(li),
    status: normalizeStatusCode(li.dataset.status || "00"),
    start_date: (li.dataset.start || "").trim() || null,
    end_date: (li.dataset.end || "").trim() || null,
  };
}

function normalizeRowForLogs(row) {
  return {
    title: row.title || "unknown title",
    tab: row.tab || TAB_UNWATCHED,
    state: row.state || STATE_PLANNED,
    status: normalizeStatusCode(row.status || "00"),
    start_date: row.start_date ? String(row.start_date) : null,
    end_date: row.end_date ? String(row.end_date) : null,
  };
}

async function logEditDiffs(before, after, cardId) {
  // title rename
  if (before.title !== after.title) {
    await remoteInsertLog("edit_title", { from: before.title, to: after.title }, cardId);
  }

  // state change
  if (before.state !== after.state) {
    await remoteInsertLog("set_state", { title: after.title, from: before.state, to: after.state }, cardId);
  }

  // status change
  if (before.status !== after.status) {
    await remoteInsertLog("set_status", { title: after.title, from: before.status, to: after.status }, cardId);
  }

  // watch dates change (start/end)
  const bs = before.start_date || "";
  const be = before.end_date || "";
  const as = after.start_date || "";
  const ae = after.end_date || "";

  if (bs !== as || be !== ae) {
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

export function initializeCardUi() {
  // add button
  const addBtn = document.getElementById("addToggle");
  if (addBtn) {
    addBtn.addEventListener("click", () => {
      const activeTab = document.querySelector(`${TAB_INPUT_SELECTOR}:checked`);
      const pref = activeTab && activeTab.id === UNWATCHED_TAB_ID ? TAB_UNWATCHED : TAB_WATCHED;
      openAddCardModal(pref);
    });
  }

  // card menu toggle + menu actions (event delegation)
  document.addEventListener("click", async e => {

    // --------------------------- delete modal actions ----------------------------
    const deleteCancelBtn = e.target.closest("#deleteCancel");
    if (deleteCancelBtn) {
      deleteModalTargetLi = null;
      closeModal("deleteModal");
      return;
    }

    const deleteConfirmBtn = e.target.closest("#deleteConfirm");
    if (deleteConfirmBtn) {
      if (!deleteModalTargetLi) return;

      const li = deleteModalTargetLi;
      const id = getCardId(li);
      const title = getTitleFromCard(li);

      // close immediately for responsive feel
      closeModal("deleteModal");
      deleteModalTargetLi = null;

      if (!id) return;

      const result = await remoteDeleteCard(id);
      if (result === "failed") return;

      li.remove();
      scheduleActiveTabView({ animate: false });

      // only a delete that actually happened goes into the activity log
      if (result === "deleted") {
        await remoteInsertLog("delete_card", { title }, null);
      }
      return;
    }
    
    // --------------------------- comment toggle ----------------------------
    const cToggle = e.target.closest(".comment-toggle");
    if (cToggle) {
      const li = cToggle.closest("li");
      if (!li) return;

      const who = (cToggle.dataset.who || "").trim().toLowerCase();
      const body = cToggle.nextElementSibling;
      if (!body || !body.classList.contains("comment-body")) return;

      const open = body.dataset.open === "true";
      body.dataset.open = open ? "false" : "true";

      if (who === "vlad") li.dataset.commentOpenVlad = open ? "false" : "true";
      if (who === "vika") li.dataset.commentOpenVika = open ? "false" : "true";

      return;
    }

    const actionsBtn = e.target.closest(".card-actions");
    if (actionsBtn) {
      const li = actionsBtn.closest("li");
      if (!li) return;
      toggleCardMenu(li);
      return;
    }

    const menuBtn = e.target.closest(".card-menu button[data-action]");
    if (menuBtn) {
      const li = menuBtn.closest("li");
      if (!li) return;

      const action = menuBtn.dataset.action;

      // close menu immediately
      closeAllCardMenus();

      if (action === "edit") openEditCardModal(li);
      if (action === "comment") openCommentModal(li);
      if (action === "delete") deleteCard(li); // handle card delete

      return;
    }

    // click outside closes menus
    if (!e.target.closest(".card-menu") && !e.target.closest(".card-actions")) {
      closeAllCardMenus();
    }
  });

  // card modal wiring
  const cardCancel = document.getElementById("cardCancel");
  if (cardCancel) cardCancel.addEventListener("click", () => closeModal(CARD_MODAL_ID));

  const cardForm = document.getElementById(CARD_FORM_ID);
  if (cardForm) {
    cardForm.addEventListener("submit", async e => {
      e.preventDefault();

      const title = (document.getElementById("cardTitle").value || "").trim();
      if (!title) return;

      const state = document.getElementById("cardState").value;
      const status = document.getElementById("cardStatus").value;

      const start = (document.getElementById("cardStart").value || "").trim();
      const end = (document.getElementById("cardEnd").value || "").trim();

      // normalize state->tab (guard)
      const safeTab =
        state === STATE_WATCHED ? TAB_WATCHED :
        TAB_UNWATCHED;

      const payload = {
        title,
        tab: safeTab,
        state,
        status: normalizeStatusCode(status),
        start_date: start || null,
        end_date: end || null,
      };

      if (cardModalMode === "add") {
        // no id: the database numbers cards itself and rejects one sent from
        // here. the row it returns carries the id it chose
        const row = await remoteInsertCard({
          ...payload,
          vlad_score: 0,
          vika_score: 0,
          vlad_comment: "",
          vika_comment: "",
        });

        if (row) {
          await remoteInsertLog("add_card", { title: row.title }, row.id);
        }
      }

      if (cardModalMode === "edit" && cardModalCardId) {
        const li = document.querySelector(`.lists li[data-id="${CSS.escape(String(cardModalCardId))}"]`);
        const before = li ? snapshotCardForLogs(li) : null;

        const row = await remoteUpdateCard(cardModalCardId, payload);

        if (row && before) {
          const after = normalizeRowForLogs(row);
          await logEditDiffs(before, after, row.id);
        }
      }


      closeModal(CARD_MODAL_ID);
    });
  }

  // comment modal wiring
  const commentCancel = document.getElementById("commentCancel");
  if (commentCancel) commentCancel.addEventListener("click", () => closeModal(COMMENT_MODAL_ID));

  const commentForm = document.getElementById(COMMENT_FORM_ID);
  if (commentForm) {
    commentForm.addEventListener("submit", async e => {
      e.preventDefault();

      const id = commentModalCardId;
      if (!id) return;

      const li = document.querySelector(`.lists li[data-id="${CSS.escape(String(id))}"]`);
      if (!li) return;

      const text = (document.getElementById("commentText").value || "").trim();
      await saveCommentForActiveUser(li, text);

      closeModal(COMMENT_MODAL_ID);
    });
  }

  // esc closes modals
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    closeAllCardMenus();
    closeModal(CARD_MODAL_ID);
    closeModal(COMMENT_MODAL_ID);
    closeModal("deleteModal");
    closeModal("giftModal");
    closeModal("wishlistModal");
    closeModal("wishAddModal");
    closeModal("wishDeleteModal")
  });
}
