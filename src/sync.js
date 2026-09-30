// keeping the page equal to the database. realtime reports each change as it
// happens, and a full pull on every join covers whatever it missed while the
// socket was down.

import { applyRemoteCardToDom } from "./cards.js";
import { getSupabase, remoteFetchCards } from "./db.js";
import { LOGS_PANEL_ID, prependRemoteLog, refreshLogsUI } from "./logs.js";
import { scheduleActiveTabView } from "./view.js";
import { remotePullWishes } from "./wishlists.js";

export async function initializeRealtime() {
  const sb = getSupabase();
  if (!sb) return;

  await remotePullAll();

  sb
    .channel("w2w-db")
    .on("postgres_changes", { event: "*", schema: "public", table: "cards" }, payload => {
      if (payload.eventType === "DELETE") {
        // a delete carries nothing but the old id
        const li = document.querySelector(`.lists li[data-id="${CSS.escape(String(payload.old.id))}"]`);
        if (li) li.remove();
        scheduleActiveTabView({ animate: false });
        return;
      }
      if (payload.new) applyRemoteCardToDom(payload.new);
      scheduleActiveTabView({ animate: false });
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "logs" }, payload => {
      if (!payload.new) return;
      const panel = document.getElementById(LOGS_PANEL_ID);
      if (panel && panel.dataset.open === "true") prependRemoteLog(payload.new);
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "wishes" }, payload => {
      remotePullWishes();
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
  await remotePullAll();
  await remotePullWishes();
  refreshLogsUI();
  scheduleActiveTabView({ animate: false });
}

async function remotePullAll() {
  const data = await remoteFetchCards();
  if (!data) return;

  data.forEach(row => applyRemoteCardToDom(row));

  // the database is the whole truth, so a card it did not return is gone.
  // realtime alone never says so for certain: an event sent while the socket
  // was down does not arrive, and an id edited by hand comes in as an update
  // for a card nobody has seen, with nothing that would ever remove the old one
  const live = new Set(data.map(row => String(row.id)));
  document.querySelectorAll(".lists li[data-id]").forEach(li => {
    if (!live.has(li.dataset.id)) li.remove();
  });
}
