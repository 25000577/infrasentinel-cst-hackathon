/* Audit — list, verify, tamper-test */
document.addEventListener("DOMContentLoaded", async () => {
  if (!initPageShell()) return;

  const tbody = document.querySelector("#auditTable tbody");

  document.getElementById("verifyBtn").addEventListener("click", verify);
  document.getElementById("tamperTestBtn").addEventListener("click", runTamperTest);

  await load();

  async function load() {
    try {
      const rows = await api.listAudit();
      if (!rows || !rows.length) {
        setEmptyMessage(tbody, 7, "Audit log is empty.");
        return;
      }
      tbody.innerHTML = rows.slice().reverse().map((r, i) => `
        <tr>
          <td>${rows.length - i}</td>
          <td class="mono">${escapeHtml(r.event_id.slice(0, 12))}…</td>
          <td>${escapeHtml(r.description)}</td>
          <td>${escapeHtml(r.transformer_id ?? "—")}</td>
          <td class="mono">${escapeHtml((r.prev_hash || "").slice(0, 12))}…</td>
          <td class="mono">${escapeHtml((r.curr_hash || "").slice(0, 12))}…</td>
          <td>${fmtTime(r.timestamp)}</td>
        </tr>
      `).join("");
    } catch (err) {
      toast(err.message || "Failed to load audit log", "error");
    }
  }

  async function verify() {
    try {
      const res = await api.verifyAudit();
      const box = document.getElementById("verifyResult");
      box.hidden = false;
      const ok = res.status === "VERIFIED";
      box.className = "verify-box " + (ok ? "ok" : "bad");
      box.innerHTML = `
        <h3 style="color:${ok ? "#0F7A37" : "#B91C1C"}">
          ${ok ? "Chain verified" : "Tampering detected"}
        </h3>
        <p class="muted">
          Checked ${res.checked} records.
          ${res.broken_at ? `Break at event ${escapeHtml(res.broken_at)}.` : ""}
        </p>`;
      toast(`Audit ${res.status}`, ok ? "success" : "error");
    } catch (err) {
      toast(err.message || "Verification failed", "error");
    }
  }

  async function runTamperTest() {
    if (!confirm("This briefly alters the latest audit record to prove tampering is detected, then restores it. Continue?")) return;
    try {
      const res = await api.runTamperTest();
      const check = res.result || {};
      const box = document.getElementById("verifyResult");
      box.hidden = false;
      box.className = "verify-box bad";
      box.innerHTML = `
        <h3 style="color:#B91C1C">Tampering detected</h3>
        <p class="muted">
          The most recent record was altered on the server and the chain check reported
          <strong>${escapeHtml(check.status || "—")}</strong>${check.broken_at ? ` at event ${escapeHtml(check.broken_at)}` : ""}.
          The record has since been restored, so the real log is intact.
        </p>`;
      toast("Tampering detected by chain verification.", "error");
    } catch (err) {
      toast(err.message || "Tamper test failed", "error");
    }
  }
});