// the entry point. index.html loads this as a module, so it runs once the
// whole page is parsed and every element it looks up is already there.
//
// the ui is wired before the first pull, so the page answers clicks while
// the cards are still on their way. the router goes last of the wiring: the
// section it opens is announced to everything wired before it.

import { initializeActivity } from "./activity.js";
import { initializeDialogs } from "./dialogs.js";
import { initializeCardUi } from "./editor.js";
import { initializeEpisodes } from "./episodes.js";
import { initializeGift } from "./gift.js";
import { initializeHints } from "./hints.js";
import { initializeLists } from "./lists.js";
import { initializeRatingEditing } from "./ratings.js";
import { initializeRouter } from "./router.js";
import { initializeSearch } from "./search.js";
import { startStarfield } from "./starfield.js";
import { initializeStats } from "./stats.js";
import { initializeRealtime, resyncFromRemote } from "./sync.js";
import { initializeTonight } from "./tonight.js";
import { initializeTooltipAutoFlip } from "./tooltips.js";
import { initializeAuth, onUserChange, whenIdentityKnown } from "./user.js";
import { initializeVersionCheck } from "./version.js";
import { initializeWishlists } from "./wishlists.js";

startStarfield();

initializeDialogs();
initializeAuth();
initializeVersionCheck();
initializeLists();
initializeSearch();
initializeTonight();
initializeCardUi();
initializeEpisodes();
initializeActivity();
initializeStats();
initializeRatingEditing();
initializeTooltipAutoFlip();
initializeHints();
initializeWishlists();
initializeGift();
initializeRouter();

// the first pull waits until the database has said who is here, and a later
// sign-in or sign-out pulls again: what a member may read changes with it
try {
  await whenIdentityKnown();
  onUserChange(() => resyncFromRemote());
  await initializeRealtime();
} catch (e) {
  console.error("[supabase] initializeRealtime crashed", e);
}

