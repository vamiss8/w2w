// the entry point. index.html loads this as a module, so it runs once the
// whole page is parsed and every element it looks up is already there.
//
// the ui is wired before the first pull, so the page answers clicks while
// the cards are still on their way.

import { initializeCardUi } from "./editor.js";
import { initializeGift } from "./gift.js";
import { initializeLogsWidget } from "./logs.js";
import { initializeRatingEditing } from "./ratings.js";
import { startStarfield } from "./starfield.js";
import { initializeRealtime } from "./sync.js";
import { initializeTooltipAutoFlip } from "./tooltips.js";
import { initializeAuth } from "./user.js";
import { applyActiveTabView, initializeControls, initializeFiltersToggle, initializeTabs } from "./view.js";
import { initializeWishlists, remotePullWishes } from "./wishlists.js";

startStarfield();

initializeAuth();
initializeCardUi();
initializeFiltersToggle();
initializeLogsWidget();
initializeRatingEditing();
initializeTooltipAutoFlip();
initializeControls();
initializeTabs();
initializeWishlists();
initializeGift();

try {
  await remotePullWishes();
  await initializeRealtime();
} catch (e) {
  console.error("[supabase] initializeRealtime crashed", e);
}

applyActiveTabView({ animate: true });
