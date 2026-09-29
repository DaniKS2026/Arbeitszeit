import { hashPassword, verifyPassword, signSession, sessionCookieHeader, clearedSessionCookieHeader } from "./auth.js";

// The only three people allowed to have an account at all. Editing this list
// requires a redeploy - that is intentional, it is the real access boundary.
export const ALLOWED_USERS = {
  "eric.dietrich@kern-studer.de": { name: "Erik Dietrich", role: "user" },
  "daniel.satzinger@kern-studer.de": { name: "Daniel Satzinger", role: "admin" },
  "simon.demant@kern-studer.de": { name: "Simon Demant", role: "admin" }
};

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export function json(obj, status = 200, extraHeaders) {
  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8" });
  if (extraHeaders) for (const [k, v] of Object.entries(extraHeaders)) headers.append(k, v);
  return new Response(JSON.stringify(obj), { status, headers });
}

function minutesBetween(start, end) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return eh * 60 + em - (sh * 60 + sm);
}

function toDateStr(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function rowToEntry(r) {
  return { id: r.id, date: r.date, start: r.start, end: r.end, durationMinutes: r.duration_minutes, category: r.category, note: r.note, createdAt: r.created_at };
}
function rowToRequest(r) {
  return { weekKey: r.week_key, requestedBy: r.requested_by, reason: r.reason, requestedAt: r.requested_at, weekTotalMinutes: r.week_total_minutes };
}
function rowToApproval(r) {
  return { weekKey: r.week_key, approvedBy: r.approved_by, approvedAt: r.approved_at, weekTotalMinutes: r.week_total_minutes };
}

// ---- auth / setup ----

export async function setupStatus(env) {
  const { results } = await env.DB.prepare("SELECT email FROM users").all();
  const existing = new Set(results.map((r) => r.email));
  const pending = Object.keys(ALLOWED_USERS).filter((e) => !existing.has(e));
  return json({ pending: pending.map((e) => ({ email: e, name: ALLOWED_USERS[e].name })), complete: pending.length === 0 });
}

export async function setupUser(request, env) {
  const body = await request.json().catch(() => ({}));
  const email = String(body.email || "").toLowerCase().trim();
  if (!ALLOWED_USERS[email]) return json({ error: "not_allowed" }, 400);
  const existing = await env.DB.prepare("SELECT email FROM users WHERE email=?").bind(email).first();
  if (existing) return json({ error: "already_set" }, 400);
  if (!body.password || String(body.password).length < 8) return json({ error: "weak_password" }, 400);
  const { hash, salt } = await hashPassword(String(body.password));
  const info = ALLOWED_USERS[email];
  await env.DB.prepare("INSERT INTO users (email,name,password_hash,salt,role) VALUES (?,?,?,?,?)")
    .bind(email, info.name, hash, salt, info.role)
    .run();
  return json({ ok: true });
}

export async function login(request, env) {
  const body = await request.json().catch(() => ({}));
  const email = String(body.email || "").toLowerCase().trim();
  const user = await env.DB.prepare("SELECT * FROM users WHERE email=?").bind(email).first();
  if (!user) return json({ error: "invalid_credentials" }, 401);
  const ok = await verifyPassword(String(body.password || ""), user.salt, user.password_hash);
  if (!ok) return json({ error: "invalid_credentials" }, 401);
  const exp = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  const token = await signSession({ email: user.email, name: user.name, role: user.role, exp }, env.SESSION_SECRET);
  return json({ name: user.name, role: user.role }, 200, { "Set-Cookie": sessionCookieHeader(token, SESSION_MAX_AGE_SECONDS) });
}

export function logout() {
  return json({ ok: true }, 200, { "Set-Cookie": clearedSessionCookieHeader() });
}

export async function changePassword(request, env, session) {
  const body = await request.json().catch(() => ({}));
  if (!body.newPassword || String(body.newPassword).length < 8) return json({ error: "weak_password" }, 400);
  const user = await env.DB.prepare("SELECT * FROM users WHERE email=?").bind(session.email).first();
  if (!user) return json({ error: "not_found" }, 404);
  const ok = await verifyPassword(String(body.currentPassword || ""), user.salt, user.password_hash);
  if (!ok) return json({ error: "invalid_credentials" }, 401);
  const { hash, salt } = await hashPassword(String(body.newPassword));
  await env.DB.prepare("UPDATE users SET password_hash=?, salt=? WHERE email=?").bind(hash, salt, session.email).run();
  return json({ ok: true });
}

// ---- entries ----

export async function listEntries(env) {
  const { results } = await env.DB.prepare("SELECT * FROM entries ORDER BY date DESC, start DESC LIMIT 2000").all();
  return json(results.map(rowToEntry));
}

export async function createEntry(request, env) {
  const body = await request.json().catch(() => ({}));
  if (!body.date || !body.start || !body.end || !body.category) return json({ error: "invalid" }, 400);
  const duration = minutesBetween(body.start, body.end);
  if (duration <= 0) return json({ error: "invalid_range" }, 400);
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO entries (id,date,start,end,duration_minutes,category,note,created_at) VALUES (?,?,?,?,?,?,?,?)")
    .bind(id, body.date, body.start, body.end, duration, body.category, body.note || "", new Date().toISOString())
    .run();
  return json({ id });
}

export async function updateEntry(request, env, id) {
  const body = await request.json().catch(() => ({}));
  if (!body.start || !body.end || !body.category) return json({ error: "invalid" }, 400);
  const duration = minutesBetween(body.start, body.end);
  if (duration <= 0) return json({ error: "invalid_range" }, 400);
  await env.DB.prepare("UPDATE entries SET start=?, end=?, duration_minutes=?, category=?, note=? WHERE id=?")
    .bind(body.start, body.end, duration, body.category, body.note || "", id)
    .run();
  return json({ ok: true });
}

export async function deleteEntry(env, id) {
  await env.DB.prepare("DELETE FROM entries WHERE id=?").bind(id).run();
  return json({ ok: true });
}

export async function createVacation(request, env) {
  const body = await request.json().catch(() => ({}));
  const from = body.from,
    to = body.to;
  if (!from || !to || to < from) return json({ error: "invalid_range" }, 400);
  const dates = [];
  const cur = new Date(from + "T00:00:00");
  const end = new Date(to + "T00:00:00");
  while (cur <= end && dates.length <= 60) {
    dates.push(toDateStr(cur));
    cur.setDate(cur.getDate() + 1);
  }
  if (dates.length > 60) return json({ error: "range_too_large" }, 400);

  const placeholders = dates.map(() => "?").join(",");
  const existing = await env.DB.prepare(`SELECT date FROM entries WHERE category='urlaub' AND date IN (${placeholders})`)
    .bind(...dates)
    .all();
  const existingDates = new Set(existing.results.map((r) => r.date));
  const newDates = dates.filter((d) => !existingDates.has(d));

  if (newDates.length) {
    const stmts = newDates.map((d) =>
      env.DB.prepare("INSERT INTO entries (id,date,start,end,duration_minutes,category,note,created_at) VALUES (?,?,?,?,?,?,?,?)").bind(
        crypto.randomUUID(),
        d,
        "00:00",
        "08:00",
        480,
        "urlaub",
        "Urlaub",
        new Date().toISOString()
      )
    );
    await env.DB.batch(stmts);
  }
  return json({ created: newDates.length });
}

// ---- approval requests (any authenticated user may write) ----

export async function listApprovalRequests(env) {
  const { results } = await env.DB.prepare("SELECT * FROM approval_requests ORDER BY requested_at DESC LIMIT 50").all();
  return json(results.map(rowToRequest));
}

export async function getApprovalRequest(env, weekKey) {
  const row = await env.DB.prepare("SELECT * FROM approval_requests WHERE week_key=?").bind(weekKey).first();
  return json(row ? rowToRequest(row) : null);
}

export async function setApprovalRequest(request, env, weekKey, session) {
  const body = await request.json().catch(() => ({}));
  if (!body.reason || !String(body.reason).trim()) return json({ error: "reason_required" }, 400);
  await env.DB.prepare(
    `INSERT INTO approval_requests (week_key, requested_by, reason, requested_at, week_total_minutes)
     VALUES (?,?,?,?,?)
     ON CONFLICT(week_key) DO UPDATE SET reason=excluded.reason, requested_at=excluded.requested_at, week_total_minutes=excluded.week_total_minutes`
  )
    .bind(weekKey, session.name, String(body.reason).trim(), new Date().toISOString(), body.weekTotalMinutes || 0)
    .run();
  return json({ ok: true });
}

export async function deleteApprovalRequest(env, weekKey) {
  await env.DB.prepare("DELETE FROM approval_requests WHERE week_key=?").bind(weekKey).run();
  return json({ ok: true });
}

// ---- approvals (admin only - enforced by the caller checking session.role) ----

export async function listApprovals(env) {
  const { results } = await env.DB.prepare("SELECT * FROM approvals ORDER BY approved_at DESC LIMIT 50").all();
  return json(results.map(rowToApproval));
}

export async function getApproval(env, weekKey) {
  const row = await env.DB.prepare("SELECT * FROM approvals WHERE week_key=?").bind(weekKey).first();
  return json(row ? rowToApproval(row) : null);
}

// Both admins can approve on either name's behalf (e.g. Daniel approving while
// marked absent, or Simon approving as the named stand-in) - the caller is
// already verified as an admin by the router, so the dropdown choice here is
// just a label, not an identity claim. Anything outside this fixed list falls
// back to the logged-in admin's own name.
const APPROVER_DISPLAY_NAMES = ["Daniel Satzinger", "Simon Demant (Vertretung)"];

export async function setApproval(request, env, weekKey, session) {
  const body = await request.json().catch(() => ({}));
  const approvedBy = APPROVER_DISPLAY_NAMES.includes(body.approvedBy) ? body.approvedBy : session.name;
  await env.DB.prepare(
    `INSERT INTO approvals (week_key, approved_by, approved_at, week_total_minutes)
     VALUES (?,?,?,?)
     ON CONFLICT(week_key) DO UPDATE SET approved_by=excluded.approved_by, approved_at=excluded.approved_at, week_total_minutes=excluded.week_total_minutes`
  )
    .bind(weekKey, approvedBy, new Date().toISOString(), body.weekTotalMinutes || 0)
    .run();
  await env.DB.prepare("DELETE FROM approval_requests WHERE week_key=?").bind(weekKey).run();
  return json({ ok: true });
}

export async function deleteApproval(env, weekKey) {
  await env.DB.prepare("DELETE FROM approvals WHERE week_key=?").bind(weekKey).run();
  return json({ ok: true });
}

// ---- config: absence / Vertretung (admin only for writes) ----

export async function getAbsence(env) {
  const row = await env.DB.prepare("SELECT value FROM config WHERE key='absence'").first();
  return json(row ? JSON.parse(row.value) : { active: false, reason: "", updatedAt: null });
}

export async function setAbsence(request, env, session) {
  const body = await request.json().catch(() => ({}));
  const value = { active: !!body.active, reason: body.reason || "", updatedAt: new Date().toISOString(), updatedBy: session.name };
  await env.DB.prepare(
    `INSERT INTO config (key, value) VALUES ('absence', ?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value`
  )
    .bind(JSON.stringify(value))
    .run();
  return json(value);
}
