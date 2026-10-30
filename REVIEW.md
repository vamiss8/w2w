# Project review · October 30, 2026

Reviewed the static application, Supabase access model and migrations, realtime
flow, forms, list rendering, styles, security headers, dependency handling,
CI and the offline database/browser harness. GitHub's latest merged change is
PR #14, whose application commits match this checkout. No live database writes
were made during review or testing.

## Addressed in this change

- List redraws moved every card even when its position was unchanged. Nodes
  now stay attached unless their order changes; completed entrance animations
  are released. Episode updates no longer replay the list or disturb scroll.
- Hover shadows fell across neighbouring cards. Hover now changes the current
  card's surface and border, with a corresponding keyboard focus outline.
- The IMDb parser contained literal backspace characters instead of regex
  boundaries, rejecting valid IDs. Valid pasted links and catalogue IDs now
  save correctly. Labels consistently say `imdb`; lookup offers release choices
  instead of guessing which title was meant.
- Filters opened in the list's flow. Native popovers now give them a separate
  panel, with light dismissal, Escape, a Done button and a mobile layout.
- Secondary navigation icons and labels were difficult to read. Both are larger.
- Recognized episode entries now render as a dated timeline, retaining prose
  in order, duplicate dates, season numbers and the original editable text.
  Invalid dates and partial matches remain ordinary text.
- Several browser tests targeted navigation and Add button locations removed
  by the previous UI change. Their selectors now exercise the actual controls.

## Follow-up findings outside the interface change

1. **P2 · Rating ownership is enforced only by the UI.**
   `src/ratings.js` restricts clicks to the caller's score, but the update
   policy in `db/schema.sql` permits a member to update any column of a card.
   A direct authenticated API request can change the other person's score.
   Scores also have no database range constraint. A separate migration should
   enforce owner-specific changes and the 0–10 range, with access tests.
   Guests and unknown accounts remain blocked by RLS.

2. **P2 · Comment writes have no concurrency check.**
   `src/episodes.js` computes the next entry from the browser's snapshot and
   `remoteSaveComment` upserts the whole comment. Two tabs editing the same
   author's comment can overwrite each other; rapid clicks in one page are
   guarded, but that is not cross-browser coordination. An atomic database
   operation or a version check is needed for that stronger guarantee.

3. **P2 · Activity pagination can skip tied timestamps.**
   `remoteFetchLogs` sorts only by `ts` and fetches subsequent pages with
   `ts < cursor`. If more than one row at a page boundary shares its timestamp,
   the remainder is skipped. Use `(ts, id)` ordering and a matching composite
   cursor. Realtime rows arriving during a page fetch should also be deduplicated.

These findings are based on the checked-in policies and query paths; this
review does not inspect Supabase dashboard settings or deployed policies.

## Discovery scope and validation

Live TMDB discovery offers formats, broad genre moods, a reveal animation,
posters, descriptions and IMDb links, then opens an editable Add draft. It
excludes identifiable existing cards and avoids repeating picks during a
visit. It samples catalogue popularity; it does not infer personal taste or
guarantee streaming availability. Japanese animation is an approximation of
anime using TMDB's language and genre fields.

The read token stays in browser local storage and goes only to TMDB. Setup,
removal, failed authentication, service failures, cancellation, duplicate
filtering, draft saving and IMDb lookup are covered with synthetic responses.
Authenticated live HTTPS checks returned 200 for configuration, film
discovery, Japanese animation series and IMDb external IDs. TMDB's preflight
also permits the browser origin and Authorization header. The isolated test
Chromium cannot reach TMDB from this environment; the final connection in the
user's browser remains to be checked. No new database migration is required.

Lint, 35 database tests and 111 browser tests passed. Desktop and 360px mobile
screenshots were inspected for the list, filters, timeline and discovery.
