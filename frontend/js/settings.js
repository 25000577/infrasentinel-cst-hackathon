/* Settings — load/save preferences + account info */
document.addEventListener("DOMContentLoaded", async () => {
  if (!initPageShell()) return;

  const form = document.getElementById("settingsForm");
  const err  = document.getElementById("settingsError");
  const poll = document.getElementById("pollingInterval");
  const auto = document.getElementById("autoResolve");

  // Account info
  const user = getStoredUser() || {};
  document.getElementById("accountInfo").innerHTML = `
    <div class="kv-row"><span class="k">Name</span><span class="v">${escapeHtml(user.name || "—")}</span></div>
    <div class="kv-row"><span class="k">Email</span><span class="v">${escapeHtml(user.email || "—")}</span></div>
    <div class="kv-row"><span class="k">Role</span><span class="v">${escapeHtml((user.role || "").toUpperCase())}</span></div>
  `;

  await load();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    err.textContent = "";
    try {
      await api.saveSettings({
        polling_interval:   Number(poll.value) || 5,
        auto_resolve_warning: auto.checked,
      });
      toast("Settings saved.", "success");
    } catch (ex) {
      err.textContent = ex.message || "Save failed.";
    }
  });

  async function load() {
    try {
      const s = await api.getSettings();
      poll.value = s.polling_interval ?? 5;
      auto.checked = String(s.auto_resolve_warning) === "true";
    } catch (ex) {
      err.textContent = ex.message || "Failed to load settings.";
    }
  }
});