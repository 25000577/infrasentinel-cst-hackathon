/* Settings — load/save preferences + account info */
document.addEventListener("DOMContentLoaded", async () => {
  if (!initPageShell()) return;

  const form = document.getElementById("settingsForm");
  const err  = document.getElementById("settingsError");
  const poll = document.getElementById("pollingInterval");
  const auto = document.getElementById("autoResolve");

  // Account info
  const user = (typeof getStoredUser === "function" ? getStoredUser() : null) || {};
  const accountInfoEl = document.getElementById("accountInfo");
  if (accountInfoEl) {
    accountInfoEl.innerHTML = `
      <div class="kv-row"><span class="k">Name</span><span class="v">${escapeHtml(user.name || "—")}</span></div>
      <div class="kv-row"><span class="k">Email</span><span class="v">${escapeHtml(user.email || "—")}</span></div>
      <div class="kv-row"><span class="k">Role</span><span class="v">${escapeHtml((user.role || "").toUpperCase())}</span></div>
    `;
  }

  // Logout button binding if present
  const logoutBtn = document.getElementById("logoutBtn2");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      if (!confirm("Are you sure you want to sign out?")) return;
      try {
        if (typeof api.logout === "function") await api.logout();
      } catch (_) {}
      localStorage.clear();
      toast("Signed out successfully", "info");
      setTimeout(() => { window.location.href = "index.html"; }, 800);
    });
  }

  await load();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    err.textContent = "";
    try {
      await api.saveSettings({
        polling_interval: Number(poll.value) || 5,
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
      // Robust boolean coercion handling both boolean and string variants
      auto.checked = s.auto_resolve_warning === true || String(s.auto_resolve_warning) === "true";
    } catch (ex) {
      err.textContent = ex.message || "Failed to load settings.";
    }
  }
});
