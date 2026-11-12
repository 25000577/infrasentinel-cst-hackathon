/* Incidents — list + edit modal */
document.addEventListener("DOMContentLoaded", async () => {
  if (!initPageShell()) return;

  const tbody = document.querySelector("#incTable tbody");
  let editing = null;

  document.getElementById("incStatus").addEventListener("change", load);
  document.getElementById("incClose").addEventListener("click", closeModal);
  document.getElementById("incCancel").addEventListener("click", closeModal);
  document.getElementById("incSave").addEventListener("click", save);

  await load();

  async function load() {
    const st = document.getElementById("incStatus").value;
    try {
      const incidents = await api.listIncidents(st ? { status: st } : {});
      if (!incidents || !incidents.length) {
        setEmptyMessage(tbody, 8, "No incidents.");
        return;
      }
      tbody.innerHTML = incidents.map(i => `
        <tr>
          <td class="mono">${escapeHtml(i.ref)}</td>
          <td>${escapeHtml(i.transformer_code || i.transformer_id || "—")}</td>
          <td>${escapeHtml(i.incident_type)}</td>
          <td>${severityPill(i.severity)}</td>
          <td>${fmtTime(i.created_at)}</td>
          <td>${statusPill(i.status)}</td>
          <td>${escapeHtml(i.assigned_to || "—")}</td>
          <td><button class="btn btn-ghost" data-id="${i.id}">Open</button></td>
        </tr>
      `).join("");
      tbody.querySelectorAll("button[data-id]").forEach(btn => {
        btn.addEventListener("click", () => open(Number(btn.dataset.id), incidents));
      });
    } catch (err) {
      toast(err.message || "Failed to load incidents", "error");
    }
  }

  function open(id, list) {
    editing = list.find(i => i.id === id);
    if (!editing) return;
    document.getElementById("incTitle").textContent = editing.ref;
    document.getElementById("incDesc").value = editing.description || "";
    document.getElementById("incStatusSel").value = editing.status || "OPEN";
    document.getElementById("incAssigned").value = editing.assigned_to || "";
    document.getElementById("incNotes").value = editing.notes || "";
    showModal("incModal");
  }

  function closeModal() { hideModal("incModal"); }

  async function save() {
    if (!editing) return;
    try {
      await api.updateIncident(editing.id, {
        status:      document.getElementById("incStatusSel").value,
        assigned_to: document.getElementById("incAssigned").value.trim(),
        notes:       document.getElementById("incNotes").value.trim(),
      });
      toast("Incident updated.", "success");
      closeModal();
      await load();
    } catch (err) {
      toast(err.message || "Save failed", "error");
    }
  }
});