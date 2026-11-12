/* SQLite setup + schema.
   Driver selection (both expose the same prepare/get/all/run/exec API):
     1. better-sqlite3  – used when installed (prebuilt binaries on most hosts)
     2. node:sqlite     – built in to Node 22.13+ / 24, no compilation needed
   Auto-creates the database on first run.
   Set DATA_DIR (e.g. a mounted disk) to keep the database across deploys.
*/
const path = require("path");
const fs = require("fs");

const DATA_DIR = process.env.DATA_DIR || __dirname;
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, "infrasentinel.db");

function open(file) {
  try {
    const Better = require("better-sqlite3");
    console.log("[db] driver: better-sqlite3");
    return new Better(file);
  } catch (e) {
    try {
      const { DatabaseSync } = require("node:sqlite");
      console.log("[db] driver: node:sqlite");
      return new DatabaseSync(file);
    } catch (e2) {
      console.error(
        "No SQLite driver available. Run `npm install` (better-sqlite3) or use Node 22.13+ / 24."
      );
      throw e2;
    }
  }
}

const db = open(DB_PATH);

/* PRAGMAs (exec instead of pragma() for node:sqlite compatibility) */
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'operator',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transformers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  lat REAL,
  lng REAL,
  voltage_kv REAL NOT NULL,
  baseline_vibration REAL DEFAULT 0.5,
  warn_threshold REAL DEFAULT 1.5,
  crit_threshold REAL DEFAULT 3.0,
  max_temp REAL DEFAULT 85.0,
  status TEXT DEFAULT 'ONLINE',
  health TEXT DEFAULT 'NORMAL',
  last_seen TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sensor_readings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transformer_id INTEGER NOT NULL,
  temperature REAL NOT NULL,
  vibration REAL NOT NULL,
  timestamp TEXT NOT NULL,
  FOREIGN KEY(transformer_id) REFERENCES transformers(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_readings_t ON sensor_readings(transformer_id, id);

CREATE TABLE IF NOT EXISTS security_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transformer_id INTEGER,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT DEFAULT 'OPEN',
  timestamp TEXT NOT NULL,
  FOREIGN KEY(transformer_id) REFERENCES transformers(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_events_ts ON security_events(timestamp);

CREATE TABLE IF NOT EXISTS incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT UNIQUE NOT NULL,
  transformer_id INTEGER,
  incident_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  description TEXT NOT NULL,
  notes TEXT DEFAULT '',
  assigned_to TEXT DEFAULT '',
  status TEXT DEFAULT 'OPEN',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(transformer_id) REFERENCES transformers(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL,
  transformer_id INTEGER,
  description TEXT NOT NULL,
  prev_hash TEXT NOT NULL,
  curr_hash TEXT NOT NULL,
  timestamp TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT UNIQUE NOT NULL,
  transformer_id INTEGER,
  secret_hash TEXT NOT NULL,
  authorized INTEGER DEFAULT 1,
  last_auth TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS authentication_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  success INTEGER NOT NULL,
  reason TEXT,
  timestamp TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_event_id TEXT UNIQUE NOT NULL,
  transformer_id INTEGER,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  description TEXT NOT NULL,
  client_timestamp TEXT NOT NULL,
  synced INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
`);

module.exports = db;