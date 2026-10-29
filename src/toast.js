// a short line at the bottom of the screen, for when something did not go as
// asked: a score the database refused, a delete that did not happen. before
// this the page put the old value back and said nothing, so a tick that undid
// itself looked like a bug in the page rather than a refusal, and a failed
// delete was the one thing that got an alert().

const REGION_ID = "toasts";
const SHOWN_FOR_MS = 5000;

export function toast(text) {
  const region = document.getElementById(REGION_ID);
  if (!region) return;

  const item = document.createElement("p");
  item.className = "toast";
  item.textContent = text;
  region.appendChild(item);

  // the same words twice in a row are said once, for longer
  const previous = item.previousElementSibling;
  if (previous && previous.textContent === text) previous.remove();

  setTimeout(() => {
    item.classList.add("is-leaving");
    item.addEventListener("animationend", () => item.remove(), { once: true });
    // and gone regardless, where animations are switched off
    setTimeout(() => item.remove(), 600);
  }, SHOWN_FOR_MS);
}
