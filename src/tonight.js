// "what do we watch tonight?", answered by the site: one card at random from
// the ones the list shows right now, so the filters and the search say what
// it may pick from. "another one" never offers the same card twice in a row,
// and "this one" goes to it in the list.

import { LIST_TO_WATCH, STATE_STARTED, STATUS_TEXT, normalizeStatusCode, stateOf, titleOf } from "./cards.js";
import { formatISOForUI } from "./dates.js";
import { closeDialog, openDialog } from "./dialogs.js";
import { visibleRows } from "./lists.js";
import { toast } from "./toast.js";

let picked = null;

function pick() {
  const rows = visibleRows(LIST_TO_WATCH);
  if (!rows.length) return null;

  const others = rows.length > 1 && picked ? rows.filter(r => r.id !== picked.id) : rows;
  return others[Math.floor(Math.random() * others.length)];
}

function show(row) {
  picked = row;
  document.getElementById("tonightPick").textContent = titleOf(row);

  const started = stateOf(row) === STATE_STARTED && row.start_date;
  document.getElementById("tonightMeta").textContent = [
    started ? `started on ${formatISOForUI(row.start_date)}` : "not started yet",
    STATUS_TEXT[normalizeStatusCode(row.status)].replace(/\.$/, ""),
  ].join(" · ");
}

function offer() {
  const row = pick();
  if (!row) {
    toast("nothing to pick from: the filters hide every card");
    return;
  }

  show(row);
  openDialog("tonightDialog", "tonightOk");
}

// the card in the list, scrolled to and lit up for a moment
function goToPicked() {
  closeDialog("tonightDialog");
  const li = picked && document.querySelector(`ul.cards > li[data-id="${picked.id}"]`);
  if (!li) return;

  li.scrollIntoView({ behavior: "smooth", block: "center" });
  li.classList.remove("is-picked");
  void li.offsetWidth;
  li.classList.add("is-picked");
  li.addEventListener("animationend", () => li.classList.remove("is-picked"), { once: true });
}

export function initializeTonight() {
  document.addEventListener("click", e => {
    if (e.target.closest("[data-tonight]")) offer();
  });

  document.getElementById("tonightAgain")?.addEventListener("click", () => {
    const row = pick();
    if (row) show(row);
  });

  document.getElementById("tonightOk")?.addEventListener("click", goToPicked);
}
