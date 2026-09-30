// every query the site makes, and the one supabase client they go through.
//
// the anon key below ships to every visitor, the way supabase intends: what it
// can do is decided by the row level security policies on the tables, not by
// keeping the key out of sight. with db/migrations/002 those let a guest read
// the cards and the log, and nothing more.

import { getActiveUser } from "./user.js";

const REMOTE = {
  url: "https://esdhstxcxxgcexddkxqi.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzZGhzdHhjeHhnY2V4ZGRreHFpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2Nzg1ODcsImV4cCI6MjA4MjI1NDU4N30.Tnes90BskmTxvxNaOSJkI1ah6MuQz7rmnKAeG_mtbiA",
};

// null when supabase-js did not load, which every caller takes as nothing to do
export function getSupabase() {
  if (!window.supabase) return null;

  // supabase's defaults are what a magic link needs: the session is kept in
  // localStorage and refreshed in the background, so one link signs a browser
  // in for good, and the tokens the link lands with are read from the address
  // bar and taken out of it
  if (!getSupabase.client) {
    getSupabase.client = window.supabase.createClient(REMOTE.url, REMOTE.anonKey);
  }

  return getSupabase.client;
}

export async function remoteFetchCards() {
  const sb = getSupabase();
  if (!sb) return null;

  const { data, error } = await sb
    .from("cards")
    .select("*")
    .order("id", { ascending: true });

  if (error || !data) {
    console.error("[supabase] cards pull failed", error);
    return null;
  }

  return data;
}

export async function remoteInsertCard(payload) {
  const sb = getSupabase();
  if (!sb) return null;

  const { data, error } = await sb
    .from("cards")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    console.error("[supabase] insert card failed", error);
    return null;
  }

  return data;
}

export async function remoteUpdateCard(cardId, patch) {
  const sb = getSupabase();
  if (!sb) return null;

  const id = parseInt(String(cardId), 10);
  if (Number.isNaN(id)) return null;

  const { data, error } = await sb
    .from("cards")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    console.error("[supabase] update card failed", error);
    return null;
  }

  return data;
}

// "deleted" when this call removed the row, "gone" when there was no row left
// to remove, "failed" otherwise
export async function remoteDeleteCard(cardId) {
  const sb = getSupabase();
  if (!sb) return "failed";

  const id = parseInt(cardId, 10);

  // .select() hands back the deleted rows, so an empty answer means nothing
  // was deleted, which a plain delete would report as success
  const { data, error } = await sb
    .from("cards")
    .delete()
    .eq("id", id)
    .select();

  if (error) {
    console.error("[supabase] delete error", error);
    return "failed";
  }

  if (data && data.length > 0) return "deleted";

  // nothing deleted means either a policy refused, or there was no row to
  // begin with: removed from another tab, or never in the database at all.
  // only the first is worth an alert, the second just means this page was
  // behind. the alert used to blame the policies for both, and a card that
  // existed only on screen could not be deleted at all
  const { data: row, error: checkError } = await sb
    .from("cards")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (!checkError && !row) return "gone";

  alert("could not delete from db! please check supabase rls policies for delete.");
  return "failed";
}

export async function remoteUpdateRating(cardId, owner, score) {
  const sb = getSupabase();
  if (!sb) return;

  const id = parseInt(cardId, 10);
  if (Number.isNaN(id)) return;

  const patch = owner === "vlad" ? { vlad_score: score } : { vika_score: score };

  const { error } = await sb.from("cards").update(patch).eq("id", id);
  if (error) console.error("[supabase] update rating failed", error);
}

// a line in the activity log. only one of us writes them, and the database
// signs each with the account that wrote it: user_name defaults to
// app_user(), and a line under the other name is refused
export async function remoteInsertLog(action, details, cardIdOrNull) {
  const sb = getSupabase();
  if (!sb) return;

  if (!getActiveUser()) return;

  const cardId = cardIdOrNull ? parseInt(cardIdOrNull, 10) : null;

  const { error } = await sb.from("logs").insert({
    action,
    card_id: Number.isNaN(cardId) ? null : cardId,
    details: details || {},
  });

  if (error) console.error("[supabase] insert log failed", error);
}

// one page of the activity log, newest first, and only entries older than
// beforeTs when it is given
export async function remoteFetchLogs(limit, beforeTs) {
  const sb = getSupabase();
  if (!sb) return { data: null, error: null };

  let q = sb
    .from("logs")
    .select("*")
    .order("ts", { ascending: false })
    .limit(limit);

  if (beforeTs) {
    q = q.lt("ts", beforeTs);
  }

  return await q;
}

export async function remoteFetchWishes() {
  const sb = getSupabase();
  if (!sb) return null;

  const { data, error } = await sb
    .from("wishes")
    .select("*")
    .order("added_at", { ascending: true });

  if (error) {
    console.error("[supabase] wishes pull failed", error);
    return null;
  }

  return data || [];
}

export async function remoteInsertWish(owner, title, link) {
  const sb = getSupabase();
  if (!sb) return;

  // the database numbers wishes itself, the same way it numbers cards
  const payload = { owner, title, link: link || null };

  const { error } = await sb.from("wishes").insert(payload);
  if (error) console.error("[supabase] wish insert failed", error);
}

export async function remoteDeleteWish(id) {
  const sb = getSupabase();
  if (!sb) return;

  const { error } = await sb.from("wishes").delete().eq("id", parseInt(id, 10));
  if (error) console.error("[supabase] wish delete failed", error);
}

// every comment, for one of us. row level security gives anyone else none
export async function remoteFetchComments() {
  const sb = getSupabase();
  if (!sb) return null;

  const { data, error } = await sb.from("comments").select("card_id, author, body");

  if (error) {
    console.error("[supabase] comments pull failed", error);
    return null;
  }

  return data || [];
}

// one row per card and author, so saving again overwrites the last one. the
// database refuses a comment under the other name
export async function remoteSaveComment(cardId, author, body) {
  const sb = getSupabase();
  if (!sb) return false;

  const { error } = await sb
    .from("comments")
    .upsert({ card_id: parseInt(cardId, 10), author, body }, { onConflict: "card_id,author" });

  if (error) {
    console.error("[supabase] save comment failed", error);
    return false;
  }

  return true;
}

// the magic link. only an account that already exists gets one: the two of us
// were created by hand, and sign-ups are switched off, so this form cannot
// make a new one either
export async function remoteSendMagicLink(email) {
  const sb = getSupabase();
  if (!sb) return { error: new Error("supabase-js did not load") };

  return sb.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: location.origin + location.pathname,
    },
  });
}

export async function remoteSignOut() {
  const sb = getSupabase();
  if (!sb) return;

  const { error } = await sb.auth.signOut();
  if (error) console.error("[supabase] sign out failed", error);
}

// vlad, vika, or null for anyone the database does not know. the name comes
// from public.members through app_user(), so the page never holds our emails
export async function remoteWhoAmI() {
  const sb = getSupabase();
  if (!sb) return null;

  const { data, error } = await sb.rpc("app_user");
  if (error) {
    console.error("[supabase] app_user failed", error);
    return null;
  }

  return data || null;
}

// every change of session: the one restored on load, a sign-in through a
// link, a refresh, a sign-out
export function onAuthChange(callback) {
  const sb = getSupabase();
  if (!sb) return;

  sb.auth.onAuthStateChange(callback);
}
