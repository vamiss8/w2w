// keeping the page equal to the database. realtime reports each change as it
// happens, and a full pull on every join covers whatever it missed while the
// socket was down.

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

  await remotePullCards();

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
      // moment the channel was actually listening
      if (status === "SUBSCRIBED") resyncFromRemote();
    });
}

// also run when someone signs in or out, since what a member may read and a
// guest may not changes with it
export async function resyncFromRemote() {
  await remotePullCards();
  await remotePullComments();
  await remotePullWishes();
  reloadActivity();
}

// the database is the whole truth, so a card it did not return is gone.
// realtime alone never says so for certain: an event sent while the socket was
// down does not arrive, and an id edited by hand comes in as an update for a
// card nobody has seen, with nothing that would ever remove the old one
async function remotePullCards() {
  const data = await remoteFetchCards();
  if (data) replaceCards(data);
  else cardsFailed();
}

// a guest would get an empty answer anyway, so a guest is not asked for. an
// empty list still goes through, which is what clears the comments off the
// page when someone signs out
async function remotePullComments() {
  const rows = getActiveUser() ? await remoteFetchComments() : [];
  if (rows) replaceComments(rows);
}
