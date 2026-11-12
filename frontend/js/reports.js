/* Reports — summary + charts + export */
document.addEventListener("DOMContentLoaded", async () => {
  if (!initPageShell()) return;

  const from = document.getElementById("fromDate");
  const to   = document.getElementById("toDate");
  const tbody = document.querySelector("#repTable tbody");

  document.getElementById("exportCsv").addEventListener("click", exportCsv);
  document.getElementById("applyBtn").addEventListener("click", load);
  document.getElementById("clearBtn").addEventListener("click", () => { from.value = ""; to.value = ""; load(); });
  let healthChart = null, sevChart = null;
  document.getElementById("exportPdf").addEventListener("click", () => window.print());

  await load();

  async function load() {
    try {
      const s = await api.reportSummary(from.value || undefined, to.value || undefined);
      tbody.innerHTML = `
        <tr><td>Total transformers</td><td>${s.total ?? "—"}</td></tr>
        <tr><td>Online</td><td>${s.online ?? "—"}</td></tr>
        <tr><td>Offline periods</td><td>${s.offline_events ?? "—"}</td></tr>
        <tr><td>Security incidents</td><td>${s.incidents ?? "—"}</td></tr>
        <tr><td>Voltage anomalies</td><td>${s.voltage_anomalies ?? "—"}</td></tr>
        <tr><td>Current warnings</td><td>${s.current_warnings ?? "—"}</td></tr>
        <tr><td>Auth failures</td><td>${s.auth_failures ?? "—"}</td></tr>
        <tr><td>Audit verification</td><td>${escapeHtml(s.audit_status || "—")}</td></tr>
      `;

      // Health pie
      const healthCtx = document.getElementById("healthChart");
      if (healthChart) healthChart.destroy();
      healthChart = new Chart(healthCtx, {
        type: "doughnut",
        data: {
          labels: ["Online", "Offline"],
          datasets: [{
            data: [s.online || 0, (s.offline ?? (s.total - s.online)) || 0],
            backgroundColor: ["#16A34A", "#94A3B8"],
            borderWidth: 0,
          }],
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } } },
      });

      // Severity bar
      const sevCtx = document.getElementById("repSevChart");
      if (sevChart) sevChart.destroy();
      sevChart = new Chart(sevCtx, {
        type: "bar",
        data: {
          labels: ["Critical", "Warning", "Info"],
          datasets: [{
            label: "Events",
            data: [s.critical_events || 0, s.warning_events || 0, s.info_events || 0],
            backgroundColor: ["#DC2626", "#F59E0B", "#0054A6"],
            borderRadius: 4,
          }],
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
      });
    } catch (err) {
      toast(err.message || "Failed to load report", "error");
    }
  }

  async function exportCsv() {
    try { await api.downloadEventsCsv(); toast("CSV downloaded.", "success"); }
    catch (err) { toast(err.message || "Export failed", "error"); }
  }
});
