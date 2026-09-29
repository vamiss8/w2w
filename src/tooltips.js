// tooltips open upwards and flip below their anchor when there is no room.

function autoFlipTooltip(anchorEl) {
  const tooltip = anchorEl.querySelector(".tooltip");
  if (!tooltip) return;

  // reset to default (up)
  tooltip.classList.remove("tooltip-down");

  const a = anchorEl.getBoundingClientRect();
  const tooltipHeight = tooltip.offsetHeight || 0;

  // approximate space we need (height + arrow + a bit of air)
  const needed = tooltipHeight + 18;

  const spaceTop = a.top;
  const spaceBottom = window.innerHeight - a.bottom;

  // if there's not enough space above, and more space below -> flip down
  if (needed > spaceTop && spaceBottom > spaceTop) {
    tooltip.classList.add("tooltip-down");
  }
}

const TOOLTIP_ANCHOR_SELECTOR = ".chip, .info-badge, .status";

// listens on the document instead of on every anchor: cards are drawn from the
// database after this runs, so listeners attached one by one at boot never
// reached the status badge of a single card
export function initializeTooltipAutoFlip() {
  document.addEventListener("mouseover", e => {
    const anchor = e.target.closest(TOOLTIP_ANCHOR_SELECTOR);
    if (!anchor) return;
    // mouseover also fires between an anchor's own children, and only the
    // way in needs a fresh measurement, the same moment mouseenter used to catch
    if (anchor.contains(e.relatedTarget)) return;
    autoFlipTooltip(anchor);
  });

  document.addEventListener("focusin", e => {
    const anchor = e.target.closest(TOOLTIP_ANCHOR_SELECTOR);
    if (anchor) autoFlipTooltip(anchor);
  });
}
