const express = require("express");
const session = require("express-session");
const Database = require("better-sqlite3");
const QRCode = require("qrcode");
const crypto = require("crypto");
const path = require("path");

const app = express();
const db = new Database(process.env.DB_FILE || "data.sqlite");
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS tickets (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    guest TEXT NOT NULL DEFAULT '',
    ticket_type TEXT NOT NULL DEFAULT 'General',
    created_at TEXT NOT NULL,
    used_at TEXT
  )
`);

app.use(express.json({ limit: "100kb" }));
app.use(session({
  name: "la_mansion_session",
  secret: process.env.SESSION_SECRET || "DEV-ONLY-change-this-before-deploying",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 8 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, "public")));

const LOGIN_USER = process.env.LOGIN_USER || "MANSSION";
const LOGIN_PASSWORD = process.env.LOGIN_PASSWORD || "2020";
const requireAuth = (req, res, next) => req.session?.authenticated ? next() : res.status(401).json({ error: "Inicia sesión para continuar." });

app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== "string" || typeof password !== "string" ||
      username !== LOGIN_USER || password !== LOGIN_PASSWORD) {
    return res.status(401).json({ error: "Usuario o contraseña incorrectos." });
  }
  req.session.authenticated = true;
  req.session.username = LOGIN_USER;
  res.json({ ok: true, username: LOGIN_USER });
});
app.post("/api/logout", (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get("/api/me", (req, res) => res.json({ authenticated: !!req.session?.authenticated, username: req.session?.username || null }));

app.get("/api/stats", requireAuth, (req, res) => {
  const total = db.prepare("SELECT COUNT(*) n FROM tickets").get().n;
  const used = db.prepare("SELECT COUNT(*) n FROM tickets WHERE used_at IS NOT NULL").get().n;
  res.json({ total, used, pending: total - used });
});
app.get("/api/tickets", requireAuth, (req, res) => {
  const rows = db.prepare("SELECT id, guest, ticket_type, created_at, used_at FROM tickets ORDER BY created_at DESC LIMIT 500").all();
  res.json(rows);
});
app.post("/api/tickets", requireAuth, async (req, res) => {
  const guest = String(req.body?.guest || "").trim().slice(0, 100);
  const ticketType = String(req.body?.ticketType || "General").trim().slice(0, 40) || "General";
  const amount = Math.max(1, Math.min(100, Number.parseInt(req.body?.amount, 10) || 1));
  const created = [];
  const insert = db.prepare("INSERT INTO tickets (id, code, guest, ticket_type, created_at) VALUES (?, ?, ?, ?, ?)");
  const batch = db.transaction(() => {
    for (let i = 0; i < amount; i++) {
      const id = crypto.randomUUID();
      const code = crypto.randomBytes(24).toString("hex");
      insert.run(id, code, guest, ticketType, new Date().toISOString());
      created.push({ id, code, guest, ticketType });
    }
  });
  batch();
  const withQr = await Promise.all(created.map(async t => ({ ...t, qr: await QRCode.toDataURL(JSON.stringify({ event: "LA MANSION", code: t.code }), { margin: 1, width: 320, errorCorrectionLevel: "M" }) })));
  res.json({ tickets: withQr });
});
app.post("/api/validate", requireAuth, (req, res) => {
  const code = String(req.body?.code || "").trim();
  if (!code) return res.status(400).json({ status: "invalid", message: "No se detectó ningún código." });
  const ticket = db.prepare("SELECT id, guest, ticket_type, created_at, used_at FROM tickets WHERE code = ?").get(code);
  if (!ticket) return res.status(404).json({ status: "invalid", message: "QR no reconocido. Entrada no válida." });
  if (ticket.used_at) return res.status(409).json({ status: "used", message: "ENTRADA YA VALIDADA", ticket });
  // Atomic conditional update prevents two devices from validating the same ticket simultaneously.
  const result = db.prepare("UPDATE tickets SET used_at = ? WHERE id = ? AND used_at IS NULL").run(new Date().toISOString(), ticket.id);
  if (result.changes !== 1) {
    const latest = db.prepare("SELECT id, guest, ticket_type, created_at, used_at FROM tickets WHERE id = ?").get(ticket.id);
    return res.status(409).json({ status: "used", message: "ENTRADA YA VALIDADA", ticket: latest });
  }
  const validated = db.prepare("SELECT id, guest, ticket_type, created_at, used_at FROM tickets WHERE id = ?").get(ticket.id);
  res.json({ status: "valid", message: "ACCESO PERMITIDO", ticket: validated });
});

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
const port = Number(process.env.PORT || 3000);
app.listen(port, "0.0.0.0", () => console.log(`LA MANSION listo en http://localhost:${port}`));
