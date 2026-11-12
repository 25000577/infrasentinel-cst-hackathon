/* Transformers — CRUD table, search, filter, modal */
document.addEventListener("DOMContentLoaded", async () => {
  if (!initPageShell()) return;

  let all = [];
  let editingId = null;

  const tbody = document.querySelector("#txTable tbody");
  const form = document.getElementById("txForm");
  const modal = document.getElementById("txModal");
  const modalTitle = document.getElementById("txModalTitle");
  const formError = document.getElementById("txFormError");

  // Prefill search from ?q=
  const params = new URLSearchParams(location.search);
  const q = params.get("q");
  if (q) document.getElementById("txSearch").value = q;

  document.getElementById("addBtn").addEventListener("click", () => openModal(null));
  document.getElementById("txClose").addEventListener("click", closeModal);
  document.getElementById("txCancel").addEventListener("click", closeModal);
  form.addEventListener("submit", onSubmit);

  document.getElementById("txSearch").addEventListener("input", render);
  document.getElementById("txStatusFilter").addEventListener("change", render);

  await load();

  async function load() {
    try {
      all = await api.listTransformers();
      render();
    } catch (err) {
      toast(err.message || "Failed to load transformers", "error");
    }
  }

  function render() {
    const q = document.getElementById("txSearch").value.trim().toLowerCase();
    const status = document.getElementById("txStatusFilter").value;

    const filtered = all.filter(t => {
      const matchesQ = !q
        || t.code.toLowerCase().includes(q)
        || t.name.toLowerCase().includes(q)
        || t.location.toLowerCase().includes(q);
      const matchesS = !status || t.status === status;
      return matchesQ && matchesS;
    });

    if (!filtered.length) {
      setEmptyMessage(tbody, 8, "No transformers match the filter.");
      return;
    }

    tbody.innerHTML = filtered.map(t => `
      <tr>
        <td><strong>${escapeHtml(t.code)}</strong></td>
        <td>${escapeHtml(t.name)}</td>
        <td>${escapeHtml(t.location)}</td>
        <td>${fmtNum(t.voltage_kv, 0)} kV</td>
        <td>${statusPill(t.status)}</td>
        <td>${healthPill(t.health)}</td>
        <td>${fmtTime(t.last_seen)}</td>
        <td>
          <button class="btn btn-ghost" data-act="edit"   data-id="${t.id}">Edit</button>
          <button class="btn btn-ghost" data-act="view"   data-id="${t.id}">View</button>
          <button class="btn btn-danger" data-act="delete" data-id="${t.id}">Remove</button>
        </td>
      </tr>
    `).join("");

    tbody.querySelectorAll("button[data-act]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = Number(btn.dataset.id);
        if (btn.dataset.act === "edit")   openModal(id);
        if (btn.dataset.act === "view")   location.href = `monitoring.html?id=${id}`;
        if (btn.dataset.act === "delete") remove(id);
      });
    });
  }

  function openModal(id) {
    editingId = id;
    formError.textContent = "";
    form.reset();
    if (id) {
      const t = all.find(x => x.id === id);
      if (!t) return;
      modalTitle.textContent = `Edit ${t.code}`;
      document.getElementById("txId").value = t.id;
      document.getElementById("txCode").value = t.code;
      document.getElementById("txName").value = t.name;
      document.getElementById("txLocation").value = t.location;
      document.getElementById("txLat").value = t.lat ?? "";
      document.getElementById("txLng").value = t.lng ?? "";
      document.getElementById("txKv").value = t.voltage_kv;
      document.getElementById("txBase").value = t.baseline_vibration;
      document.getElementById("txWarn").value = t.warn_threshold;
      document.getElementById("txCrit").value = t.crit_threshold;
      document.getElementById("txMaxT").value = t.max_temp;
    } else {
      modalTitle.textContent = "Register transformer";
      document.getElementById("txId").value = "";
    }
    showModal("txModal");
  }

  function closeModal() { hideModal("txModal"); }

  async function onSubmit(e) {
    e.preventDefault();
    formError.textContent = "";

    const body = {
      code:               document.getElementById("txCode").value.trim(),
      name:               document.getElementById("txName").value.trim(),
      location:           document.getElementById("txLocation").value.trim(),
      lat:                parseFloat(document.getElementById("txLat").value) || null,
      lng:                parseFloat(document.getElementById("txLng").value) || null,
      voltage_kv:         parseFloat(document.getElementById("txKv").value),
      baseline_vibration: parseFloat(document.getElementById("txBase").value) || 0.5,
      warn_threshold:     parseFloat(document.getElementById("txWarn").value) || 1.5,
      crit_threshold:     parseFloat(document.getElementById("txCrit").value) || 3.0,
      max_temp:           parseFloat(document.getElementById("txMaxT").value) || 85,
    };

    if (!body.code || !body.name || !body.location || !body.voltage_kv) {
      formError.textContent = "Please fill in all required fields.";
      return;
    }

    try {
      if (editingId) await api.updateTransformer(editingId, body);
      else           await api.createTransformer(body);
      toast("Transformer saved.", "success");
      closeModal();
      await load();
    } catch (err) {
      formError.textContent = err.message || "Save failed.";
    }
  }

  async function remove(id) {
    if (!confirm("Remove this transformer? This cannot be undone.")) return;
    try {
      await api.deleteTransformer(id);
      toast("Transformer removed.", "success");
      await load();
    } catch (err) {
      toast(err.message || "Delete failed.", "error");
    }
  }
});