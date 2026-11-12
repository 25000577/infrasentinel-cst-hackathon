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
  let vibChart = null, tempChart = null;

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

  sel.innerHTML = transformers.map(t => `<option value="${t.id}">${escapeHtml(t.code)} — ${escapeHtml(t.name)}</option>`).join("");
  const wanted = Number(new URLSearchParams(location.search).get("id"));
  sel.value = transformers.some(t => t.id === wanted) ? String(wanted) : String(transformers[0].id);
  document.getElementById("pollInfo").textContent = `Refreshes every ${interval}s`;

  sel.addEventListener("change", () => { history.replaceState(null, "", "?id=" + sel.value); refresh(true); });
  feed.addEventListener("change", () => toast(feed.checked ? "Simulated sensor feed started." : "Simulated sensor feed stopped.", "info"));
  form.addEventListener("submit", onManualReading);

  await refresh(true);
  timer = setInterval(tick, interval * 1000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(false); });

  async function tick() {
    if (document.hidden) return;
    if (feed.checked && current && current.status === "ONLINE") {
      const temp = 55 + (Math.random() * 6 - 3);
      const vib = current.baseline_vibration + (Math.random() * 0.2 - 0.1);
      try { await api.addReading(current.id, { temperature: +temp.toFixed(2), vibration: +vib.toFixed(3) }); } catch (_) {}
    }
    refresh(false);
  }

  async function refresh(full) {
    const id = Number(sel.value);
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
    document.getElementById("mTemp").textContent = last ? fmtNum(last.temperature, 1) + " °C" : "—";
    document.getElementById("mTempSub").textContent = `Limit ${fmtNum(t.max_temp, 0)} °C`;
    document.getElementById("mVib").textContent = last ? fmtNum(last.vibration, 3) : "—";
    document.getElementById("mVibSub").textContent = `Warn ${fmtNum(t.warn_threshold, 1)} · Critical ${fmtNum(t.crit_threshold, 1)}`;
    document.getElementById("mHealth").innerHTML = healthPill(t.health);
    document.getElementById("mStatus").innerHTML = connectivityPill(t.status);
    document.getElementById("mSeen").textContent = timeAgo(t.last_seen);
    document.getElementById("mSeenSub").textContent = fmtTime(t.last_seen);
  }

  function renderCharts(t, readings, full) {
    const labels = readings.map(r => new Date(r.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    const flat = (v) => readings.map(() => v);

    const vibData = [
      { label: "Vibration", data: readings.map(r => r.vibration), borderColor: "#0054A6", backgroundColor: "rgba(0,84,166,.08)", fill: true, tension: .25, pointRadius: 1.5, borderWidth: 2 },
      { label: "Warning", data: flat(t.warn_threshold), borderColor: "#D97706", borderDash: [6, 4], pointRadius: 0, borderWidth: 1.5 },
      { label: "Critical", data: flat(t.crit_threshold), borderColor: "#DC2626", borderDash: [6, 4], pointRadius: 0, borderWidth: 1.5 },
    ];
    const tempData = [
      { label: "Temperature (°C)", data: readings.map(r => r.temperature), borderColor: "#D97706", backgroundColor: "rgba(217,119,6,.10)", fill: true, tension: .25, pointRadius: 1.5, borderWidth: 2 },
      { label: "Limit", data: flat(t.max_temp), borderColor: "#DC2626", borderDash: [6, 4], pointRadius: 0, borderWidth: 1.5 },
    ];

    if (full && vibChart) { vibChart.destroy(); vibChart = null; }
    if (full && tempChart) { tempChart.destroy(); tempChart = null; }

    const opts = (begin) => ({
      responsive: true, maintainAspectRatio: false, animation: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { position: "bottom", labels: { boxWidth: 12, usePointStyle: true } } },
      scales: { y: { beginAtZero: begin }, x: { ticks: { maxTicksLimit: 8 } } },
    });

    if (!vibChart) vibChart = new Chart(document.getElementById("vibChart"), { type: "line", data: { labels, datasets: vibData }, options: opts(true) });
    else { vibChart.data.labels = labels; vibChart.data.datasets = vibData; vibChart.update(); }

    if (!tempChart) tempChart = new Chart(document.getElementById("tempChart"), { type: "line", data: { labels, datasets: tempData }, options: opts(false) });
    else { tempChart.data.labels = labels; tempChart.data.datasets = tempData; tempChart.update(); }
  }

  function renderTable(readings) {
    if (!readings.length) { setEmptyMessage(tbody, 3, "No readings recorded yet."); return; }
    tbody.innerHTML = readings.slice(-10).reverse().map(r => `
      <tr>
        <td>${fmtTime(r.timestamp)}</td>
        <td class="num">${fmtNum(r.temperature, 1)}</td>
        <td class="num">${fmtNum(r.vibration, 3)}</td>
      </tr>`).join("");
  }

  async function onManualReading(e) {
    e.preventDefault();
    const err = document.getElementById("readingError");
    err.textContent = "";
    const temperature = parseFloat(document.getElementById("rTemp").value);
    const vibration = parseFloat(document.getElementById("rVib").value);
    if (Number.isNaN(temperature) || Number.isNaN(vibration)) {
      err.textContent = "Enter both a temperature and a vibration value.";
      return;
    }
    try {
      const res = await api.addReading(Number(sel.value), { temperature, vibration });
      const bad = res.classification !== "NORMAL" || res.temperature_classification !== "NORMAL";
      toast(bad ? `Reading recorded — ${res.classification.toLowerCase()} vibration, ${res.temperature_classification.toLowerCase()} temperature.` : "Reading recorded — all normal.", bad ? "warn" : "success");
      form.reset();
      refresh(false);
      refreshNotifications();
    } catch (ex) {
      err.textContent = ex.message || "Could not save reading.";
    }
  }
});
