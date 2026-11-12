/* Map — Leaflet view of every transformer, coloured by health with Google Maps integration */
document.addEventListener("DOMContentLoaded", async () => {
  if (!initPageShell()) return;

  const mapEl = document.getElementById("map");
  const listEl = document.getElementById("mapList");
  if (typeof L === "undefined") {
    mapEl.innerHTML = `<div class="empty-note">The map library could not be loaded. Check your internet connection and reload.</div>`;
    return;
  }

  const map = L.map(mapEl, { scrollWheelZoom: true }).setView([-23.3, 30.0], 7);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  const COLORS = { NORMAL: "#16A34A", WARNING: "#D97706", CRITICAL: "#DC2626" };
  const markers = new Map();
  let initialBoundsSet = false;

  function pin(t) {
    const offline = t.status !== "ONLINE";
    const colour = offline ? "#64748B" : (COLORS[t.health] || COLORS.NORMAL);
    return L.divIcon({
      className: "",
      html: `<span style="display:block;width:20px;height:20px;border-radius:50%;background:${colour};border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.45)"></span>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    });
  }

  async function load() {
    let data;
    try {
      data = await api.infrastructure();
    } catch (err) {
      toast(err.message || "Failed to load map data", "error");
      return;
    }
    const located = data.filter(t => t.lat != null && t.lng != null);

    // Remove old markers
    markers.forEach(m => m.remove());
    markers.clear();

    located.forEach(t => {
      const gMapsUrl = `https://www.google.com/maps/search/?api=1&query=${t.lat},${t.lng}`;
      const m = L.marker([t.lat, t.lng], { icon: pin(t), title: t.code }).addTo(map);
      
      m.bindPopup(`
        <strong>${escapeHtml(t.code)}</strong> — ${escapeHtml(t.name)}<br>
        ${escapeHtml(t.location)} · ${fmtNum(t.voltage_kv, 0)} kV<br>
        Temp ${fmtNum(t.temperature, 1)} °C · Vibration ${fmtNum(t.vibration, 3)}<br>
        <div style="margin-top: 6px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
          <a href="monitoring.html?id=${t.id}">Open monitoring</a>
          <span>·</span>
          <a href="${gMapsUrl}" target="_blank" rel="noopener">Open in Google Maps ↗</a>
        </div>`);
      
      // Store using string key to prevent type mismatch issues with dataset
      markers.set(String(t.id), m);
    });

    // Only fit bounds on the first load so user pan/zoom isn't hijacked on background refreshes
    if (located.length && !initialBoundsSet) {
      map.fitBounds(L.latLngBounds(located.map(t => [t.lat, t.lng])).pad(0.25));
      initialBoundsSet = true;
    }

    listEl.innerHTML = data.length ? data.map(t => `
      <div class="map-item" data-id="${t.id}">
        <div class="grow"><strong>${escapeHtml(t.code)}</strong> ${escapeHtml(t.name)}<small>${escapeHtml(t.location)}</small></div>
        ${t.status === "ONLINE" ? healthPill(t.health) : connectivityPill(t.status)}
      </div>`).join("") : `<div class="empty-note">No transformers registered.</div>`;

    listEl.querySelectorAll(".map-item").forEach(el => {
      el.addEventListener("click", () => {
        const markerKey = String(el.dataset.id);
        const m = markers.get(markerKey);
        if (m) {
          map.setView(m.getLatLng(), 13);
          m.openPopup();
        }
      });
    });
  }

  await load();
  setInterval(load, 15000);
  setTimeout(() => map.invalidateSize(), 200);
});
