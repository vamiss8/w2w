// the entry point. index.html loads this as a module, so it runs once the
// whole page is parsed and every element it looks up is already there.
//
// the ui is wired before the first pull, so the page answers clicks while
// the cards are still on their way. the router goes last of the wiring: the
// section it opens is announced to everything wired before it.

import { initializeActivity } from "./activity.js";
import { initializeDialogs } from "./dialogs.js";
import { initializeCardUi } from "./editor.js";
import { initializeGift } from "./gift.js";
import { initializeLists, scheduleRender } from "./lists.js";
import { initializeRatingEditing } from "./ratings.js";
import { initializeRouter } from "./router.js";
import { initializeSearch } from "./search.js";
import { startStarfield } from "./starfield.js";
import { initializeRealtime, resyncFromRemote } from "./sync.js";
import { initializeTooltipAutoFlip } from "./tooltips.js";
import { initializeAuth, onUserChange } from "./user.js";
import { initializeVersionCheck } from "./version.js";
import { initializeWishlists, remotePullWishes } from "./wishlists.js";

startStarfield();

initializeDialogs();
initializeAuth();
onUserChange(() => resyncFromRemote());
initializeVersionCheck();
initializeLists();
initializeSearch();
initializeCardUi();
initializeActivity();
initializeRatingEditing();
initializeTooltipAutoFlip();
initializeWishlists();
initializeGift();
initializeRouter();

try {
  await remotePullWishes();
  await initializeRealtime();
} catch (e) {
  console.error("[supabase] initializeRealtime crashed", e);
}

scheduleRender({ animate: true });
