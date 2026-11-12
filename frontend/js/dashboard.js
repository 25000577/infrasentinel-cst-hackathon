/* Dashboard — stat cards, infra table, activity table, charts */
document.addEventListener("DOMContentLoaded", async () => {
  if (!initPageShell()) return;

  const state = { severityChart: null, vibrationChart: null, tempChart: null };

  try {
    const [summary, infra, activity] = await Promise.all([
      api.summary(),
      api.infrastructure(),
      api.activity(),
    ]);

    renderStats(summary);
    renderInfra(infra);
    renderActivity(activity);
    renderCharts(infra, activity);
  } catch (err) {
    toast(err.message || "Failed to load dashboard", "error");
  }

  function renderStats(s) {
    const cards = [
      { label: "Total Transformers", value: s.total,    cls: "" },
      { label: "Online",             value: s.online,   cls: "green" },
      { label: "Offline",            value: s.offline,  cls: "grey" },
      { label: "Active Incidents",   value: s.incidents, cls: "orange" },
      { label: "Critical Alerts",    value: s.critical, cls: "red" },
    ];
    document.getElementById("statCards").innerHTML = cards.map(c => `
      <div class="stat-card ${c.cls}">
        <div class="stat-label">${escapeHtml(c.label)}</div>
        <div class="stat-value">${fmtNum(c.value, 0)}</div>
      </div>
    `).join("");
  }

  function renderInfra(rows) {
    const tbody = document.querySelector("#infraTable tbody");
    if (!rows || !rows.length) {
      setEmptyMessage(tbody, 7, "No transformers registered.");
      return;
    }
    tbody.innerHTML = rows.map(t => `
      <tr>
        <td><strong>${escapeHtml(t.code)}</strong></td>
        <td>${escapeHtml(t.name)}</td>
        <td>${escapeHtml(t.location)}</td>
        <td>${fmtNum(t.temperature, 1)}</td>
        <td>${fmtNum(t.vibration, 3)}</td>
        <td>${connectivityPill(t.status)}</td>
        <td>${healthPill(t.health)}</td>
      </tr>
    `).join("");
  }

  function renderActivity(events) {
    const tbody = document.querySelector("#activityTable tbody");
    if (!events || !events.length) {
      setEmptyMessage(tbody, 5, "No recent security activity.");
      return;
    }
    tbody.innerHTML = events.slice(0, 8).map(e => `
      <tr>
        <td>${escapeHtml(e.description)}</td>
        <td>${escapeHtml(e.transformer_code || e.transformer_id || "—")}</td>
        <td>${severityPill(e.severity)}</td>
        <td>${fmtTime(e.timestamp)}</td>
        <td>${statusPill(e.status)}</td>
      </tr>
    `).join("");
  }

  function renderCharts(infra, activity) {
    // Severity doughnut
    const sevCounts = { CRITICAL: 0, WARNING: 0, INFO: 0 };
    (activity || []).forEach(e => {
      const s = String(e.severity || "").toUpperCase();
      if (sevCounts[s] !== undefined) sevCounts[s]++;
    });
    const sevCtx = document.getElementById("severityChart");
    if (sevCtx) {
      state.severityChart = new Chart(sevCtx, {
        type: "doughnut",
        data: {
          labels: ["Critical", "Warning", "Info"],
          datasets: [{
            data: [sevCounts.CRITICAL, sevCounts.WARNING, sevCounts.INFO],
            backgroundColor: ["#DC2626", "#F59E0B", "#0054A6"],
            borderWidth: 0,
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: "bottom" } },
        },
      });
    }

    // Vibration + temp (sample across first transformer for overview)
    const sample = infra && infra.length ? infra[0] : null;
    if (!sample) return;

    api.getReadings(sample.id, 20).then(readings => {
      const labels = readings.map(r => new Date(r.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));

      const vibCtx = document.getElementById("vibrationChart");
      if (vibCtx) {
        state.vibrationChart = new Chart(vibCtx, {
          type: "line",
          data: {
            labels,
            datasets: [{
              label: `${sample.code} vibration`,
              data: readings.map(r => r.vibration),
              borderColor: "#0054A6",
              backgroundColor: "rgba(0, 84, 166, 0.08)",
              tension: 0.2, fill: true, pointRadius: 2,
            }],
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } },
          },
        });
      }

      const tCtx = document.getElementById("tempChart");
      if (tCtx) {
        state.tempChart = new Chart(tCtx, {
          type: "line",
          data: {
            labels,
            datasets: [{
              label: `${sample.code} temperature`,
              data: readings.map(r => r.temperature),
              borderColor: "#F59E0B",
              backgroundColor: "rgba(245, 158, 11, 0.10)",
              tension: 0.2, fill: true, pointRadius: 2,
            }],
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: false } },
          },
        });
      }
    }).catch(() => {});
  }
});