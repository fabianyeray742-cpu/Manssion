const express = require("express");
const session = require("express-session");
const sqlite3 = require("sqlite3").verbose();
const QRCode = require("qrcode");
const crypto = require("crypto");
const path = require("path");

const app = express();

const dbFile = process.env.DB_FILE || "data.db";
const db = new sqlite3.Database(dbFile, (err) => {
    if (err) {
        console.error("Error al abrir la base de datos:", err.message);
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

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

app.use(
    session({
        secret: crypto.randomBytes(32).toString("hex"),
        resave: false,
        saveUninitialized: false,
    })
);

// Ruta principal para servir index.html
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

// Middleware de autenticación
function requireAuth(req, res, next) {
    if (req.session && req.session.authenticated) {
        return next();
    }
    res.status(401).json({ error: "No autorizado" });
}

// Login
app.post("/api/login", (req, res) => {
    const { username, password } = req.body;
    if (username === "MANSSION" && password === "2020") {
        req.session.authenticated = true;
        return res.json({ success: true });
    }
    res.status(401).json({ success: false, error: "Credenciales inválidas" });
});

app.post("/api/logout", (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// Generar Ticket(s) soportando cantidad
app.post("/api/tickets", requireAuth, (req, res) => {
    const { guest, ticket_type, quantity } = req.body;
    const count = parseInt(quantity) || 1;
    const createdTickets = [];

    let completed = 0;
    for (let i = 0; i < count; i++) {
        const id = crypto.randomUUID();
        const code = crypto.randomBytes(4).toString("hex").toUpperCase();
        const created_at = new Date().toISOString();

        db.run(
            `INSERT INTO tickets (id, code, guest, ticket_type, created_at) VALUES (?, ?, ?, ?, ?)`,
            [id, code, guest || "Invitado", ticket_type || "General", created_at],
            function (err) {
                if (!err) {
                    QRCode.toDataURL(code, (err, qr_image) => {
                        createdTickets.push({ id, code, guest, ticket_type, qr_image, created_at });
                        completed++;
                        if (completed === count) {
                            res.json({ success: true, tickets: createdTickets });
                        }
                    });
                } else {
                    completed++;
                    if (completed === count && createdTickets.length === 0) {
                        res.status(500).json({ error: err.message });
                    }
                }
            }
        );
    }
});

// Listar Tickets con la propiedad que espera el cliente
app.get("/api/tickets", requireAuth, (req, res) => {
    db.all(`SELECT * FROM tickets ORDER BY created_at DESC`, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ tickets: rows });
    });
});

// Validar Ticket por Código
app.post("/api/validate", requireAuth, (req, res) => {
    const { code } = req.body;
    if (!code) {
        return res.status(400).json({ valid: false, error: "Código requerido" });
    }
    db.get(`SELECT * FROM tickets WHERE code = ?`, [code.trim().toUpperCase()], (err, ticket) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (!ticket) {
            return res.status(404).json({ valid: false, error: "Ticket no encontrado" });
        }
        if (ticket.used_at) {
            return res.json({ valid: false, error: `Ticket ya fue usado el ${ticket.used_at}`, ticket });
        }

        const used_at = new Date().toISOString();
        db.run(`UPDATE tickets SET used_at = ? WHERE code = ?`, [used_at, ticket.code], (err) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            ticket.used_at = used_at;
            res.json({ valid: true, message: "Acceso concedido", ticket });
        });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});
