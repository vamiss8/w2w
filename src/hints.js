// a short line about what a button does, for anything with a data-hint: on a
// mouse after a moment's rest over it, on the keyboard the moment it has the
// focus. one line on screen at a time, under the button, or over it when the
// bottom of the screen is too close.
//
// a finger has no hover, so on a phone every button has to say what it does
// by its own words and icon; this is for whoever wonders before clicking.

const DELAY_MS = 350;

let box = null;
let current = null;
let timer = 0;

function ensureBox() {
  if (box) return box;
  box = document.createElement("div");
  box.className = "hint";
  box.id = "hint";
  box.setAttribute("role", "tooltip");
  box.hidden = true;
  document.body.appendChild(box);
  return box;
}

function show(el) {
  const text = el.dataset.hint;
  if (!text || !el.isConnected) return;

  const hint = ensureBox();
  hint.textContent = text;
  hint.hidden = false;

  const r = el.getBoundingClientRect();
  const h = hint.getBoundingClientRect();
  const below = r.bottom + 10 + h.height < window.innerHeight;
  const left = Math.min(Math.max(8, r.left + r.width / 2 - h.width / 2), window.innerWidth - h.width - 8);

  hint.style.left = `${left}px`;
  hint.style.top = `${below ? r.bottom + 10 : r.top - 10 - h.height}px`;

  current = el;
  el.setAttribute("aria-describedby", "hint");
}

function hide() {
  clearTimeout(timer);
  if (current) current.removeAttribute("aria-describedby");
  current = null;
  if (box) box.hidden = true;
}

export function initializeHints() {
  document.addEventListener("pointerover", e => {
    if (e.pointerType !== "mouse") return;
    const el = e.target.closest("[data-hint]");
    if (!el || el === current) return;
    hide();
    timer = setTimeout(() => show(el), DELAY_MS);
  });

  document.addEventListener("pointerout", e => {
    const el = e.target.closest("[data-hint]");
    if (el && !el.contains(e.relatedTarget)) hide();
  });

  document.addEventListener("focusin", e => {
    const el = e.target.closest("[data-hint]");
    if (el && el.matches(":focus-visible")) show(el);
  });

  document.addEventListener("focusout", hide);
  document.addEventListener("pointerdown", hide);
  document.addEventListener("keydown", e => { if (e.key === "Escape") hide(); });
  window.addEventListener("scroll", hide, { passive: true });
}
