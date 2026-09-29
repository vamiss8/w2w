// the art behind the heart in the corner.

import { closeModal, openModal } from "./modals.js";

// the art waits in index.html under data-src, see the comment there. it is
// fetched on the way to the button rather than with the page: a pointer
// arriving, whether a mouse or a finger touching down, or keyboard focus, all
// a moment before the click that opens the modal
function loadGiftArt() {
  const img = document.querySelector("#giftModal .gift-art[data-src]");
  if (!img) return;

  img.src = img.dataset.src;
  img.removeAttribute("data-src");
}

export function initializeGift() {
  const toggle = document.getElementById("secretGiftToggle");
  if (!toggle) return;

  toggle.addEventListener("pointerenter", loadGiftArt, { once: true });
  toggle.addEventListener("focus", loadGiftArt, { once: true });

  // the click loads it too, for whatever reaches the button some other way
  toggle.addEventListener("click", () => {
    loadGiftArt();
    openModal("giftModal");
  });

  const close = document.getElementById("giftClose");
  if (close) close.addEventListener("click", () => closeModal("giftModal"));
}
