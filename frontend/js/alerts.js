/* Alerts — live event logs, severity filters, and acknowledgment handling */
document.addEventListener("DOMContentLoaded", async () => {
  if (!initPageShell()) return;

  const tbody = document.querySelector("#alertsTable tbody");
  const searchInput = document.getElementById("alertSearch");
  const severityFilter = document.getElementById("severityFilter");
  const clearBtn = document.getElementById("clearAcknowledgedBtn");

  let alerts = [];

  async function loadAlerts() {
    try {
      // Assuming api.js supports listing alerts/incidents
      alerts = typeof api.listAlerts === "function" ? await api.listAlerts() : [];
      render();
    } catch (err) {
      toast(err.message || "Failed to load alerts log", "error");
    }
  }

  function render() {
    const query = (searchInput.value || "").toLowerCase().trim();
    const severity = severityFilter.value;

    const filtered = alerts.filter(a => {
      const matchQuery = !query || 
        (a.code && a.code.toLowerCase().includes(query)) ||
        (a.message && a.message.toLowerCase().includes(query)) ||
        (a.transformer_name && a.transformer_name.toLowerCase().includes(query));
      const matchSeverity = !severity || a.severity === severity;
      return matchQuery && matchSeverity;
    });

    if (!filtered.length) {
      setEmptyMessage(tbody, 6, "No alerts or incidents recorded.");
      return;
    }

    tbody.innerHTML = filtered.map(a => `
      <tr>
        <td>${fmtTime(a.timestamp)}</td>
        <td><strong>${escapeHtml(a.code || "—")}</strong></td>
        <td>
          <span class="badge ${a.severity === 'CRITICAL' ? 'badge-danger' : 'badge-warning'}">
            ${escapeHtml(a.severity)}
          </span>
        </td>
        <td>${escapeHtml(a.message)}</td>
        <td>${a.acknowledged ? '<span style="color:#16A34A;font-weight:500;">Acknowledged</span>' : '<span style="color:#DC2626;font-weight:600;">Active</span>'}</td>
        <td class="right">
          ${!a.acknowledged ? `<button class="btn-sm outline" data-acknowledge="${a.id}">Acknowledge</button>` : '—'}
        </td>
      </tr>
    `).join("");

    // Bind acknowledge buttons
    tbody.querySelectorAll("[data-acknowledge]").forEach(btn => {
      btn.addEventListener("click", async () => {
        try {
          if (typeof api.acknowledgeAlert === "function") {
            await api.acknowledgeAlert(btn.dataset.acknowledge);
          }
          toast("Alert acknowledged", "success");
          loadAlerts();
        } catch (ex) {
          toast(ex.message || "Failed to update alert", "error");
        }
      });
    });
  }

  searchInput.addEventListener("input", render);
  severityFilter.addEventListener("change", render);

  clearBtn.addEventListener("click", async () => {
    if (!confirm("Clear all acknowledged alerts from the view?")) return;
    try {
      if (typeof api.clearAcknowledgedAlerts === "function") {
        await api.clearAcknowledgedAlerts();
      }
      toast("Cleared acknowledged alerts", "success");
      loadAlerts();
    } catch (ex) {
      toast(ex.message || "Operation failed", "error");
    }
  });

  await loadAlerts();
});
