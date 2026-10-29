// finding a title as it is typed. both lists share one query: the box on
// each says the same thing, and when the title is on the other list, a line
// under the box points there. a film we already watched is found from the
// list of the ones we have not, which is where it gets looked for.

const listeners = [];
let query = "";

// the same letters however they were typed: no case, no accents on latin
// letters, and ё read as е, the way it is written half the time. й keeps its
// mark: in russian it is a letter of its own, not an и with an accent
export function fold(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .normalize("NFD")
    .replace(/([a-z])\p{M}+/gu, "$1")
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim();
}

export function searchQuery() {
  return query;
}

export function matchesSearch(row) {
  return !query || fold(row.title).includes(query);
}

export function onSearchChange(fn) {
  listeners.push(fn);
}

function setQuery(raw, from) {
  const next = fold(raw);

  document.querySelectorAll("[data-search]").forEach(input => {
    if (input !== from) input.value = raw;
  });

  if (next === query) return;
  query = next;
  listeners.forEach(fn => fn());
}

export function initializeSearch() {
  document.querySelectorAll("[data-search]").forEach(input => {
    input.addEventListener("input", () => setQuery(input.value, input));

    // escape empties the box before it does anything else
    input.addEventListener("keydown", e => {
      if (e.key !== "Escape" || !input.value) return;
      e.preventDefault();
      setQuery("", null);
    });
  });

  // a slash anywhere outside a field goes to the box of the open list
  document.addEventListener("keydown", e => {
    if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest("input, textarea, select, [contenteditable], dialog")) return;

    const box = [...document.querySelectorAll("[data-search]")].find(input => input.offsetParent);
    if (!box) return;
    e.preventDefault();
    box.focus();
  });
}
