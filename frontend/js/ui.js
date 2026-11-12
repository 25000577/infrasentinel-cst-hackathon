/* ==========================================================================
   InfraSentinel — Shared UI utilities (ui.js)
   Requires: api.js (window.api, window.getToken, window.getStoredUser,
                      window.logoutLocal)
   Provides: initPageShell, requireAuth, renderNav, renderProfile,
             toast, formatting helpers, status pills, escapeHtml
   ========================================================================== */

/* ---------- Navigation definition (single source of truth) ---------- */
const ICONS = {
  dashboard:    '<path d="M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z"/>',
  transformers: '<path d="M4 7h16M4 12h16M4 17h16M7 4v16M17 4v16"/>',
  monitoring:   '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  threats:      '<path d="M12 3l9 16H3zM12 10v4M12 17h.01"/>',
  simulation:   '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/>',
  audit:        '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4"/>',
  incidents:    '<path d="M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7"/>',
  reports:      '<path d="M4 20V4M4 20h16M8 16v-5M13 16V8M18 16v-3"/>',
  map:          '<path d="M12 21s7-6 7-11a7 7 0 0 0-14 0c0 5 7 11 7 11zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>',
  offline:      '<path d="M2 8a15 15 0 0 1 20 0M5 12a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0M12 19h.01M3 3l18 18"/>',
  settings:     '<path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
};

const NAV_ITEMS = [
  { key: "dashboard",    label: "Dashboard",        href: "dashboard.html" },
  { key: "transformers", label: "Transformers",     href: "transformers.html" },
  { key: "monitoring",   label: "Monitoring",       href: "monitoring.html" },
  { key: "threats",      label: "Threat Detection", href: "threats.html" },
  { key: "simulation",   label: "Simulation Lab",   href: "simulation.html" },
  { key: "audit",        label: "Audit Trail",      href: "audit.html" },
  { key: "incidents",    label: "Incidents",        href: "incidents.html" },
  { key: "reports",      label: "Reports",          href: "reports.html" },
  { key: "map",          label: "Map",              href: "map.html" },
  { key: "offline",      label: "Offline Sync",     href: "offline.html" },
  { key: "settings",     label: "Settings",         href: "settings.html" },
];

function icon(key) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[key] || ""}</svg>`;
}

/* ==========================================================================
   Auth guard
   ========================================================================== */
function requireAuth() {
  const token = window.getToken && window.getToken();
  if (!token) {
    location.href = "index.html";
    return false;
  }
  return true;
}

/* ==========================================================================
   App shell — sidebar + topbar are injected so every page stays in sync.
   Each page only needs:  <div id="app-shell"></div>  and  <main class="page">
   ========================================================================== */
function renderShell() {
  const page = document.querySelector("main.page");
  if (!page || document.getElementById("sidebar")) return;

  const side = document.createElement("aside");
  side.className = "sidebar";
  side.id = "sidebar";
  side.innerHTML = `
    <div class="sidebar-brand">
      <div class="brand-mark">IS</div>
      <div><strong>InfraSentinel</strong><span>Grid security platform</span></div>
    </div>
    <nav class="nav" id="mainnav" aria-label="Main"></nav>
    <div class="sidebar-foot">University of Venda<br>CyberSecureTech Hackathon</div>`;

  const main = document.createElement("div");
  main.className = "main";
  main.innerHTML = `
    <header class="topbar">
      <button class="menu-btn" id="menuBtn" aria-label="Open menu">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
      </button>
      <div class="search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
        <input id="globalSearch" type="search" placeholder="Search transformers…" aria-label="Search transformers" />
      </div>
      <div class="topbar-spacer"></div>
      <button class="icon-btn" id="notifBtn" aria-label="Critical alerts">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M13.7 20a2 2 0 0 1-3.4 0"/></svg>
        <span class="badge" id="notifCount">0</span>
      </button>
      <div class="profile">
        <button class="avatar" id="avatar" aria-label="Account menu">IS</button>
        <div class="dropdown" id="profileDropdown">
          <div class="pm-head" id="pmHead"></div>
          <a href="settings.html">Settings</a>
          <button id="logoutBtn">Sign out</button>
        </div>
      </div>
    </header>`;

  page.parentNode.insertBefore(side, page);
  page.parentNode.insertBefore(main, page);
  main.appendChild(page);
  const foot = document.createElement("footer");
  foot.className = "footer";
  foot.textContent = "InfraSentinel · Cyber-physical security for power infrastructure";
  main.appendChild(foot);

  const menuBtn = document.getElementById("menuBtn");
  menuBtn.addEventListener("click", (e) => { e.stopPropagation(); document.body.classList.toggle("nav-open"); });
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#sidebar")) document.body.classList.remove("nav-open");
  });
}

function renderNav() {
  const nav = document.getElementById("mainnav");
  if (!nav) return;
  const active = document.body.dataset.page || "";
  nav.innerHTML = NAV_ITEMS.map(
    (i) =>
      `<a href="${i.href}" class="${i.key === active ? "active" : ""}"${i.key === active ? ' aria-current="page"' : ""}>${icon(i.key)}${i.label}</a>`
  ).join("");
}

/* ==========================================================================
   Profile menu + logout
   ========================================================================== */
function renderProfile() {
  const user = (window.getStoredUser && window.getStoredUser()) || {};

  const initials =
    (user.name || "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0].toUpperCase())
      .join("") || "IS";

  const avatar = document.getElementById("avatar");
  if (avatar) avatar.textContent = initials;

  const pmHead = document.getElementById("pmHead");
  if (pmHead) {
    pmHead.innerHTML =
      `<strong>${escapeHtml(user.name || "Operator")}</strong>` +
      `${escapeHtml(user.email || "")}<br>` +
      `${escapeHtml(((user.role || "")[0] || "").toUpperCase() + (user.role || "").slice(1))}`;
  }

  // Toggle dropdown
  const dropdown = document.getElementById("profileDropdown");
  if (avatar && dropdown) {
    avatar.addEventListener("click", (e) => {
      e.stopPropagation();
      dropdown.classList.toggle("open");
    });
    document.addEventListener("click", () => dropdown.classList.remove("open"));
  }

  // Wire both logout buttons (topbar + settings page)
  ["logoutBtn", "logoutBtn2"].forEach((id) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener("click", async () => {
      try {
        await window.api.logout();
      } catch (_) {
        /* ignore — we still log out locally */
      }
      window.logoutLocal();
      location.href = "index.html";
    });
  });
}

/* ==========================================================================
   Notification count (open CRITICAL events)
   ========================================================================== */
async function refreshNotifications() {
  const el = document.getElementById("notifCount");
  if (!el || !window.api) return;
  try {
    const events = await window.api.listEvents({ severity: "CRITICAL" });
    const open = (events || []).filter((e) => e.status !== "RESOLVED").length;
    el.textContent = String(open);
    el.style.display = open > 0 ? "inline-flex" : "none";
  } catch (_) {
    el.style.display = "none";
  }
}

/* ==========================================================================
   Page bootstrap — call at the top of every page script
   ========================================================================== */
function initPageShell() {
  if (!requireAuth()) return false;
  renderShell();
  renderNav();
  renderProfile();
  refreshNotifications();
  wireGlobalControls();
  return true;
}

/* ==========================================================================
   Global controls (search box + notification icon)
   ========================================================================== */
function wireGlobalControls() {
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") document.querySelectorAll(".modal-backdrop:not([hidden])").forEach((m) => (m.hidden = true));
  });

  const search = document.getElementById("globalSearch");
  if (search && !search.dataset.wired) {
    search.dataset.wired = "1";
    search.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const q = search.value.trim();
        location.href = "transformers.html" + (q ? "?q=" + encodeURIComponent(q) : "");
      }
    });
  }

  const notif = document.getElementById("notifBtn");
  if (notif && !notif.dataset.wired) {
    notif.dataset.wired = "1";
    notif.addEventListener("click", () => (location.href = "threats.html"));
  }
}

/* ==========================================================================
   Formatting helpers
   ========================================================================== */
function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function fmtNum(v, digits = 2) {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return n.toFixed(digits);
}

function timeAgo(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

/* ==========================================================================
   Status pill helpers — return HTML strings
   ========================================================================== */
function severityPill(sev) {
  const s = String(sev || "").toUpperCase();
  if (s === "CRITICAL") return `<span class="pill pill-danger">Critical</span>`;
  if (s === "WARNING")  return `<span class="pill pill-warn">Warning</span>`;
  if (s === "INFO")     return `<span class="pill pill-info">Info</span>`;
  return `<span class="pill pill-grey">${escapeHtml(sev || "—")}</span>`;
}

function statusPill(status) {
  const s = String(status || "").toUpperCase();
  switch (s) {
    case "ONLINE":        return `<span class="pill pill-success">Online</span>`;
    case "OFFLINE":       return `<span class="pill pill-grey">Offline</span>`;
    case "OPEN":          return `<span class="pill pill-danger">Open</span>`;
    case "INVESTIGATING": return `<span class="pill pill-warn">Investigating</span>`;
    case "RESOLVED":      return `<span class="pill pill-success">Resolved</span>`;
    case "NORMAL":        return `<span class="pill pill-success">Normal</span>`;
    case "WARNING":       return `<span class="pill pill-warn">Warning</span>`;
    case "CRITICAL":      return `<span class="pill pill-danger">Critical</span>`;
    default:
      return `<span class="pill pill-grey">${escapeHtml(status || "—")}</span>`;
  }
}

function healthPill(h) {
  return statusPill(h);
}

function connectivityPill(status) {
  const s = String(status || "").toUpperCase();
  if (s === "ONLINE") return `<span class="pill pill-success">Connected</span>`;
  return `<span class="pill pill-grey">Disconnected</span>`;
}

/* ==========================================================================
   Toast notifications (non-animated, auto-hide)
   ========================================================================== */
function toast(message, type = "info") {
  let box = document.getElementById("is-toast-container");
  if (!box) {
    box = document.createElement("div");
    box.id = "is-toast-container";
    box.style.cssText =
      "position:fixed;right:20px;bottom:20px;z-index:200;" +
      "display:flex;flex-direction:column;gap:8px;pointer-events:none;";
    document.body.appendChild(box);
  }
  const el = document.createElement("div");
  const bg =
    type === "error"   ? "#DC2626"
    : type === "success" ? "#16A34A"
    : type === "warn"    ? "#F59E0B"
    : "#0054A6";
  el.style.cssText =
    `background:${bg};color:#fff;padding:10px 14px;border-radius:6px;` +
    "font-size:13px;font-weight:500;box-shadow:0 4px 14px rgba(16,24,40,.18);" +
    "max-width:360px;pointer-events:auto;";
  el.textContent = message;
  box.appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

/* ==========================================================================
   Small DOM helpers used by page scripts
   ========================================================================== */
function $(sel, root = document) {
  return root.querySelector(sel);
}
function $$(sel, root = document) {
  return Array.from(root.querySelectorAll(sel));
}

function setEmptyMessage(tbody, colSpan, message) {
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="${colSpan}" class="muted" style="text-align:center;padding:24px;">${escapeHtml(
    message
  )}</td></tr>`;
}

function showModal(id) {
  const el = document.getElementById(id);
  if (el) el.hidden = false;
}

function hideModal(id) {
  const el = document.getElementById(id);
  if (el) el.hidden = true;
}

/* ==========================================================================
   Expose everything to window (page scripts use globals)
   ========================================================================== */
window.NAV_ITEMS           = NAV_ITEMS;
window.requireAuth         = requireAuth;
window.renderShell         = renderShell;
window.icon                = icon;
window.renderNav           = renderNav;
window.renderProfile       = renderProfile;
window.refreshNotifications = refreshNotifications;
window.initPageShell       = initPageShell;

window.escapeHtml          = escapeHtml;
window.fmtTime             = fmtTime;
window.fmtDate             = fmtDate;
window.fmtNum              = fmtNum;
window.timeAgo             = timeAgo;

window.severityPill        = severityPill;
window.statusPill          = statusPill;
window.healthPill          = healthPill;
window.connectivityPill    = connectivityPill;

window.toast               = toast;
window.$                   = $;
window.$$                  = $$;
window.setEmptyMessage     = setEmptyMessage;
window.showModal           = showModal;
window.hideModal           = hideModal;