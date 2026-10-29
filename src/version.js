// the page and the database have to agree on the shape of the tables. this
// page was written for the database migration SCHEMA_VERSION leaves behind,
// and when the one it talks to is behind, one of us is told so, with what to
// run. before this, a pull request merged without its migration looked
// exactly like a broken site: ticks that undid themselves, links gone.

import { remoteSchemaVersion } from "./db.js";
import { getActiveUser, onUserChange } from "./user.js";

// raised together with public.schema_version() by every migration.
// tests/db/schema.test.js holds the two to the newest file in db/migrations
export const SCHEMA_VERSION = 4;

const BANNER_ID = "dbBanner";

function describe(version) {
  if (version < SCHEMA_VERSION) {
    return `the database is behind this page, which needs migration ${SCHEMA_VERSION}. ` +
      "run what is missing from db/migrations in the supabase sql editor, then reload.";
  }
  return "this page is older than the database. reload to get the new one.";
}

// a guest could do nothing about it, and the page reads well enough without
// the newest columns, so only one of us is ever asked, and told
async function check() {
  const banner = document.getElementById(BANNER_ID);
  if (!banner) return;

  const version = getActiveUser() ? await remoteSchemaVersion() : null;
  const behind = version !== null && version !== SCHEMA_VERSION;

  banner.hidden = !behind;
  banner.textContent = behind ? describe(version) : "";
}

export function initializeVersionCheck() {
  onUserChange(check);
}
