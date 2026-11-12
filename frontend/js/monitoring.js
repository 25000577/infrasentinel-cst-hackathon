/* Monitoring — live readings for one transformer, with thresholds */
document.addEventListener("DOMContentLoaded", async () => {
  if (!initPageShell()) return;

  const sel = document.getElementById("txSelect");
  const feed = document.getElementById("feedToggle");
  const live = document.getElementById("liveState");
  const form = document.getElementById("readingForm");
  const tbody = document.querySelector("#readTable tbody");

  let transformers = [];
  let current = null;
  let interval = 5;
  let timer = null;
  let voltageChart = null, currentChart = null;

  try {
    const [list, settings] = await Promise.all([api.listTransformers(), api.getSettings().catch(() => ({}))]);
    transformers = list;
    interval = Math.max(2, Number(settings.polling_interval) || 5);
  } catch (err) {
    toast(err.message || "Failed to load transformers", "error");
    return;
  }

  if (!transformers.length) {
    document.getElementById("monBody").innerHTML =
      `<div class="card"><div class="empty-note">No transformers registered yet. <a href="transformers.html">Register one</a> to start monitoring.</div></div>`;
    return;
  }

  // Populate dropdown with string-safe IDs
  sel.innerHTML = transformers.map(t => `<option value="${String(t.id)}">${escapeHtml(t.code)} — ${escapeHtml(t.name)}</option>`).join("");
  
  const urlParamId = new URLSearchParams(location.search).get("id");
  const matchingTransformer = transformers.find(t => String(t.id) === String(urlParamId));
  sel.value = matchingTransformer ? String(matchingTransformer.id) : String(transformers[0].id);
  
  document.getElementById("pollInfo").textContent = `Refreshes every ${interval}s`;

  sel.addEventListener("change", () => { 
    history.replaceState(null, "", "?id=" + sel.value); 
    refresh(true); 
  });
  
  feed.addEventListener("change", () => toast(feed.checked ? "Simulated multimeter feed started." : "Simulated multimeter feed stopped.", "info"));
  form.addEventListener("submit", onManualReading);

  await refresh(true);
  timer = setInterval(tick, interval * 1000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(false); });

  async function tick() {
    if (document.hidden) return;
    if (feed.checked && current && current.status === "ONLINE") {
      const voltage = 230 + (Math.random() * 6 - 3);
      const currentVal = (current.baseline_current || 45) + (Math.random() * 4 - 2);
      try { await api.addReading(current.id, { voltage: +voltage.toFixed(1), current: +currentVal.toFixed(2) }); } catch (_) {}
    }
    refresh(false);
  }

  async function refresh(full) {
    const id = sel.value; // Keep as string for safe comparison
    try {
      const [t, readings] = await Promise.all([api.getTransformer(id), api.getReadings(id, 60)]);
      current = t;
      renderStats(t, readings);
      renderCharts(t, readings, full);
      renderTable(readings);
      live.className = "live " + (t.status === "ONLINE" ? "on" : "off");
      live.querySelector("span").textContent = t.status === "ONLINE" ? "Live" : "Device offline";
    } catch (err) {
      live.className = "live off";
      live.querySelector("span").textContent = "Connection lost";
      if (full) toast(err.message || "Failed to load readings", "error");
    }
  }

  function renderStats(t, readings) {
    const last = readings[readings.length - 1];
    document.getElementById("mVoltage").textContent = last ? fmtNum(last.voltage, 1) + " V" : "—";
    document.getElementById("mVoltageSub").textContent = `Nominal ${fmtNum(t.nominal_voltage || 230, 0)} V`;
    document.getElementById("mCurrent").textContent = last ? fmtNum(last.current, 2) + " A" : "—";
    document.getElementById("mCurrentSub").textContent = `Warn ${fmtNum(t.warn_threshold, 1)} · Critical ${fmtNum(t.crit_threshold, 1)}`;
    document.getElementById("mHealth").innerHTML = healthPill(t.health);
    document.getElementById("mStatus").innerHTML = connectivityPill(t.status);
    document.getElementById("mSeen").textContent = timeAgo(t.last_seen);
    document.getElementById("mSeenSub").textContent = fmtTime(t.last_seen);
  }

  function renderCharts(t, readings, full) {
    const labels = readings.map(r => new Date(r.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    const flat = (v) => readings.map(() => v);

    const voltageData = [
      { label: "Voltage (V)", data: readings.map(r => r.voltage), borderColor: "#0054A6", backgroundColor: "rgba(0,84,166,.08)", fill: true, tension: .25, pointRadius: 1.5, borderWidth: 2 },
      { label: "Warning", data: flat(t.warn_threshold || 250), borderColor: "#D97706", borderDash: [6, 4], pointRadius: 0, borderWidth: 1.5 },
      { label: "Critical", data: flat(t.crit_threshold || 265), borderColor: "#DC2626", borderDash: [6, 4], pointRadius: 0, borderWidth: 1.5 },
    ];
    const currentData = [
      { label: "Current (A)", data: readings.map(r => r.current), borderColor: "#D97706", backgroundColor: "rgba(217,119,6,.10)", fill: true, tension: .25, pointRadius: 1.5, borderWidth: 2 },
      { label: "Limit", data: flat(t.max_current || 100), borderColor: "#DC2626", borderDash: [6, 4], pointRadius: 0, borderWidth: 1.5 },
    ];

    if (full && voltageChart) { voltageChart.destroy(); voltageChart = null; }
    if (full && currentChart) { currentChart.destroy(); currentChart = null; }

    const opts = (begin) => ({
      responsive: true, maintainAspectRatio: false, animation: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { position: "bottom", labels: { boxWidth: 12, usePointStyle: true } } },
      scales: { y: { beginAtZero: begin }, x: { ticks: { maxTicksLimit: 8 } } },
    });

    if (!voltageChart) voltageChart = new Chart(document.getElementById("voltageChart"), { type: "line", data: { labels, datasets: voltageData }, options: opts(false) });
    else { voltageChart.data.labels = labels; voltageChart.data.datasets = voltageData; voltageChart.update(); }

    if (!currentChart) currentChart = new Chart(document.getElementById("currentChart"), { type: "line", data: { labels, datasets: currentData }, options: opts(true) });
    else { currentChart.data.labels = labels; currentChart.data.datasets = currentData; currentChart.update(); }
  }

  function renderTable(readings) {
    if (!readings.length) { setEmptyMessage(tbody, 3, "No readings recorded yet."); return; }
    tbody.innerHTML = readings.slice(-10).reverse().map(r => `
      <tr>
        <td>${fmtTime(r.timestamp)}</td>
        <td class="num">${fmtNum(r.voltage, 1)}</td>
        <td class="num">${fmtNum(r.current, 2)}</td>
      </tr>`).join("");
  }

  async function onManualReading(e) {
    e.preventDefault();
    const err = document.getElementById("readingError");
    err.textContent = "";
    const voltage = parseFloat(document.getElementById("rVoltage").value);
    const currentVal = parseFloat(document.getElementById("rCurrent").value);
    if (Number.isNaN(voltage) || Number.isNaN(currentVal)) {
      err.textContent = "Enter both a voltage and a current value.";
      return;
    }
    try {
      const res = await api.addReading(sel.value, { voltage, current: currentVal });
      const bad = res.classification !== "NORMAL" || res.current_classification !== "NORMAL";
      toast(bad ? `Reading recorded — ${res.classification.toLowerCase()} voltage, ${res.current_classification.toLowerCase()} current.` : "Reading recorded — all normal.", bad ? "warn" : "success");
      form.reset();
      refresh(false);
      refreshNotifications();
    } catch (ex) {
      err.textContent = ex.message || "Could not save reading.";
    }
  }
});
