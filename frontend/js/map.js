/* Map — Leaflet view of every transformer, coloured by health */
document.addEventListener("DOMContentLoaded", async () => {
  // If initPageShell exists, make sure it doesn't block loading if optional
  if (typeof initPageShell === "function") {
    try {
      if (!initPageShell()) {
        console.warn("initPageShell returned false, proceeding with map init anyway.");
      }
    } catch (e) {
      console.warn("initPageShell error:", e);
    }
  }

  const mapEl = document.getElementById("map");
  const listEl = document.getElementById("mapList");
  
  if (!mapEl) {
    console.error("Map element #map not found in DOM!");
    return;
  }

  if (typeof L === "undefined") {
    mapEl.innerHTML = `<div class="empty-note" style="padding: 20px; color: #dc2626;">The Leaflet map library could not be loaded. Check your internet connection or CDN links.</div>`;
    return;
  }

  // Initialize Map safely
  let map;
  try {
    map = L.map(mapEl, { scrollWheelZoom: true }).setView([-23.3, 30.0], 7);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);
  } catch (err) {
    console.error("Failed to initialize Leaflet map:", err);
    return;
  }

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
    let rawData;
    try {
      rawData = await api.infrastructure();
    } catch (err) {
      if (typeof toast === "function") {
        toast(err.message || "Failed to load map data", "error");
      } else {
        console.error("Failed to load map data:", err);
      }
      return;
    }

    // Safely unwrap data whether it's an array or wrapped in an object property
    let data = [];
    if (Array.isArray(rawData)) {
      data = rawData;
    } else if (rawData && Array.isArray(rawData.data)) {
      data = rawData.data;
    } else if (rawData && Array.isArray(rawData.transformers)) {
      data = rawData.transformers;
    }

    const located = data.filter(t => t.lat != null && t.lng != null);

    // Remove old markers
    markers.forEach(m => m.remove());
    markers.clear();

    located.forEach(t => {
      const gMapsUrl = `https://www.google.com/maps/search/?api=1&query=${t.lat},${t.lng}`;
      const m = L.marker([t.lat, t.lng], { icon: pin(t), title: t.code || "Transformer" }).addTo(map);
      
      const safeCode = typeof escapeHtml === "function" ? escapeHtml(t.code || "") : (t.code || "");
      const safeName = typeof escapeHtml === "function" ? escapeHtml(t.name || "") : (t.name || "");
      const safeLoc = typeof escapeHtml === "function" ? escapeHtml(t.location || "") : (t.location || "");

      m.bindPopup(`
        <strong>${safeCode}</strong> — ${safeName}<br>
        ${safeLoc} · ${typeof fmtNum === "function" ? fmtNum(t.voltage_kv, 0) : t.voltage_kv} kV<br>
        Temp ${typeof fmtNum === "function" ? fmtNum(t.temperature, 1) : t.temperature} °C · Vibration ${typeof fmtNum === "function" ? fmtNum(t.vibration, 3) : t.vibration}<br>
        <div style="margin-top: 6px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
          <a href="monitoring.html?id=${t.id}">Open monitoring</a>
          <span>·</span>
          <a href="${gMapsUrl}" target="_blank" rel="noopener">Open in Google Maps ↗</a>
        </div>`);
      
      markers.set(String(t.id), m);
    });

    if (located.length && !initialBoundsSet) {
      try {
        map.fitBounds(L.latLngBounds(located.map(t => [t.lat, t.lng])).pad(0.25));
        initialBoundsSet = true;
      } catch (e) {
        console.warn("Could not fit bounds:", e);
      }
    }

    if (listEl) {
      listEl.innerHTML = data.length ? data.map(t => {
        const sc = typeof escapeHtml === "function" ? escapeHtml(t.code || "") : (t.code || "");
        const sn = typeof escapeHtml === "function" ? escapeHtml(t.name || "") : (t.name || "");
        const sl = typeof escapeHtml === "function" ? escapeHtml(t.location || "") : (t.location || "");
        const pill = t.status === "ONLINE" && typeof healthPill === "function" ? healthPill(t.health) : (typeof connectivityPill === "function" ? connectivityPill(t.status) : t.status);
        
        return `
          <div class="map-item" data-id="${t.id}" style="cursor: pointer; padding: 8px; border-bottom: 1px solid var(--border-color, #eee); display: flex; align-items: center;">
            <div class="grow"><strong>${sc}</strong> ${sn}<small style="display:block; color:#666;">${sl}</small></div>
            ${pill}
          </div>`;
      }).join("") : `<div class="empty-note" style="padding: 15px;">No transformers registered.</div>`;

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
  }

  await load();
  setInterval(load, 15000);
  setTimeout(() => map.invalidateSize(), 200);
});
