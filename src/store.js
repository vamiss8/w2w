// what the page knows about the cards: every row the database sent, and the
// comments the two of us left on them. the lists, the sorting, the filters
// and every form read from here; the page itself only ever shows it.
//
// it used to be the other way round: each card kept its data in data-*
// attributes, and everything read it back from the dom. a card could then
// say one thing on screen and hold another underneath, and nothing that is
// not drawn at the moment, like a card behind a filter, could be asked about.

const cards = new Map();
const comments = new Map();

// false until the first pull has answered, so an empty list can tell "not
// here yet" from "none at all"
let loaded = false;

export function cardsLoaded() {
  return loaded;
}

// every change ends here, so the lists know to redraw
const listeners = [];

export function onStoreChange(fn) {
  listeners.push(fn);
}

function changed() {
  listeners.forEach(fn => fn());
}

const key = id => String(id);

export function getCard(id) {
  return cards.get(key(id)) || null;
}

export function allCards() {
  return [...cards.values()];
}

// the database is the whole truth, so a full pull replaces everything: a card
// it did not return is gone, whatever realtime said or did not say about it
export function replaceCards(rows) {
  cards.clear();
  rows.forEach(row => cards.set(key(row.id), row));
  loaded = true;
  changed();
}

export function putCard(row) {
  cards.set(key(row.id), row);
  changed();
}

// a change made here before the database answers, put right by the echo of
// the saved row, or undone with the row it returns
export function patchCard(id, patch) {
  const row = getCard(id);
  if (!row) return null;

  const before = { ...row };
  cards.set(key(id), { ...row, ...patch });
  changed();
  return before;
}

export function dropCard(id) {
  if (cards.delete(key(id))) changed();
}

// "" when that person left none
export function getComment(cardId, author) {
  return comments.get(key(cardId))?.[author] || "";
}

// comments come apart from the cards, from a table only the two of us can
// read. a guest's empty list is what clears them off the page on sign-out
export function replaceComments(rows) {
  comments.clear();
  rows.forEach(r => {
    const own = comments.get(key(r.card_id)) || {};
    own[r.author] = r.body || "";
    comments.set(key(r.card_id), own);
  });
  changed();
}

export function putComment(cardId, author, body) {
  const own = comments.get(key(cardId)) || {};
  own[author] = body || "";
  comments.set(key(cardId), own);
  changed();
}
