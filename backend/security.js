/* Password hashing (PBKDF2-SHA256) + database-backed session tokens.
   Sessions live in SQLite (only a SHA-256 of the token is stored), so users
   stay signed in across server restarts and redeploys. */
const crypto = require("crypto");
const db = require("./db");

const PBKDF2_ITER = 200_000;
const KEY_LEN = 32;
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8h

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const dk = crypto.pbkdf2Sync(password, salt, PBKDF2_ITER, KEY_LEN, "sha256");
  return salt.toString("base64") + "$" + dk.toString("base64");
}

function verifyPassword(password, stored) {
  try {
    const [saltB64, hashB64] = stored.split("$");
    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(hashB64, "base64");
    const dk = crypto.pbkdf2Sync(password, salt, PBKDF2_ITER, KEY_LEN, "sha256");
    return crypto.timingSafeEqual(dk, expected);
  } catch {
    return false;
  }
}

/* ---- Sessions ---- */
const sha = (t) => crypto.createHash("sha256").update(t).digest("hex");

function createSession(user) {
  const token = crypto.randomBytes(32).toString("base64url");
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)")
    .run(sha(token), user.id, Date.now() + SESSION_TTL_MS);
  return token;
}

function getSession(token) {
  if (!token) return null;
  const row = db.prepare(
    `SELECT s.expires_at, u.id AS userId, u.email, u.name, u.role
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?`
  ).get(sha(token));
  if (!row) return null;
  if (row.expires_at < Date.now()) { revokeSession(token); return null; }
  return { userId: row.userId, email: row.email, name: row.name, role: row.role, exp: row.expires_at };
}

function revokeSession(token) {
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha(token));
}

function purgeExpiredSessions() {
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
}

module.exports = {
  hashPassword, verifyPassword,
  createSession, getSession, revokeSession, purgeExpiredSessions,
};
