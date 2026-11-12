/* Demo data on first boot: users, 5 Limpopo transformers, recent readings */
const db = require("./db");
const { hashPassword } = require("./security");
const { appendAudit } = require("./audit");

const DEMO_TRANSFORMERS = [
  ["TX-001", "Thohoyandou Main Substation", "Thohoyandou, Limpopo", -23.0489, 30.4834, 132.0],
  ["TX-002", "Sibasa Distribution",         "Sibasa, Limpopo",      -22.9578, 30.4717, 66.0],
  ["TX-003", "Makhado Grid Node",           "Makhado, Limpopo",     -23.0422, 29.9047, 132.0],
  ["TX-004", "Musina Border Feed",          "Musina, Limpopo",      -22.3412, 30.0430, 220.0],
  ["TX-005", "Polokwane Central",           "Polokwane, Limpopo",   -23.9045, 29.4689, 132.0],
];

function seed() {
  const now = new Date().toISOString();

  // Users
  const userCount = db.prepare("SELECT COUNT(*) n FROM users").get().n;
  if (userCount === 0) {
    const ins = db.prepare(`INSERT INTO users
      (name, email, password_hash, role, created_at) VALUES (?,?,?,?,?)`);
    ins.run("Admin Operator", "admin@infrasentinel.local",
            hashPassword("Sentinel@2024"), "admin", now);
    ins.run("Field Analyst", "analyst@infrasentinel.local",
            hashPassword("Analyst@2024"), "operator", now);
  }

  // Transformers + readings
  const txCount = db.prepare("SELECT COUNT(*) n FROM transformers").get().n;
  if (txCount === 0) {
    const insTx = db.prepare(`INSERT INTO transformers
      (code, name, location, lat, lng, voltage_kv, last_seen, created_at)
      VALUES (?,?,?,?,?,?,?,?)`);
    const insRead = db.prepare(`INSERT INTO sensor_readings
      (transformer_id, temperature, vibration, timestamp)
      VALUES (?,?,?,?)`);

    for (const row of DEMO_TRANSFORMERS) {
      const info = insTx.run(...row, now, now);
      const tid = info.lastInsertRowid;

      // 20 synthetic readings, one per minute, oldest→newest
      for (let i = 0; i < 20; i++) {
        const ts = new Date(Date.now() - (20 - i) * 60_000).toISOString();
        const temp = +(55 + (Math.random() * 6 - 3)).toFixed(2);
        const vib  = +(0.5 + (Math.random() * 0.2 - 0.1)).toFixed(3);
        insRead.run(tid, temp, vib, ts);
      }
    }
  }

  // Starter activity so the dashboard and audit trail are not empty on first load
  const auditCount = db.prepare("SELECT COUNT(*) n FROM audit_logs").get().n;
  if (auditCount === 0) {
    const insEv = db.prepare(`INSERT INTO security_events
      (transformer_id,event_type,severity,description,status,timestamp) VALUES (?,?,?,?,?,?)`);
    const txs = db.prepare("SELECT id, code FROM transformers ORDER BY id").all();
    appendAudit(null, "InfraSentinel initialised");
    for (const t of txs) {
      insEv.run(t.id, "TRANSFORMER_REGISTERED", "INFO", `Transformer ${t.code} registered`, "RESOLVED", now);
      appendAudit(t.id, `Transformer ${t.code} registered`);
    }
  }

  // Settings
  const stCount = db.prepare("SELECT COUNT(*) n FROM system_settings").get().n;
  if (stCount === 0) {
    const ins = db.prepare("INSERT INTO system_settings(key,value) VALUES (?,?)");
    ins.run("polling_interval", "5");
    ins.run("auto_resolve_warning", "false");
  }
}

module.exports = seed;