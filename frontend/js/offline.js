/* Offline sync — queue events locally while disconnected, push when back online */
document.addEventListener("DOMContentLoaded", async () => {
  if (!initPageShell()) return;

  const QUEUE_KEY = "is_offline_queue";
  const sel = document.getElementById("evTx");
  const form = document.getElementById("evForm");
  const tbody = document.querySelector("#queueTable tbody");
  const forceOffline = document.getElementById("forceOffline");
  const state = document.getElementById("netState");
  const syncBtn = document.getElementById("syncBtn");

  const loadQueue = () => { try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); } catch { return []; } };
  const saveQueue = (q) => localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "ev-" + Date.now() + "-" + Math.random().toString(16).slice(2));
  const isOffline = () => forceOffline.checked || !navigator.onLine;

  try {
    const list = await api.listTransformers();
    sel.innerHTML = `<option value="">— None —</option>` + list.map(t => `<option value="${t.id}">${escapeHtml(t.code)} — ${escapeHtml(t.name)}</option>`).join("");
  } catch (err) {
    toast(err.message || "Failed to load transformers", "error");
  }

  forceOffline.addEventListener("change", () => { renderState(); if (!isOffline()) sync(); });
  window.addEventListener("online", () => { renderState(); sync(); });
  window.addEventListener("offline", renderState);
  syncBtn.addEventListener("click", sync);
  document.getElementById("clearQueue").addEventListener("click", () => {
    if (!loadQueue().length) return;
    if (!confirm("Discard all queued events? They have not been sent to the server.")) return;
    saveQueue([]); renderQueue();
  });
  form.addEventListener("submit", onSubmit);

  renderState();
  renderQueue();

  function renderState() {
    const off = isOffline();
    state.className = "live " + (off ? "off" : "on");
    state.querySelector("span").textContent = off ? "Offline — events are queued on this device" : "Online — events sync immediately";
  }

  function renderQueue() {
    const q = loadQueue();
    document.getElementById("queueCount").textContent = q.length;
    syncBtn.disabled = !q.length;
    if (!q.length) { setEmptyMessage(tbody, 5, "Nothing waiting to sync."); return; }
    tbody.innerHTML = q.map(e => `
      <tr>
        <td>${escapeHtml(e.description)}</td>
        <td>${escapeHtml(e.event_type)}</td>
        <td>${severityPill(e.severity)}</td>
        <td>${fmtTime(e.client_timestamp)}</td>
        <td class="mono">${escapeHtml(e.client_event_id.slice(0, 8))}…</td>
      </tr>`).join("");
  }

  async function onSubmit(e) {
    e.preventDefault();
    const description = document.getElementById("evDesc").value.trim();
    if (!description) { document.getElementById("evError").textContent = "Describe what happened."; return; }
    document.getElementById("evError").textContent = "";

    const ev = {
      client_event_id: uuid(),
      transformer_id: sel.value ? Number(sel.value) : null,
      event_type: document.getElementById("evType").value,
      severity: document.getElementById("evSev").value,
      description,
      client_timestamp: new Date().toISOString(),
    };
    const q = loadQueue(); q.push(ev); saveQueue(q);
    form.reset();
    renderQueue();

    if (isOffline()) toast("Saved on this device. It will sync when you reconnect.", "warn");
    else await sync();
  }

  async function sync() {
    const q = loadQueue();
    if (!q.length || isOffline()) return;
    syncBtn.disabled = true;
    try {
      const res = await api.pushSync(q);
      saveQueue([]);
      toast(`Synced ${res.accepted} event(s)${res.skipped ? `, ${res.skipped} already on the server` : ""}.`, "success");
      refreshNotifications();
    } catch (err) {
      toast(err.message || "Sync failed — events kept for retry.", "error");
    } finally {
      renderQueue();
    }
  }
});
