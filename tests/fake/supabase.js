// a stand-in for supabase that lives inside the page. playwright injects it
// before any script of the site runs, so supabase-js talks to it without
// knowing: postgrest over fetch, the auth endpoints a magic link uses, and the
// realtime socket. the rules mirror db/schema.sql: a guest reads cards and
// logs, one of us writes, comments and wishes are ours alone, log lines are
// signed with whoever wrote them.
//
// the data starts as tests/fixtures, put on window.__W2W_FIXTURES__ by
// tests/e2e/site.js, and lives as long as the page: a reload starts over.
// tests reach in through window.__fake.
(function () {
  const HOST = "esdhstxcxxgcexddkxqi.supabase.co";
  const fixtures = window.__W2W_FIXTURES__;
  if (!fixtures) throw new Error("tests/fake/supabase.js needs window.__W2W_FIXTURES__");

  const MEMBERS = Object.fromEntries(fixtures.members.map(m => [m.email.toLowerCase(), m.name]));

  // the columns of each table, so a request naming one that does not exist
  // fails the way postgrest fails it
  const COLUMNS = {
    cards: ["id", "title", "tab", "state", "status", "start_date", "end_date", "vlad_score", "vika_score", "updated_at"],
    logs: ["id", "ts", "user_name", "action", "card_id", "details"],
    wishes: ["id", "owner", "title", "added_at", "links", "done_at", "done_by", "updated_at"],
    comments: ["card_id", "author", "body", "updated_at"],
  };
  const PUBLIC = new Set(["cards", "logs"]);

  // timestamps written by the fake come from a clock of their own, so a run
  // never depends on when it happens
  let clock = Date.parse("2026-10-28T12:00:00.000Z");
  const tick = () => new Date((clock += 1000)).toISOString();

  const copy = rows => rows.map(r => JSON.parse(JSON.stringify(r)));
  const db = {
    cards: copy(fixtures.cards),
    logs: copy(fixtures.logs),
    wishes: copy(fixtures.wishes),
    comments: copy(fixtures.comments),
  };
  const seq = {
    cards: Math.max(0, ...db.cards.map(r => r.id)),
    logs: Math.max(0, ...db.logs.map(r => r.id)),
    wishes: Math.max(0, ...db.wishes.map(r => r.id)),
  };

  const requests = [];
  const sockets = [];
  const failures = [];

  // --- sessions ---------------------------------------------------------------

  const b64 = obj => btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  function makeJwt(email) {
    const exp = Math.floor(Date.now() / 1000) + 86400;
    return `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: "uid-" + email, email, role: "authenticated", aud: "authenticated", exp })}.fake`;
  }
  function emailOf(token) {
    try {
      const claims = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      return claims.role === "authenticated" ? claims.email : null;
    } catch {
      return null;
    }
  }
  const memberOf = token => MEMBERS[(emailOf(token) || "").toLowerCase()] || null;

  // --- realtime ---------------------------------------------------------------

  let nextBindingId = 1000;

  class FakeSocket {
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.binaryType = "blob";
      this.listeners = {};
      this.channels = {};
      sockets.push(this);
      setTimeout(() => this._open(), 5);
    }
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
    removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter(f => f !== fn); }
    _emit(type, ev) {
      if (this["on" + type]) this["on" + type](ev);
      (this.listeners[type] || []).forEach(fn => fn(ev));
    }
    _open() {
      if (this.readyState !== 0) return;
      this.readyState = 1;
      this._emit("open", { type: "open" });
    }
    _deliver(frame) {
      if (this.readyState !== 1) return;
      setTimeout(() => this._emit("message", { type: "message", data: JSON.stringify(frame) }), 1);
    }
    // realtime-js speaks phoenix's v2 serializer: [join_ref, ref, topic, event, payload]
    send(data) {
      if (typeof data !== "string") return;
      const [joinRef, ref, topic, event, payload] = JSON.parse(data);
      if (topic === "phoenix" && event === "heartbeat") {
        this._deliver([null, ref, "phoenix", "phx_reply", { status: "ok", response: {} }]);
        return;
      }
      if (event === "phx_join") {
        const wanted = payload?.config?.postgres_changes || [];
        const bindings = wanted.map(w => ({ id: nextBindingId++, event: w.event, schema: w.schema, table: w.table }));
        this.channels[topic] = { joinRef, bindings, token: payload?.access_token || null };
        this._deliver([joinRef, ref, topic, "phx_reply", { status: "ok", response: { postgres_changes: bindings } }]);
        return;
      }
      if (event === "access_token" && this.channels[topic]) {
        this.channels[topic].token = payload?.access_token || null;
      }
      this._deliver([joinRef, ref, topic, "phx_reply", { status: "ok", response: {} }]);
    }
    close(code = 1000) {
      if (this.readyState >= 2) return;
      this.readyState = 3;
      setTimeout(() => this._emit("close", { type: "close", code, reason: "", wasClean: true }), 1);
    }
    // the server hanging up, the way a sleeping laptop loses the socket
    drop() {
      this.readyState = 3;
      this._emit("close", { type: "close", code: 1006, reason: "", wasClean: false });
    }
  }

  const RealWebSocket = window.WebSocket;
  window.WebSocket = function (url, protocols) {
    if (String(url).includes(HOST)) return new FakeSocket(url);
    return new RealWebSocket(url, protocols);
  };
  Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });

  // what postgres sends out after a change. a private table reaches a channel
  // only when its token is one of ours; a delete goes to everyone with nothing
  // but the key, as it does for real
  function broadcast(table, type, record, oldRecord) {
    for (const s of sockets) {
      for (const [topic, ch] of Object.entries(s.channels)) {
        if (!PUBLIC.has(table) && type !== "DELETE" && !memberOf(ch.token)) continue;
        const ids = ch.bindings
          .filter(b => b.schema === "public" && b.table === table && (b.event === "*" || b.event === type))
          .map(b => b.id);
        if (!ids.length) continue;
        s._deliver([null, null, topic, "postgres_changes", {
          ids,
          data: {
            schema: "public", table, type, errors: null, columns: [],
            commit_timestamp: new Date(clock).toISOString(),
            record: record || {}, old_record: oldRecord || {},
          },
        }]);
      }
    }
  }

  const keyOf = (table, r) => (table === "comments" ? { card_id: r.card_id, author: r.author } : { id: r.id });

  // --- postgrest ----------------------------------------------------------------

  const json = (status, body) => new Response(body === null ? null : JSON.stringify(body), {
    status: body === null && status === 200 ? 204 : status,
    headers: { "content-type": "application/json" },
  });
  const refused = () => json(403, { code: "42501", message: "new row violates row-level security policy" });
  const noColumn = (table, col) => json(400, { code: "PGRST204", message: `Could not find the '${col}' column of '${table}' in the schema cache` });

  function filtersOf(params) {
    const out = [];
    for (const [k, v] of params) {
      if (["select", "order", "limit", "offset", "columns", "on_conflict"].includes(k)) continue;
      const m = /^(eq|neq|lt|gt|lte|gte|is)\.(.*)$/.exec(v);
      if (m) out.push({ col: k, op: m[1], val: m[2] });
    }
    return out;
  }
  function matches(row, filters) {
    return filters.every(({ col, op, val }) => {
      const a = row[col];
      if (op === "is") return val === "null" ? a == null : String(a) === val;
      const cmp = typeof a === "number" ? a - Number(val) : String(a) < val ? -1 : String(a) > val ? 1 : 0;
      return { eq: cmp === 0, neq: cmp !== 0, lt: cmp < 0, gt: cmp > 0, lte: cmp <= 0, gte: cmp >= 0 }[op];
    });
  }
  function project(row, select) {
    if (!select || select === "*") return { ...row };
    return Object.fromEntries(select.split(",").map(c => c.trim()).map(c => [c, row[c]]));
  }
  function respond(status, body, accept) {
    if ((accept || "").includes("vnd.pgrst.object+json") && Array.isArray(body)) {
      if (body.length !== 1) return json(406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" });
      body = body[0];
    }
    return json(status, body);
  }

  function handleRest(method, url, headers, body, member) {
    const table = url.pathname.replace("/rest/v1/", "");
    const params = url.searchParams;
    const select = params.get("select");
    const accept = headers.get("accept") || "";
    const prefer = headers.get("prefer") || "";
    const wantsRows = prefer.includes("return=representation");

    requests.push({
      method, table, body, as: member || "guest",
      query: [...params].map(([k, v]) => `${k}=${v}`).sort().join("&"),
      prefer: prefer.split(",").map(s => s.trim()).filter(Boolean).sort().join(","),
    });

    if (table === "rpc/app_user") return json(200, member);
    if (table === "rpc/schema_version") {
      // a test can play a database from before 004, which had no such
      // function, or one a migration ahead of the page
      const version = window.__W2W_SCHEMA_VERSION__ ?? 4;
      return version ? json(200, version) : json(404, { code: "PGRST202", message: "Could not find the function public.schema_version without parameters in the schema cache" });
    }

    const rows = db[table];
    if (!rows) return json(404, { code: "42P01", message: `relation "public.${table}" does not exist` });

    for (const col of (select && select !== "*" ? select.split(",").map(c => c.trim()) : [])) {
      if (!COLUMNS[table].includes(col)) return json(400, { code: "42703", message: `column ${table}.${col} does not exist` });
    }

    const filters = filtersOf(params);

    if (method === "GET") {
      if (!PUBLIC.has(table) && !member) return respond(200, [], accept);
      let out = rows.filter(r => matches(r, filters));
      const order = params.get("order");
      if (order) {
        const [col, dir] = order.split(".");
        out.sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (dir === "desc" ? -1 : 1));
      }
      const limit = params.get("limit");
      if (limit) out = out.slice(0, Number(limit));
      return respond(200, out.map(r => project(r, select)), accept);
    }

    if (method === "POST") {
      if (!member) return refused();
      const list = Array.isArray(body) ? body : [body];
      for (const values of list) {
        for (const col of Object.keys(values)) if (!COLUMNS[table].includes(col)) return noColumn(table, col);
        if ("id" in values) return json(428, { code: "428C9", message: `cannot insert a non-DEFAULT value into column "id"` });
        if (table === "logs" && values.user_name !== undefined && values.user_name !== member) return refused();
        if (table === "comments" && values.author !== member) return refused();
      }

      const out = list.map(values => {
        if (table === "comments") {
          const existing = rows.find(r => r.card_id === values.card_id && r.author === values.author);
          if (existing) {
            if (!prefer.includes("resolution=merge-duplicates")) throw new Error("duplicate key value violates unique constraint");
            Object.assign(existing, values, { updated_at: tick() });
            broadcast(table, "UPDATE", { ...existing }, {});
            return existing;
          }
          const row = { body: "", ...values, updated_at: tick() };
          rows.push(row);
          broadcast(table, "INSERT", { ...row }, null);
          return row;
        }
        const row = { ...values, id: ++seq[table] };
        if (table === "cards") Object.assign(row, { vlad_score: 0, vika_score: 0, ...values, id: row.id, updated_at: tick() });
        if (table === "logs") Object.assign(row, { ts: tick(), user_name: member, card_id: values.card_id ?? null, details: values.details ?? {} });
        if (table === "wishes") {
          const now = tick();
          Object.assign(row, { links: values.links ?? [], added_at: now, updated_at: now, done_at: values.done_at ?? null });
          row.done_by = row.done_at ? member : null;
        }
        rows.push(row);
        broadcast(table, "INSERT", { ...row }, null);
        return row;
      });
      return respond(201, wantsRows ? out.map(r => project(r, select)) : null, accept);
    }

    if (method === "PATCH") {
      for (const col of Object.keys(body || {})) if (!COLUMNS[table].includes(col)) return noColumn(table, col);
      if (body && "id" in body) return json(428, { code: "428C9", message: `column "id" can only be updated to DEFAULT` });
      if (table === "logs") return json(403, { code: "42501", message: "permission denied for table logs" });
      const hit = member ? rows.filter(r => matches(r, filters) && (table !== "comments" || r.author === member)) : [];
      hit.forEach(r => {
        const before = { done_at: r.done_at, done_by: r.done_by };
        Object.assign(r, body);
        if (table === "cards" || table === "comments" || table === "wishes") r.updated_at = tick();
        // what trg_wishes_stamp_done does: the name comes from the session,
        // whatever the request said
        if (table === "wishes") {
          if (!r.done_at) r.done_by = null;
          else if (!before.done_at) r.done_by = member;
          else r.done_by = before.done_by;
        }
        broadcast(table, "UPDATE", { ...r }, {});
      });
      return respond(200, wantsRows ? hit.map(r => project(r, select)) : null, accept);
    }

    if (method === "DELETE") {
      if (table === "logs") return json(403, { code: "42501", message: "permission denied for table logs" });
      const hit = member ? rows.filter(r => matches(r, filters) && (table !== "comments" || r.author === member)) : [];
      db[table] = rows.filter(r => !hit.includes(r));
      if (table === "cards") {
        // what the foreign keys do: comments go with the card, logs let go of it
        const gone = new Set(hit.map(r => r.id));
        const orphaned = db.comments.filter(c => gone.has(c.card_id));
        db.comments = db.comments.filter(c => !gone.has(c.card_id));
        orphaned.forEach(c => broadcast("comments", "DELETE", null, keyOf("comments", c)));
        db.logs.forEach(l => { if (gone.has(l.card_id)) l.card_id = null; });
      }
      hit.forEach(r => broadcast(table, "DELETE", null, keyOf(table, r)));
      return respond(200, wantsRows ? hit.map(r => project(r, select)) : null, accept);
    }

    return json(405, { message: "method not allowed" });
  }

  // --- auth -----------------------------------------------------------------------

  function handleAuth(method, url, body, token) {
    const path = url.pathname.replace("/auth/v1/", "");
    requests.push({ method, table: "auth/" + path, body, as: memberOf(token) || "guest", query: [...url.searchParams].map(([k, v]) => `${k}=${v}`).sort().join("&"), prefer: "" });

    if (path === "otp") {
      // supabase refuses a link for an address with no account, since
      // sign-ups are off
      const known = (body?.email || "").toLowerCase() in MEMBERS;
      return known || body?.create_user ? json(200, {}) : json(422, { code: "otp_disabled", msg: "Signups not allowed for otp" });
    }
    if (path === "logout") return new Response(null, { status: 204 });
    if (path === "user") {
      const email = emailOf(token);
      if (!email) return json(401, { code: "bad_jwt", msg: "invalid JWT" });
      return json(200, { id: "uid-" + email, aud: "authenticated", role: "authenticated", email, app_metadata: {}, user_metadata: {}, created_at: "2026-09-30T00:00:00Z" });
    }
    if (path === "token") {
      const email = (body?.refresh_token || "").replace(/^rt-/, "");
      return json(200, {
        access_token: makeJwt(email), token_type: "bearer", expires_in: 86400,
        expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: "rt-" + email,
        user: { id: "uid-" + email, email, aud: "authenticated", role: "authenticated" },
      });
    }
    return json(404, { message: "no such auth endpoint" });
  }

  const realFetch = window.fetch.bind(window);
  window.fetch = async function (input, init = {}) {
    const url = new URL(typeof input === "string" ? input : input.url, location.href);
    if (url.host !== HOST) return realFetch(input, init);
    const method = (init.method || (typeof input === "string" ? "GET" : input.method)).toUpperCase();
    const headers = new Headers(init.headers || (typeof input === "string" ? {} : input.headers));
    const body = typeof init.body === "string" && init.body ? JSON.parse(init.body) : null;
    const token = (headers.get("authorization") || "").replace(/^Bearer /, "");
    await new Promise(r => setTimeout(r, 2));
    const table = url.pathname.replace(/^\/(rest|auth)\/v1\//, "");
    const failure = failures.findIndex(f => f.method === method && f.table === table);
    if (failure >= 0) {
      failures.splice(failure, 1);
      requests.push({ method, table, body, as: memberOf(token) || "guest", query: "", prefer: "", failed: true });
      return json(500, { code: "XX000", message: "the fake was told to fail this one" });
    }
    if (url.pathname.startsWith("/auth/v1/")) return handleAuth(method, url, body, token);
    if (url.pathname.startsWith("/rest/v1/")) return handleRest(method, url, headers, body, memberOf(token));
    return json(404, {});
  };

  window.__fake = {
    db,
    requests,
    sockets,
    makeJwt,
    // the address bar a magic link lands on
    linkHash(email) {
      const exp = Math.floor(Date.now() / 1000) + 86400;
      return `#access_token=${makeJwt(email)}&expires_at=${exp}&expires_in=86400&refresh_token=rt-${email}&token_type=bearer&type=magiclink`;
    },
    // a change made somewhere else, the other person's browser or the table
    // editor, that reaches this page over realtime
    insert(table, values) {
      const row = table === "comments" ? { ...values } : { ...values, id: values.id ?? ++seq[table] };
      if (table === "wishes") row.added_at ??= tick();
      db[table].push(row);
      broadcast(table, "INSERT", { ...row }, null);
      return row;
    },
    update(table, id, patch, { silent = false } = {}) {
      const row = db[table].find(r => r.id === id);
      Object.assign(row, patch);
      if (!silent) broadcast(table, "UPDATE", { ...row }, {});
      return row;
    },
    remove(table, id, { silent = false } = {}) {
      const row = db[table].find(r => r.id === id);
      db[table] = db[table].filter(r => r !== row);
      if (!silent) broadcast(table, "DELETE", null, keyOf(table, row));
    },
    dropSockets() {
      sockets.forEach(s => s.readyState === 1 && s.drop());
    },
    // the next request with this method to this table fails, the way a
    // dropped connection or a refusing database would
    failNext(method, table) {
      failures.push({ method, table });
    },
    channelEmails() {
      return sockets.flatMap(s => Object.values(s.channels)).map(ch => emailOf(ch.token || ""));
    },
  };
})();
