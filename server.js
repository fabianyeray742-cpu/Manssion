const express = require("express");
const session = require("express-session");
const sqlite3 = require("sqlite3").verbose();
const QRCode = require("qrcode");
const crypto = require("crypto");
const path = require("path");

const app = express();

const dbFile = process.env.DB_FILE || "data.sqlite";
const db = new sqlite3.Database(dbFile, (err) => {
  if (err) {
    console.error("Error al abrir la base de datos", err.message);
  } else {
    console.log("Conectado a la base de datos SQLite.");
  }
});

db.run("PRAGMA journal_mode = WAL;");
db.run(`
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
  db.get("SELECT COUNT(*) as total, SUM(CASE WHEN used_at IS NOT NULL THEN 1 ELSE 0 END) as used FROM tickets", [], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    const total = row?.total || 0;
    const used = row?.used || 0;
    res.json({ total, used, pending: total - used });
  });
});

app.get("/api/tickets", requireAuth, (req, res) => {
  db.all("SELECT id, guest, ticket_type, created_at, used_at FROM tickets ORDER BY created_at DESC LIMIT 500", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.post("/api/tickets", requireAuth, async (req, res) => {
  const guest = String(req.body?.guest || "").trim().slice(0, 100);
  const ticketType = String(req.body?.ticketType || "General").trim().slice(0, 40) || "General";
  const amount = Math.max(1, Math.min(100, Number.parseInt(req.body?.amount, 10) || 1));
  const created = [];

  db.serialize(() => {
    db.run("BEGIN TRANSACTION");
    const stmt = db.prepare("INSERT INTO tickets (id, code, guest, ticket_type, created_at) VALUES (?, ?, ?, ?, ?)");
    for (let i = 0; i < amount; i++) {
      const id = crypto.randomUUID();
      const code = crypto.randomBytes(24).toString("hex");
      const createdAt = new Date().toISOString();
      stmt.run(id, code, guest, ticketType, createdAt);
      created.push({ id, code, guest, ticketType });
    }
    stmt.finalize();
    db.run("COMMIT", async (err) => {
      if (err) return res.status(500).json({ error: err.message });
      try {
        const withQr = await Promise.all(created.map(async t => ({ 
          ...t, 
          qr: await QRCode.toDataURL(JSON.stringify({ event: "LA MANSION", code: t.code }), { margin: 1, width: 320, errorCorrectionLevel: "M" }) 
        })));
        res.json({ tickets: withQr });
      } catch (e) {
        res.status(500).json({ error: "Error generando códigos QR" });
      }
    });
  });
});

app.post("/api/validate", requireAuth, (req, res) => {
  const code = String(req.body?.code || "").trim();
  if (!code) return res.status(400).json({ status: "invalid", message: "No se detectó ningún código." });

  db.get("SELECT id, guest, ticket_type, created_at, used_at FROM tickets WHERE code = ?", [code], (err, ticket) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!ticket) return res.status(404).json({ status: "invalid", message: "QR no reconocido. Entrada no válida." });
    if (ticket.used_at) return res.status(409).json({ status: "used", message: "ENTRADA YA VALIDADA", ticket });

    const now = new Date().toISOString();
    db.run("UPDATE tickets SET used_at = ? WHERE id = ? AND used_at IS NULL", [now, ticket.id], function(updateErr) {
      if (updateErr) return res.status(500).json({ error: updateErr.message });
      if (this.changes !== 1) {
        db.get("SELECT id, guest, ticket_type, created_at, used_at FROM tickets WHERE id = ?", [ticket.id], (err2, latest) => {
          return res.status(409).json({ status: "used", message: "ENTRADA YA VALIDADA", ticket: latest });
        });
        return;
      }
      db.get("SELECT id, guest, ticket_type, created_at, used_at FROM tickets WHERE id = ?", [ticket.id], (err3, validated) => {
        res.json({ status: "valid", message: "ACCESO PERMITIDO", ticket: validated });
      });
    });
  });
});

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
const port = Number(process.env.PORT || 3000);
app.listen(port, "0.0.0.0", () => console.log(`LA MANSION listo en http://localhost:${port}`));


