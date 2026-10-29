// the entry point. index.html loads this as a module, so it runs once the
// whole page is parsed and every element it looks up is already there.
//
// the ui is wired before the first pull, so the page answers clicks while
// the cards are still on their way.

import { initializeCardUi } from "./editor.js";
import { initializeGift } from "./gift.js";
import { initializeLists, scheduleRender } from "./lists.js";
import { initializeLogsWidget } from "./logs.js";
import { initializeRatingEditing } from "./ratings.js";
import { startStarfield } from "./starfield.js";
import { initializeRealtime, resyncFromRemote } from "./sync.js";
import { initializeTooltipAutoFlip } from "./tooltips.js";
import { initializeAuth, onUserChange } from "./user.js";
import { initializeVersionCheck } from "./version.js";
import { initializeWishlists, remotePullWishes } from "./wishlists.js";

startStarfield();

initializeAuth();
onUserChange(() => resyncFromRemote());
initializeVersionCheck();
initializeLists();
initializeCardUi();
initializeLogsWidget();
initializeRatingEditing();
initializeTooltipAutoFlip();
initializeWishlists();
initializeGift();

try {
  await remotePullWishes();
  await initializeRealtime();
} catch (e) {
  console.error("[supabase] initializeRealtime crashed", e);
}

scheduleRender({ animate: true });
