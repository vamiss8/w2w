// keeping the page equal to the database. realtime reports each change as it
// happens, and a full pull on every join covers whatever it missed while the
// socket was down.
//
// a visit used to pull the cards three times on the way in: once on its own,
// once when the socket joined, and once more when the database said who was
// signed in, with the comments a step behind each time, so the list was drawn
// and drawn again. now the way in is one pull of the cards and the comments
// together, after the session is known, and pulls asked for while one is out
// wait for it and become one more.

import { getSupabase, remoteFetchCards, remoteFetchComments } from "./db.js";
import { addLiveLogEntry, reloadActivity } from "./activity.js";
import { cardsFailed, dropCard, putCard, putComment, replaceCards, replaceComments } from "./store.js";
import { getActiveUser } from "./user.js";
import { remotePullWishes } from "./wishlists.js";

export async function initializeRealtime() {
  // supabase-js did not load: a blocked cdn, or no network at all
  const sb = getSupabase();
  if (!sb) {
    cardsFailed();
    return;
  }

  await resyncFromRemote({ activity: false });

  let joins = 0;
  sb
    .channel("w2w-db")
    .on("postgres_changes", { event: "*", schema: "public", table: "cards" }, payload => {
      // a delete carries nothing but the old id
      if (payload.eventType === "DELETE") dropCard(payload.old.id);
      else if (payload.new) putCard(payload.new);
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "logs" }, payload => {
      if (payload.new) addLiveLogEntry(payload.new);
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "wishes" }, () => {
      remotePullWishes();
    })
    // row level security decides who hears these: a guest's socket gets no
    // inserts or updates from this table at all. a delete carries only the
    // key, card and author
    .on("postgres_changes", { event: "*", schema: "public", table: "comments" }, payload => {
      if (payload.eventType === "DELETE") putComment(payload.old.card_id, payload.old.author, "");
      else if (payload.new) putComment(payload.new.card_id, payload.new.author, payload.new.body);
    })
    .subscribe(status => {
      console.log("[realtime]", status);

      // events sent while the socket is down are lost for good, so every join
      // starts from a full pull. that covers a reconnect after a sleeping
      // laptop, and on the first join the gap between the boot pull and the
      // moment the channel was actually listening. the first one finds what
      // is already drawn, and changes nothing on screen
      if (status === "SUBSCRIBED") resyncFromRemote({ activity: (joins += 1) > 1 });
    });
}

let pulling = null;
let again = false;

// also run when someone signs in or out, since what a member may read and a
// guest may not changes with it
export function resyncFromRemote({ activity = true } = {}) {
  if (pulling) {
    again = true;
    return pulling;
  }

  pulling = (async () => {
    do {
      again = false;
      await pullEverything();
    } while (again);
    pulling = null;
  })();

  if (activity) reloadActivity();
  return pulling;
}

// the cards and the comments are asked for together and drawn together. a
// guest would get no comments anyway, so a guest is not asked for them, and
// that empty list is what clears them off the page on sign-out.
//
// the database is the whole truth, so a card it did not return is gone.
// realtime alone never says so for certain: an event sent while the socket was
// down does not arrive, and an id edited by hand comes in as an update for a
// card nobody has seen, with nothing that would ever remove the old one
async function pullEverything() {
  const [cards, comments] = await Promise.all([
    remoteFetchCards(),
    getActiveUser() ? remoteFetchComments() : [],
  ]);

  if (comments) replaceComments(comments);
  if (cards) replaceCards(cards);
  else cardsFailed();

  await remotePullWishes();
}
