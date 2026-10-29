// the sections of the page, one on screen at a time, each with an address of
// its own: #/to-watch, #/watched, #/wishlists, #/activity. a link to one opens
// it, the back button walks between them, and a visit comes back to the one
// it left.
//
// a magic link lands with the session in the address bar, #access_token=...,
// and that belongs to supabase-js until it has read it. so nothing here
// writes to the address bar on the way in: a hash that is not a section is
// left alone, and the last section shown is opened instead.

export const SECTIONS = ["to-watch", "watched", "wishlists", "activity"];

const LS_SECTION = "section";
const listeners = [];
let current = null;

// called with the section on the way in, and with every change after that
export function onSectionChange(fn) {
  listeners.push(fn);
}

export function currentSection() {
  return current;
}

function fromHash() {
  const m = /^#\/([a-z-]+)$/.exec(location.hash);
  return m && SECTIONS.includes(m[1]) ? m[1] : null;
}

// where the last visit was. the page before this one had two tabs, and
// remembered the open one by the id of its radio button
function remembered() {
  const legacy = localStorage.getItem("activeTab");
  if (legacy) {
    localStorage.removeItem("activeTab");
    localStorage.setItem(LS_SECTION, legacy === "tab-watched" ? "watched" : "to-watch");
  }

  const saved = localStorage.getItem(LS_SECTION);
  return SECTIONS.includes(saved) ? saved : null;
}

function show(section, { first = false } = {}) {
  current = section;
  localStorage.setItem(LS_SECTION, section);
  document.body.dataset.section = section;

  document.querySelectorAll(".view[data-section]").forEach(view => {
    view.hidden = view.dataset.section !== section;
  });

  document.querySelectorAll(".nav-item[data-section]").forEach(item => {
    if (item.dataset.section === section) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });

  // a section opened from further down the page starts at its top
  if (!first && window.scrollY > 0) window.scrollTo({ top: 0 });

  listeners.forEach(fn => fn(section, { first }));
}

export function goTo(section) {
  if (!SECTIONS.includes(section)) return;
  if (location.hash === `#/${section}`) show(section);
  else location.hash = `#/${section}`;
}

export function initializeRouter() {
  show(fromHash() || remembered() || "to-watch", { first: true });

  window.addEventListener("hashchange", () => {
    const section = fromHash();
    if (section && section !== current) show(section);
  });
}
