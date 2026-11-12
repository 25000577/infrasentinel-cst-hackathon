/* ============================================================================
   InfraSentinel — Express API server
   ============================================================================ */
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

const db = require("./db");
const seed = require("./seed");
const {
  hashPassword,
  verifyPassword,
  createSession,
  getSession,
  revokeSession,
  purgeExpiredSessions,
} = require("./security");
const { appendAudit, verifyChain } = require("./audit");

seed();

const app = express();
app.set("trust proxy", 1); // hosting platforms (Render, Railway, Heroku…) sit behind a proxy
app.disable("x-powered-by");
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "same-origin");
  next();
});

purgeExpiredSessions();
setInterval(purgeExpiredSessions, 60 * 60 * 1000).unref();

/* Login throttle: 10 failed attempts per IP per 15 minutes */
const attempts = new Map();
function throttled(ip) {
  const a = attempts.get(ip);
  if (!a || a.reset < Date.now()) return false;
  return a.count >= 10;
}
function noteFailure(ip) {
  const a = attempts.get(ip);
  if (!a || a.reset < Date.now()) attempts.set(ip, { count: 1, reset: Date.now() + 15 * 60 * 1000 });
  else a.count++;
}

app.get("/api/health", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

/* ---------------------------------------------------------------- helpers */
const utcnow = () => new Date().toISOString();

function auth(req, res, next) {
  const h = req.headers.authorization || "";
  if (!h.startsWith("Bearer "))
    return res.status(401).json({ detail: "Missing bearer token" });
  const s = getSession(h.slice(7));
  if (!s) return res.status(401).json({ detail: "Invalid or expired session" });
  req.user = s;
  next();
}

function adminOnly(req, res, next) {
  if (req.user?.role !== "admin")
    return res.status(403).json({ detail: "Admin role required" });
  next();
}

function emitEvent(transformerId, etype, severity, description) {
  const info = db
    .prepare(
      `INSERT INTO security_events
       (transformer_id,event_type,severity,description,status,timestamp)
       VALUES (?,?,?,?,?,?)`
    )
    .run(transformerId ?? null, etype, severity, description, "OPEN", utcnow());

  appendAudit(transformerId ?? null, description);

  if (severity === "WARNING" || severity === "CRITICAL")
    createIncident(transformerId, etype, severity, description);

  return info.lastInsertRowid;
}

function createIncident(transformerId, itype, severity, description) {
  const ref = "INC-" + crypto.randomBytes(4).toString("hex").toUpperCase();
  db.prepare(
    `INSERT INTO incidents
     (ref,transformer_id,incident_type,severity,description,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?)`
  ).run(ref, transformerId ?? null, itype, severity, description, utcnow(), utcnow());
  return ref;
}

/* When enabled in Settings, a healthy reading closes open WARNING events/incidents */
function autoResolve(transformerId) {
  const row = db.prepare("SELECT value FROM system_settings WHERE key='auto_resolve_warning'").get();
  if (!row || row.value !== "true") return;
  db.prepare("UPDATE security_events SET status='RESOLVED' WHERE transformer_id=? AND severity='WARNING' AND status!='RESOLVED'").run(transformerId);
  db.prepare("UPDATE incidents SET status='RESOLVED', updated_at=? WHERE transformer_id=? AND severity='WARNING' AND status!='RESOLVED'").run(utcnow(), transformerId);
}

function classify(vib, warn, crit) {
  if (vib >= crit) return "CRITICAL";
  if (vib >= warn) return "WARNING";
  return "NORMAL";
}

function getTransformer(id) {
  return db.prepare("SELECT * FROM transformers WHERE id=?").get(id);
}

/* =================================================================== AUTH */
app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password)
    return res.status(400).json({ detail: "Email and password required" });

  if (throttled(req.ip))
    return res.status(429).json({ detail: "Too many failed attempts. Try again in 15 minutes." });

  const user = db
    .prepare("SELECT * FROM users WHERE email=?")
    .get(String(email).trim().toLowerCase());
  if (!user || !verifyPassword(String(password), user.password_hash)) {
    noteFailure(req.ip);
    return res.status(401).json({ detail: "Invalid email or password" });
  }
  attempts.delete(req.ip);

  const token = createSession(user);
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});

app.post("/api/auth/logout", auth, (req, res) => {
  const h = req.headers.authorization || "";
  if (h.startsWith("Bearer ")) revokeSession(h.slice(7));
  res.json({ ok: true });
});

app.get("/api/auth/me", auth, (req, res) => res.json(req.user));

/* ============================================================== DASHBOARD */
app.get("/api/dashboard/summary", auth, (req, res) => {
  const total = db.prepare("SELECT COUNT(*) n FROM transformers").get().n;
  const online = db
    .prepare("SELECT COUNT(*) n FROM transformers WHERE status='ONLINE'")
    .get().n;
  const incidents = db
    .prepare("SELECT COUNT(*) n FROM incidents WHERE status!='RESOLVED'")
    .get().n;
  const critical = db
    .prepare(
      "SELECT COUNT(*) n FROM security_events WHERE severity='CRITICAL' AND status!='RESOLVED'"
    )
    .get().n;
  res.json({ total, online, offline: total - online, incidents, critical });
});

app.get("/api/dashboard/infrastructure", auth, (req, res) => {
  const rows = db
    .prepare(
      `
    SELECT t.id, t.code, t.name, t.location, t.lat, t.lng,
           t.voltage_kv, t.status, t.health, t.last_seen,
           t.baseline_vibration, t.warn_threshold, t.crit_threshold, t.max_temp,
           (SELECT temperature FROM sensor_readings WHERE transformer_id=t.id ORDER BY id DESC LIMIT 1) AS temperature,
           (SELECT vibration   FROM sensor_readings WHERE transformer_id=t.id ORDER BY id DESC LIMIT 1) AS vibration
    FROM transformers t ORDER BY t.id
  `
    )
    .all();
  res.json(rows);
});

app.get("/api/dashboard/activity", auth, (req, res) => {
  const rows = db
    .prepare(
      `
    SELECT e.id, e.event_type, e.severity, e.description,
           e.status, e.timestamp, e.transformer_id,
           t.code AS transformer_code
    FROM security_events e
    LEFT JOIN transformers t ON t.id = e.transformer_id
    ORDER BY e.id DESC LIMIT 20
  `
    )
    .all();
  res.json(rows);
});

/* ============================================================ TRANSFORMERS */
app.get("/api/transformers", auth, (req, res) => {
  res.json(db.prepare("SELECT * FROM transformers ORDER BY id").all());
});

app.get("/api/transformers/:id", auth, (req, res) => {
  const t = getTransformer(Number(req.params.id));
  if (!t) return res.status(404).json({ detail: "Transformer not found" });
  res.json(t);
});

app.post("/api/transformers", auth, (req, res) => {
  const b = req.body || {};
  for (const k of ["code", "name", "location", "voltage_kv"]) {
    if (b[k] === undefined || b[k] === null || b[k] === "")
      return res.status(422).json({ detail: `Missing ${k}` });
  }
  try {
    const info = db
      .prepare(
        `INSERT INTO transformers
         (code,name,location,lat,lng,voltage_kv,baseline_vibration,
          warn_threshold,crit_threshold,max_temp,status,health,last_seen,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        b.code,
        b.name,
        b.location,
        b.lat ?? null,
        b.lng ?? null,
        Number(b.voltage_kv),
        Number(b.baseline_vibration ?? 0.5),
        Number(b.warn_threshold ?? 1.5),
        Number(b.crit_threshold ?? 3.0),
        Number(b.max_temp ?? 85),
        "ONLINE",
        "NORMAL",
        utcnow(),
        utcnow()
      );
    const id = info.lastInsertRowid;
    emitEvent(id, "TRANSFORMER_REGISTERED", "INFO", `Transformer ${b.code} registered`);
    res.status(201).json(getTransformer(id));
  } catch (e) {
    res.status(400).json({ detail: "Could not create transformer: " + e.message });
  }
});

app.put("/api/transformers/:id", auth, (req, res) => {
  const id = Number(req.params.id);
  const t = getTransformer(id);
  if (!t) return res.status(404).json({ detail: "Transformer not found" });
  const b = req.body || {};
  try {
  db.prepare(
    `UPDATE transformers SET
     code=?, name=?, location=?, lat=?, lng=?, voltage_kv=?,
     baseline_vibration=?, warn_threshold=?, crit_threshold=?, max_temp=?
     WHERE id=?`
  ).run(
    b.code ?? t.code,
    b.name ?? t.name,
    b.location ?? t.location,
    b.lat ?? t.lat,
    b.lng ?? t.lng,
    Number(b.voltage_kv ?? t.voltage_kv),
    Number(b.baseline_vibration ?? t.baseline_vibration),
    Number(b.warn_threshold ?? t.warn_threshold),
    Number(b.crit_threshold ?? t.crit_threshold),
    Number(b.max_temp ?? t.max_temp),
    id
  );
  } catch (e) {
    return res.status(400).json({ detail: "Could not update transformer: " + e.message });
  }
  emitEvent(id, "TRANSFORMER_UPDATED", "INFO", `Transformer ${b.code ?? t.code} updated`);
  res.json(getTransformer(id));
});

app.delete("/api/transformers/:id", auth, adminOnly, (req, res) => {
  const id = Number(req.params.id);
  const t = getTransformer(id);
  if (!t) return res.status(404).json({ detail: "Transformer not found" });
  db.prepare("DELETE FROM transformers WHERE id=?").run(id);
  emitEvent(null, "TRANSFORMER_REMOVED", "INFO", `Transformer ${t.code} removed`);
  res.json({ ok: true });
});

/* ================================================================ READINGS */
app.get("/api/transformers/:id/readings", auth, (req, res) => {
  const id = Number(req.params.id);
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 60));
  const rows = db
    .prepare(
      `SELECT id, temperature, vibration, timestamp
       FROM sensor_readings WHERE transformer_id=? ORDER BY id DESC LIMIT ?`
    )
    .all(id, limit);
  res.json(rows.reverse());
});

app.post("/api/transformers/:id/readings", auth, (req, res) => {
  const id = Number(req.params.id);
  const t = getTransformer(id);
  if (!t) return res.status(404).json({ detail: "Transformer not found" });

  const temperature = Number(req.body?.temperature);
  const vibration = Number(req.body?.vibration);
  if (Number.isNaN(temperature) || Number.isNaN(vibration))
    return res
      .status(422)
      .json({ detail: "temperature and vibration must be numbers" });

  db.prepare(
    `INSERT INTO sensor_readings(transformer_id,temperature,vibration,timestamp)
     VALUES (?,?,?,?)`
  ).run(id, temperature, vibration, utcnow());

  const cls = classify(vibration, t.warn_threshold, t.crit_threshold);
  const tempCls =
    temperature >= t.max_temp
      ? "CRITICAL"
      : temperature >= t.max_temp - 10
      ? "WARNING"
      : "NORMAL";

  let health = "NORMAL";
  if (cls === "CRITICAL" || tempCls === "CRITICAL") health = "CRITICAL";
  else if (cls === "WARNING" || tempCls === "WARNING") health = "WARNING";

  db.prepare("UPDATE transformers SET health=?, last_seen=? WHERE id=?").run(
    health,
    utcnow(),
    id
  );

  if (health === "NORMAL") autoResolve(id);

  if (cls === "CRITICAL")
    emitEvent(id, "VIBRATION_ANOMALY", "CRITICAL", `Critical vibration ${vibration.toFixed(3)} on ${t.code}`);
  else if (cls === "WARNING")
    emitEvent(id, "VIBRATION_ANOMALY", "WARNING", `Elevated vibration ${vibration.toFixed(3)} on ${t.code}`);

  if (tempCls === "CRITICAL")
    emitEvent(id, "OVERHEATING", "CRITICAL", `Temperature ${temperature.toFixed(1)}°C exceeded limit on ${t.code}`);
  else if (tempCls === "WARNING")
    emitEvent(id, "OVERHEATING", "WARNING", `Temperature ${temperature.toFixed(1)}°C elevated on ${t.code}`);

  res.status(201).json({ ok: true, classification: cls, temperature_classification: tempCls });
});

/* ================================================================== EVENTS */
app.get("/api/events", auth, (req, res) => {
  const { severity, status, transformer_id, limit } = req.query;
  const where = [];
  const args = [];
  if (severity) { where.push("e.severity=?"); args.push(severity); }
  if (status) { where.push("e.status=?"); args.push(status); }
  if (transformer_id) { where.push("e.transformer_id=?"); args.push(Number(transformer_id)); }

  const sql = `
    SELECT e.*, t.code AS transformer_code
    FROM security_events e
    LEFT JOIN transformers t ON t.id = e.transformer_id
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY e.id DESC
    LIMIT ?`;
  args.push(Math.min(500, Number(limit) || 200));

  res.json(db.prepare(sql).all(...args));
});

app.patch("/api/events/:id", auth, (req, res) => {
  const id = Number(req.params.id);
  const e = db.prepare("SELECT * FROM security_events WHERE id=?").get(id);
  if (!e) return res.status(404).json({ detail: "Event not found" });
  const st = req.body?.status ?? e.status;
  if (!["OPEN", "INVESTIGATING", "RESOLVED"].includes(st))
    return res.status(422).json({ detail: "Invalid status" });
  db.prepare("UPDATE security_events SET status=? WHERE id=?").run(st, id);
  res.json({ ok: true });
});

/* =============================================================== INCIDENTS */
app.get("/api/incidents", auth, (req, res) => {
  const { status } = req.query;
  const sql = `
    SELECT i.*, t.code AS transformer_code
    FROM incidents i
    LEFT JOIN transformers t ON t.id = i.transformer_id
    ${status ? "WHERE i.status=?" : ""}
    ORDER BY i.id DESC`;
  res.json(db.prepare(sql).all(...(status ? [status] : [])));
});

app.patch("/api/incidents/:id", auth, (req, res) => {
  const id = Number(req.params.id);
  const i = db.prepare("SELECT * FROM incidents WHERE id=?").get(id);
  if (!i) return res.status(404).json({ detail: "Incident not found" });
  const b = req.body || {};
  if (b.status && !["OPEN", "INVESTIGATING", "RESOLVED"].includes(b.status))
    return res.status(422).json({ detail: "Invalid status" });
  db.prepare(`UPDATE incidents SET status=?, assigned_to=?, notes=?, updated_at=? WHERE id=?`)
    .run(b.status ?? i.status, b.assigned_to ?? i.assigned_to, b.notes ?? i.notes, utcnow(), id);
  res.json({ ok: true });
});

/* ============================================================== SIMULATION */
app.post("/api/sim/tamper", auth, (req, res) => {
  const id = Number(req.body?.transformer_id);
  const t = getTransformer(id);
  if (!t) return res.status(404).json({ detail: "Transformer not found" });

  const spike = t.crit_threshold + 1 + Math.random() * 2;
  db.prepare(`INSERT INTO sensor_readings(transformer_id,temperature,vibration,timestamp) VALUES (?,?,?,?)`)
    .run(id, 60 + Math.random() * 5, spike, utcnow());

  emitEvent(id, "TAMPERING_SIMULATION", "CRITICAL", `Simulated tampering: abnormal vibration ${spike.toFixed(2)} on ${t.code}`);
  db.prepare("UPDATE transformers SET health='CRITICAL' WHERE id=?").run(id);

  res.json({ ok: true, severity: "CRITICAL", vibration: spike });
});

app.post("/api/sim/overheat", auth, (req, res) => {
  const id = Number(req.body?.transformer_id);
  const t = getTransformer(id);
  if (!t) return res.status(404).json({ detail: "Transformer not found" });

  const newTemp = t.max_temp + 5 + Math.random() * 5;
  db.prepare(`INSERT INTO sensor_readings(transformer_id,temperature,vibration,timestamp) VALUES (?,?,?,?)`)
    .run(id, newTemp, t.baseline_vibration, utcnow());

  emitEvent(id, "OVERHEATING_SIMULATION", "CRITICAL", `Simulated overheating: ${newTemp.toFixed(1)}°C on ${t.code}`);
  db.prepare("UPDATE transformers SET health='CRITICAL' WHERE id=?").run(id);

  res.json({ ok: true, severity: "CRITICAL", temperature: newTemp });
});

app.post("/api/sim/disconnect", auth, (req, res) => {
  const id = Number(req.body?.transformer_id);
  const t = getTransformer(id);
  if (!t) return res.status(404).json({ detail: "Transformer not found" });

  db.prepare("UPDATE transformers SET status='OFFLINE', last_seen=? WHERE id=?").run(utcnow(), id);
  emitEvent(id, "DEVICE_DISCONNECTED", "WARNING", `Transformer ${t.code} disconnected`);

  const pending = db.prepare("SELECT COUNT(*) n FROM sync_queue WHERE synced=0").get().n;
  res.json({ ok: true, pending });
});

app.post("/api/sim/restore", auth, (req, res) => {
  const id = Number(req.body?.transformer_id);
  const t = getTransformer(id);
  if (!t) return res.status(404).json({ detail: "Transformer not found" });

  db.prepare("UPDATE transformers SET status='ONLINE', health='NORMAL', last_seen=? WHERE id=?").run(utcnow(), id);

  const pending = db.prepare("SELECT COUNT(*) n FROM sync_queue WHERE synced=0").get().n;
  db.prepare("UPDATE sync_queue SET synced=1 WHERE synced=0").run();

  emitEvent(id, "DEVICE_RECONNECTED", "INFO", `Transformer ${t.code} restored; ${pending} queued event(s) synced`);
  res.json({ ok: true, synced: pending });
});

app.post("/api/sim/unauthorised", auth, (req, res) => {
  const id = Number(req.body?.transformer_id);
  const t = getTransformer(id);

  db.prepare(`INSERT INTO authentication_logs(device_id,success,reason,timestamp) VALUES (?,?,?,?)`)
    .run("UNKNOWN-DEVICE", 0, "Simulated unauthorised attempt", utcnow());

  emitEvent(id, "UNAUTHORISED_DEVICE", "CRITICAL", `Unauthorised device attempted to connect to ${t?.code ?? "unknown transformer"}`);
  res.json({ ok: true });
});

/* ==================================================================== SYNC */
app.post("/api/sync", auth, (req, res) => {
  const events = Array.isArray(req.body?.events) ? req.body.events : [];
  let accepted = 0, skipped = 0;

  const insert = db.prepare(`
    INSERT OR IGNORE INTO sync_queue
    (client_event_id, transformer_id, event_type, severity, description, client_timestamp, synced)
    VALUES (?,?,?,?,?,?,1)
  `);

  for (const e of events) {
    if (!e?.client_event_id) { skipped++; continue; }
    try {
      const info = insert.run(e.client_event_id, e.transformer_id ?? null, e.event_type, e.severity, e.description, e.client_timestamp);
      if (info.changes > 0) {
        accepted++;
        emitEvent(e.transformer_id ?? null, e.event_type, e.severity, e.description);
      } else skipped++;
    } catch { skipped++; }
  }
  res.json({ accepted, skipped });
});

/* =================================================================== AUDIT */
app.get("/api/audit", auth, (req, res) => {
  res.json(db.prepare("SELECT * FROM audit_logs ORDER BY id ASC").all());
});

app.get("/api/audit/verify", auth, (req, res) => {
  res.json(verifyChain());
});

app.post("/api/audit/tamper-test", auth, (req, res) => {
  const row = db.prepare("SELECT * FROM audit_logs ORDER BY id DESC LIMIT 1").get();
  if (!row) return res.status(400).json({ detail: "No audit records to tamper with" });

  // Modify a record, verify (should fail), then restore it so the real chain is
  // not left permanently broken after the demonstration.
  const setDesc = db.prepare("UPDATE audit_logs SET description=? WHERE id=?");
  setDesc.run(row.description + " [TAMPERED FOR DEMONSTRATION]", row.id);
  const result = verifyChain();
  setDesc.run(row.description, row.id);
  res.json({ ok: true, tampered_id: row.id, result, restored: true });
});

/* ================================================================= REPORTS */
app.get("/api/reports/summary", auth, (req, res) => {
  const isDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const from = isDate(req.query.from) ? req.query.from : null;
  const to = isDate(req.query.to) ? req.query.to : null;

  // Date strings are validated above (YYYY-MM-DD only), so inlining them is safe.
  const range = (col) => {
    if (!from && !to) return "";
    const w = [];
    if (from) w.push(`${col} >= '${from}T00:00:00.000Z'`);
    if (to) w.push(`${col} <= '${to}T23:59:59.999Z'`);
    return " AND " + w.join(" AND ");
  };

  const total = db.prepare("SELECT COUNT(*) n FROM transformers").get().n;
  const online = db.prepare("SELECT COUNT(*) n FROM transformers WHERE status='ONLINE'").get().n;
  const inc = db.prepare(`SELECT COUNT(*) n FROM incidents WHERE 1=1 ${range("created_at")}`).get().n;
  const vibAnom = db.prepare(`SELECT COUNT(*) n FROM security_events WHERE event_type LIKE 'VIBRATION%' ${range("timestamp")}`).get().n;
  const tempW = db.prepare(`SELECT COUNT(*) n FROM security_events WHERE event_type LIKE 'OVERHEATING%' ${range("timestamp")}`).get().n;
  const offEv = db.prepare(`SELECT COUNT(*) n FROM security_events WHERE event_type='DEVICE_DISCONNECTED' ${range("timestamp")}`).get().n;
  const authFail = db.prepare(`SELECT COUNT(*) n FROM authentication_logs WHERE success=0 ${range("timestamp")}`).get().n;
  const crit = db.prepare(`SELECT COUNT(*) n FROM security_events WHERE severity='CRITICAL' ${range("timestamp")}`).get().n;
  const warn = db.prepare(`SELECT COUNT(*) n FROM security_events WHERE severity='WARNING' ${range("timestamp")}`).get().n;
  const info = db.prepare(`SELECT COUNT(*) n FROM security_events WHERE severity='INFO' ${range("timestamp")}`).get().n;
  const audit = verifyChain();

  res.json({
    total, online, offline: total - online,
    incidents: inc,
    vibration_anomalies: vibAnom, temperature_warnings: tempW,
    offline_events: offEv, auth_failures: authFail,
    critical_events: crit, warning_events: warn, info_events: info,
    audit_status: audit.status,
  });
});

app.get("/api/reports/export.csv", auth, (req, res) => {
  const rows = db.prepare(`SELECT id, transformer_id, event_type, severity, description, status, timestamp FROM security_events ORDER BY id DESC`).all();

  const esc = (v) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const header = "Event ID,Transformer ID,Type,Severity,Description,Status,Timestamp";
  const body = rows.map((r) => [r.id, r.transformer_id, r.event_type, r.severity, r.description, r.status, r.timestamp].map(esc).join(",")).join("\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="infrasentinel_events.csv"');
  res.send(header + "\n" + body);
});

/* ================================================================ SETTINGS */
app.get("/api/settings", auth, (req, res) => {
  const rows = db.prepare("SELECT key, value FROM system_settings").all();
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  res.json(out);
});

app.put("/api/settings", auth, (req, res) => {
  const { polling_interval, auto_resolve_warning } = req.body || {};
  const up = db.prepare("INSERT OR REPLACE INTO system_settings(key,value) VALUES (?,?)");
  if (polling_interval !== undefined) up.run("polling_interval", String(polling_interval));
  if (auto_resolve_warning !== undefined) up.run("auto_resolve_warning", auto_resolve_warning ? "true" : "false");
  res.json({ ok: true });
});


/* ============================================================== FRONTEND */
// Look for the frontend in a few common layouts so hosting works whether the
// repo is  backend/ + frontend/  or  backend/public/  (never the backend folder itself,
// which would expose the database and source).
const FRONT_CANDIDATES = [
  process.env.FRONTEND_DIR,
  path.join(__dirname, "..", "frontend"),
  path.join(__dirname, "frontend"),
  path.join(__dirname, "public"),
].filter(Boolean);
const FRONT = FRONT_CANDIDATES.find((d) => fs.existsSync(path.join(d, "index.html")));

if (FRONT) {
  console.log("[web] serving frontend from", FRONT);
  app.use(express.static(FRONT, { extensions: ["html"] }));
  app.get("/", (req, res) => res.sendFile(path.join(FRONT, "index.html")));
} else {
  console.warn("[web] index.html not found — API only. Set FRONTEND_DIR to the folder containing it.");
}

/* ================================================================ FALLBACKS */
app.use("/api", (req, res) => res.status(404).json({ detail: "Not found" }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  if (err.type === "entity.parse.failed")
    return res.status(400).json({ detail: "Invalid JSON body" });
  res.status(500).json({ detail: "Internal server error" });
});

/* ==================================================================== START */
const PORT = process.env.PORT || 8000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`InfraSentinel API listening on port ${PORT}`);
});
