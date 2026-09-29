// every query the site makes, and the one supabase client they go through.
//
// the anon key below ships to every visitor, the way supabase intends: what it
// can do is decided by the row level security policies on the tables, not by
// keeping the key out of sight.

import { getActiveUser } from "./user.js";

const REMOTE = {
  url: "https://esdhstxcxxgcexddkxqi.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzZGhzdHhjeHhnY2V4ZGRreHFpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2Nzg1ODcsImV4cCI6MjA4MjI1NDU4N30.Tnes90BskmTxvxNaOSJkI1ah6MuQz7rmnKAeG_mtbiA",
};

export function getSupabase() {
  if (!window.supabase) return null;

  if (!getSupabase.client) {
    getSupabase.client = window.supabase.createClient(REMOTE.url, REMOTE.anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
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

export async function remoteInsertLog(action, details, cardIdOrNull) {
  const sb = getSupabase();
  if (!sb) return;

  const user = getActiveUser();
  if (!user) return;

  const cardId = cardIdOrNull ? parseInt(cardIdOrNull, 10) : null;

  const { error } = await sb.from("logs").insert({
    user_name: user,
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
