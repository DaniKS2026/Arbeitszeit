import { readCookie, verifySession } from "./auth.js";
import {
  json,
  setupStatus,
  setupUser,
  login,
  logout,
  changePassword,
  listEntries,
  createEntry,
  updateEntry,
  deleteEntry,
  createVacation,
  listApprovalRequests,
  getApprovalRequest,
  setApprovalRequest,
  deleteApprovalRequest,
  listApprovals,
  getApproval,
  setApproval,
  deleteApproval,
  getAbsence,
  setAbsence
} from "./api.js";

async function getSession(request, env) {
  const token = readCookie(request, "session");
  if (!token) return null;
  return await verifySession(token, env.SESSION_SECRET);
}

async function handleApi(request, env, url) {
  const path = url.pathname;
  const method = request.method;

  // Public endpoints (no session required yet).
  if (path === "/api/setup-status" && method === "GET") return setupStatus(env);
  if (path === "/api/setup" && method === "POST") return setupUser(request, env);
  if (path === "/api/login" && method === "POST") return login(request, env);
  if (path === "/api/logout" && method === "POST") return logout();

  // Everything below requires a valid session.
  const session = await getSession(request, env);
  if (!session) return json({ error: "unauthorized" }, 401);

  if (path === "/api/me" && method === "GET") {
    return json({ email: session.email, name: session.name, role: session.role });
  }
  if (path === "/api/change-password" && method === "POST") return changePassword(request, env, session);

  if (path === "/api/entries" && method === "GET") return listEntries(env);
  if (path === "/api/entries" && method === "POST") return createEntry(request, env);
  const entryMatch = path.match(/^\/api\/entries\/([^/]+)$/);
  if (entryMatch && method === "PUT") return updateEntry(request, env, entryMatch[1]);
  if (entryMatch && method === "DELETE") return deleteEntry(env, entryMatch[1]);

  if (path === "/api/vacation" && method === "POST") return createVacation(request, env);

  if (path === "/api/approval-requests" && method === "GET") return listApprovalRequests(env);
  const reqMatch = path.match(/^\/api\/approval-requests\/([^/]+)$/);
  if (reqMatch && method === "GET") return getApprovalRequest(env, reqMatch[1]);
  if (reqMatch && method === "PUT") return setApprovalRequest(request, env, reqMatch[1], session);
  if (reqMatch && method === "DELETE") return deleteApprovalRequest(env, reqMatch[1]);

  if (path === "/api/approvals" && method === "GET") return listApprovals(env);
  const apprMatch = path.match(/^\/api\/approvals\/([^/]+)$/);
  if (apprMatch && method === "GET") return getApproval(env, apprMatch[1]);
  if (apprMatch && method === "PUT") {
    if (session.role !== "admin") return json({ error: "forbidden" }, 403);
    return setApproval(request, env, apprMatch[1], session);
  }
  if (apprMatch && method === "DELETE") {
    if (session.role !== "admin") return json({ error: "forbidden" }, 403);
    return deleteApproval(env, apprMatch[1]);
  }

  if (path === "/api/config/absence" && method === "GET") return getAbsence(env);
  if (path === "/api/config/absence" && method === "PUT") {
    if (session.role !== "admin") return json({ error: "forbidden" }, 403);
    return setAbsence(request, env, session);
  }

  return json({ error: "not_found" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(request, env, url);
      } catch (err) {
        return json({ error: "server_error", message: String((err && err.message) || err) }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  }
};
