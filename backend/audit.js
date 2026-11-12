/* SHA-256 hash-chained audit trail */
const crypto = require("crypto");
const db = require("./db");

const GENESIS = "0".repeat(64);

function canonical(record) {
  // Deterministic representation → sorted keys, no whitespace
  return JSON.stringify({
    event_id: record.event_id,
    transformer_id: record.transformer_id ?? null,
    description: record.description,
    timestamp: record.timestamp,
  });
}

function lastHash() {
  const row = db.prepare(
    "SELECT curr_hash FROM audit_logs ORDER BY id DESC LIMIT 1"
  ).get();
  return row ? row.curr_hash : GENESIS;
}

function appendAudit(transformerId, description) {
  const timestamp = new Date().toISOString();
  const event_id = crypto.randomUUID();
  const prev = lastHash();
  const rec = { event_id, transformer_id: transformerId ?? null, description, timestamp };
  const curr = crypto
    .createHash("sha256")
    .update(prev + canonical(rec))
    .digest("hex");

  db.prepare(`INSERT INTO audit_logs
    (event_id, transformer_id, description, prev_hash, curr_hash, timestamp)
    VALUES (?,?,?,?,?,?)`)
    .run(event_id, transformerId ?? null, description, prev, curr, timestamp);

  return { event_id, prev_hash: prev, curr_hash: curr, timestamp };
}

function verifyChain() {
  const rows = db.prepare("SELECT * FROM audit_logs ORDER BY id ASC").all();
  let prev = GENESIS;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rec = {
      event_id: r.event_id,
      transformer_id: r.transformer_id,
      description: r.description,
      timestamp: r.timestamp,
    };
    const expected = crypto
      .createHash("sha256")
      .update(prev + canonical(rec))
      .digest("hex");

    if (r.prev_hash !== prev || r.curr_hash !== expected) {
      return {
        status: "TAMPERING DETECTED",
        checked: i + 1,
        broken_at: r.event_id,
        index: r.id,
      };
    }
    prev = r.curr_hash;
  }
  return { status: "VERIFIED", checked: rows.length, broken_at: null };
}

module.exports = { appendAudit, verifyChain };