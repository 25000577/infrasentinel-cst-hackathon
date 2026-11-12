/* ==========================================================================
   InfraSentinel — API client
   - Handles bearer token auth
   - Small fetch wrapper with error handling
   - All endpoints of the Express backend
   ========================================================================== */

/* Where is the backend?
   - Normally the same origin that served this page (works on Render, Railway,
     Heroku, a VPS, or localhost:8000 — no configuration needed).
   - Override with  ?api=https://my-backend.example.com  or window.API_BASE.
   - Opened straight from disk (file://) → fall back to localhost:8000. */
function detectApiBase() {
  const qs = new URLSearchParams(location.search);
  if (qs.get("api")) {
    const v = qs.get("api").replace(/\/$/, "");
    try { sessionStorage.setItem("is_api_base", v); } catch (_) {}
    return v;
  }
  if (window.API_BASE) return String(window.API_BASE).replace(/\/$/, "");
  try {
    const saved = sessionStorage.getItem("is_api_base");
    if (saved) return saved;
  } catch (_) {}
  if (location.protocol === "http:" || location.protocol === "https:") return location.origin;
  return "http://localhost:8000";
}
const API_BASE = detectApiBase();

/* The login page stores the session in localStorage ("Remember me") or
   sessionStorage (otherwise) — read from both. */
const STORE_KEYS = { token: "is_token", user: "is_user" };

function getToken() {
  return localStorage.getItem(STORE_KEYS.token) || sessionStorage.getItem(STORE_KEYS.token) || null;
}

function getStoredUser() {
  try {
    const raw = localStorage.getItem(STORE_KEYS.user) || sessionStorage.getItem(STORE_KEYS.user);
    return JSON.parse(raw || "null");
  } catch {
    return null;
  }
}

function logoutLocal() {
  [localStorage, sessionStorage].forEach((s) => {
    s.removeItem(STORE_KEYS.token);
    s.removeItem(STORE_KEYS.user);
  });
}

async function request(path, { method = "GET", body, auth = true, headers = {} } = {}) {
  const h = { Accept: "application/json", ...headers };
  if (body !== undefined) h["Content-Type"] = "application/json";
  if (auth) {
    const t = getToken();
    if (t) h["Authorization"] = "Bearer " + t;
  }

  let res;
  try {
    res = await fetch(API_BASE + path, {
      method,
      headers: h,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    const err = new Error("Network error: cannot reach the server.");
    err.status = 0;
    throw err;
  }

  if (res.status === 401 && auth) {
    // Session expired / invalid → redirect to login once
    logoutLocal();
    if (!/(^|\/)(index\.html)?$/.test(location.pathname)) {
      location.href = "index.html";
    }
    throw Object.assign(new Error("Session expired. Please sign in again."), { status: 401 });
  }

  let data = null;
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }

  if (!res.ok) {
    const msg =
      (data && (data.detail || data.message)) ||
      (typeof data === "string" ? data : "") ||
      `Request failed (${res.status})`;
    throw Object.assign(new Error(msg), { status: res.status, data });
  }
  return data;
}

const api = {
  // auth
  login: (email, password) =>
    request("/api/auth/login", { method: "POST", auth: false, body: { email, password } }),
  logout: () => request("/api/auth/logout", { method: "POST" }).catch(() => null),
  me: () => request("/api/auth/me"),

  // dashboard
  summary: () => request("/api/dashboard/summary"),
  infrastructure: () => request("/api/dashboard/infrastructure"),
  activity: () => request("/api/dashboard/activity"),

  // transformers
  listTransformers: () => request("/api/transformers"),
  getTransformer: (id) => request(`/api/transformers/${id}`),
  createTransformer: (body) => request("/api/transformers", { method: "POST", body }),
  updateTransformer: (id, body) =>
    request(`/api/transformers/${id}`, { method: "PUT", body }),
  deleteTransformer: (id) => request(`/api/transformers/${id}`, { method: "DELETE" }),

  // monitoring
  getReadings: (id, limit = 60) =>
    request(`/api/transformers/${id}/readings?limit=${limit}`),
  addReading: (id, body) =>
    request(`/api/transformers/${id}/readings`, { method: "POST", body }),

  // events / threats
  listEvents: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request("/api/events" + (q ? "?" + q : ""));
  },
  updateEventStatus: (id, status) =>
    request(`/api/events/${id}`, { method: "PATCH", body: { status } }),

  // incidents
  listIncidents: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request("/api/incidents" + (q ? "?" + q : ""));
  },
  updateIncident: (id, body) =>
    request(`/api/incidents/${id}`, { method: "PATCH", body }),

  // simulation
  simTamper: (transformer_id) =>
    request("/api/sim/tamper", { method: "POST", body: { transformer_id } }),
  simOverheat: (transformer_id) =>
    request("/api/sim/overheat", { method: "POST", body: { transformer_id } }),
  simDisconnect: (transformer_id) =>
    request("/api/sim/disconnect", { method: "POST", body: { transformer_id } }),
  simRestore: (transformer_id) =>
    request("/api/sim/restore", { method: "POST", body: { transformer_id } }),
  simUnauthorised: (transformer_id) =>
    request("/api/sim/unauthorised", { method: "POST", body: { transformer_id } }),

  // sync (offline queue)
  pushSync: (events) =>
    request("/api/sync", { method: "POST", body: { events } }),

  // audit
  listAudit: () => request("/api/audit"),
  verifyAudit: () => request("/api/audit/verify"),
  runTamperTest: () => request("/api/audit/tamper-test", { method: "POST" }),

  // reports
  reportSummary: (from, to) => {
    const q = new URLSearchParams();
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    return request("/api/reports/summary" + (q.toString() ? "?" + q : ""));
  },
  /* The CSV endpoint needs the bearer token, so a plain link cannot be used —
     fetch it and hand the browser a Blob to download. */
  downloadEventsCsv: async () => {
    const res = await fetch(API_BASE + "/api/reports/export.csv", {
      headers: { Authorization: "Bearer " + getToken() },
    });
    if (!res.ok) throw new Error("Export failed (" + res.status + ")");
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "infrasentinel_events.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },

  // settings
  getSettings: () => request("/api/settings"),
  saveSettings: (body) => request("/api/settings", { method: "PUT", body }),
};

// export to window so plain <script> tags can use it
window.api = api;
window.getToken = getToken;
window.API_BASE_URL = API_BASE;
window.getStoredUser = getStoredUser;
window.logoutLocal = logoutLocal;