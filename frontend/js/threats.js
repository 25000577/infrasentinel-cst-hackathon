/* Threats — event listing with filters */
document.addEventListener("DOMContentLoaded", async () => {
  if (!initPageShell()) return;

  const tbody = document.querySelector("#threatTable tbody");

  document.getElementById("refreshBtn").addEventListener("click", load);
  document.getElementById("sevFilter").addEventListener("change", load);
  document.getElementById("statusFilter").addEventListener("change", load);

  await load();

  function actions(e) {
    if (e.status === "RESOLVED") return "";
    const next = e.status === "OPEN"
      ? `<button class="btn btn-ghost" data-id="${e.id}" data-set="INVESTIGATING">Investigate</button>`
      : "";
    return next + `<button class="btn btn-ghost" data-id="${e.id}" data-set="RESOLVED">Resolve</button>`;
  }

  async function setStatus(id, status) {
    try {
      await api.updateEventStatus(id, status);
      toast("Event marked " + status.toLowerCase() + ".", "success");
      await load();
      refreshNotifications();
    } catch (err) {
      toast(err.message || "Update failed", "error");
    }
  }

  async function load() {
    const params = {};
    const sev = document.getElementById("sevFilter").value;
    const st  = document.getElementById("statusFilter").value;
    if (sev) params.severity = sev;
    if (st)  params.status   = st;

    try {
      const events = await api.listEvents(params);
      if (!events || !events.length) {
        setEmptyMessage(tbody, 7, "No threats match the current filter.");
        return;
      }
      tbody.innerHTML = events.map(e => `
        <tr>
          <td>${escapeHtml(e.description)}</td>
          <td>${escapeHtml(e.transformer_code || e.transformer_id || "—")}</td>
          <td>${escapeHtml(e.event_type || "—")}</td>
          <td>${severityPill(e.severity)}</td>
          <td>${fmtTime(e.timestamp)}</td>
          <td>${statusPill(e.status)}</td>
          <td>${actions(e)}</td>
        </tr>
      `).join("");
      tbody.querySelectorAll("button[data-set]").forEach(btn => {
        btn.addEventListener("click", () => setStatus(Number(btn.dataset.id), btn.dataset.set));
      });
    } catch (err) {
      toast(err.message || "Failed to load threats", "error");
    }
  }
});