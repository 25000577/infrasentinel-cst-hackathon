/* Simulation Lab — trigger demo attack / fault scenarios */
document.addEventListener("DOMContentLoaded", async () => {
  if (!initPageShell()) return;

  const sel = document.getElementById("txSelect");
  const logBox = document.getElementById("simLog");

  const SCENARIOS = {
    tamper:       { call: api.simTamper,       label: "Physical tampering" },
    overheat:     { call: api.simOverheat,     label: "Overheating" },
    disconnect:   { call: api.simDisconnect,   label: "Device disconnect" },
    unauthorised: { call: api.simUnauthorised, label: "Unauthorised device" },
    restore:      { call: api.simRestore,      label: "Restore device" },
  };

  try {
    const list = await api.listTransformers();
    if (!list.length) {
      sel.innerHTML = `<option value="">No transformers registered</option>`;
      document.querySelectorAll("[data-sim]").forEach(b => (b.disabled = true));
    } else {
      sel.innerHTML = list.map(t => `<option value="${t.id}">${escapeHtml(t.code)} — ${escapeHtml(t.name)}</option>`).join("");
    }
  } catch (err) {
    toast(err.message || "Failed to load transformers", "error");
  }

  document.querySelectorAll("[data-sim]").forEach(btn => btn.addEventListener("click", () => run(btn)));
  document.getElementById("clearLog").addEventListener("click", () => { logBox.innerHTML = `<div class="t">Log cleared.</div>`; });

  async function run(btn) {
    const key = btn.dataset.sim;
    const sc = SCENARIOS[key];
    const id = Number(sel.value);
    if (!sc || !id) return;
    const code = sel.options[sel.selectedIndex].text.split(" — ")[0];
    btn.disabled = true;
    try {
      const res = await sc.call(id);
      let detail = "";
      if (key === "tamper") detail = ` vibration ${fmtNum(res.vibration, 2)}`;
      if (key === "overheat") detail = ` temperature ${fmtNum(res.temperature, 1)} °C`;
      if (key === "restore") detail = ` ${res.synced} queued event(s) synced`;
      log(`${sc.label} on ${code} — ${res.severity || "done"}${detail}`, key === "restore" ? "ok" : "err");
      toast(`${sc.label} simulated on ${code}.`, key === "restore" ? "success" : "warn");
      refreshNotifications();
    } catch (err) {
      log(`${sc.label} failed: ${err.message}`, "err");
      toast(err.message || "Simulation failed", "error");
    } finally {
      btn.disabled = false;
    }
  }

  function log(msg, cls) {
    if (logBox.querySelector(".t") && !logBox.querySelector(".entry")) logBox.innerHTML = "";
    const d = document.createElement("div");
    d.className = "entry";
    d.innerHTML = `<span class="t">${new Date().toLocaleTimeString()}</span><span class="${cls || ""}">${escapeHtml(msg)}</span>`;
    logBox.prepend(d);
  }
});
