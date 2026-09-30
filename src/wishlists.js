// our two wishlists. they are short, so any change to the table, from either
// of us, simply fetches them again.

import { remoteDeleteWish, remoteFetchWishes, remoteInsertWish } from "./db.js";
import { closeModal, openModal } from "./modals.js";

let wishesData = [];

export async function remotePullWishes() {
  const data = await remoteFetchWishes();
  if (!data) return;

  wishesData = data;
  renderWishes();
}

function renderWishes() {
  const vladContainer = document.getElementById("wishesVlad");
  const vikaContainer = document.getElementById("wishesVika");
  if (!vladContainer || !vikaContainer) return;

  vladContainer.innerHTML = "";
  vikaContainer.innerHTML = "";

  // built node by node rather than from a string of html: the title and the
  // link are typed by one of us and shown to the other, and nothing typed
  // should ever be read as markup
  wishesData.forEach(w => {
    const li = document.createElement("li");
    li.className = "wish-item";

    const info = document.createElement("div");
    info.className = "wish-info";

    const title = document.createElement("span");
    title.className = "wish-title";
    title.textContent = w.title;
    info.appendChild(title);

    const href = safeLink(w.link);
    if (href) {
      const a = document.createElement("a");
      a.className = "wish-link";
      a.href = href;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = "link ↗";
      info.appendChild(a);
    }

    // the × carries the site's own tooltip rather than a title attribute
    const del = document.createElement("button");
    del.className = "wish-delete";
    del.type = "button";
    del.dataset.id = String(w.id);
    del.append("×");

    const tip = document.createElement("span");
    tip.className = "tooltip";
    tip.textContent = "delete wish";
    del.appendChild(tip);

    li.append(info, del);

    if (w.owner === "vlad") vladContainer.appendChild(li);
    else vikaContainer.appendChild(li);
  });
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

// which wish the delete modal is about
let wishDeleteTargetId = null;

export function initializeWishlists() {
  // open wishlist modal
  const toggle = document.getElementById("wishlistToggle");
  if (toggle) toggle.addEventListener("click", () => openModal("wishlistModal"));

  // one listener for the modals and for the wish buttons, which are redrawn on
  // every change
  document.addEventListener("click", async e => {
    
    // close main wishlist modal
    if (e.target.closest("#wishlistClose")) {
      closeModal("wishlistModal");
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

      await remoteInsertWish(owner, title, link);
      
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
