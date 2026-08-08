import Database from 'better-sqlite3'
import path from 'node:path'
import fs from 'node:fs'

// Una sola conexión por proceso. Next recarga módulos en dev, así que la
// guardamos en globalThis para no abrir el archivo N veces.
const DB_PATH = process.env.FINBOT_DB ?? path.join(process.cwd(), 'data', 'finbot.db')

function open() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })
  const db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  migrate(db)
  return db
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS expenses (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     TEXT    NOT NULL,
      amount      REAL    NOT NULL CHECK (amount > 0),
      currency    TEXT    NOT NULL DEFAULT 'COP',
      category    TEXT    NOT NULL,
      description TEXT,
      source      TEXT    NOT NULL DEFAULT 'web',
      raw_text    TEXT,
      spent_at    TEXT    NOT NULL,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON expenses (user_id, spent_at);

    CREATE TABLE IF NOT EXISTS budgets (
      user_id    TEXT PRIMARY KEY,
      monthly    REAL NOT NULL CHECK (monthly > 0),
      currency   TEXT NOT NULL DEFAULT 'COP',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    TEXT NOT NULL,
      role       TEXT NOT NULL,
      content    TEXT NOT NULL,
      source     TEXT NOT NULL DEFAULT 'web',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_messages_user ON messages (user_id, id);
  `)
}

export const db = globalThis.__finbotDb ?? (globalThis.__finbotDb = open())

export const CATEGORIES = [
  'alimentacion',
  'transporte',
  'vivienda',
  'servicios',
  'salud',
  'entretenimiento',
  'educacion',
  'compras',
  'otros',
]

export function addExpense({ userId, amount, currency = 'COP', category, description, source = 'web', rawText, spentAt }) {
  const cat = CATEGORIES.includes(category) ? category : 'otros'
  const date = spentAt ?? new Date().toISOString().slice(0, 10)
  const info = db
    .prepare(
      `INSERT INTO expenses (user_id, amount, currency, category, description, source, raw_text, spent_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(userId, amount, currency, cat, description ?? null, source, rawText ?? null, date)
  return { id: info.lastInsertRowid, amount, currency, category: cat, description, spentAt: date }
}

export function listExpenses(userId, { month = currentMonth(), limit = 200 } = {}) {
  return db
    .prepare(
      `SELECT id, amount, currency, category, description, source, spent_at
       FROM expenses
       WHERE user_id = ? AND substr(spent_at, 1, 7) = ?
       ORDER BY spent_at DESC, id DESC
       LIMIT ?`,
    )
    .all(userId, month, limit)
}

export function totalByCategory(userId, month = currentMonth()) {
  return db
    .prepare(
      `SELECT category, SUM(amount) AS total, COUNT(*) AS n
       FROM expenses
       WHERE user_id = ? AND substr(spent_at, 1, 7) = ?
       GROUP BY category
       ORDER BY total DESC`,
    )
    .all(userId, month)
}

export function totalByDay(userId, month = currentMonth()) {
  return db
    .prepare(
      `SELECT spent_at AS day, SUM(amount) AS total
       FROM expenses
       WHERE user_id = ? AND substr(spent_at, 1, 7) = ?
       GROUP BY spent_at
       ORDER BY spent_at`,
    )
    .all(userId, month)
}

export function monthlyTrend(userId, months = 6) {
  return db
    .prepare(
      `SELECT substr(spent_at, 1, 7) AS month, SUM(amount) AS total
       FROM expenses
       WHERE user_id = ?
       GROUP BY month
       ORDER BY month DESC
       LIMIT ?`,
    )
    .all(userId, months)
    .reverse()
}

export function monthTotal(userId, month = currentMonth()) {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS n
       FROM expenses
       WHERE user_id = ? AND substr(spent_at, 1, 7) = ?`,
    )
    .get(userId, month)
  return { total: row.total, count: row.n }
}

export function lastExpense(userId) {
  return (
    db
      .prepare(
        `SELECT id, amount, currency, category, description, spent_at
         FROM expenses WHERE user_id = ? ORDER BY id DESC LIMIT 1`,
      )
      .get(userId) ?? null
  )
}

/** Borra el último gasto registrado y lo devuelve, o null si no había ninguno. */
export function deleteLastExpense(userId) {
  const last = lastExpense(userId)
  if (!last) return null
  db.prepare(`DELETE FROM expenses WHERE id = ?`).run(last.id)
  return last
}

/** Corrige monto y/o categoría del último gasto. Devuelve {antes, despues}. */
export function updateLastExpense(userId, { amount, category }) {
  const last = lastExpense(userId)
  if (!last) return null

  const nuevoMonto = amount > 0 ? amount : last.amount
  const nuevaCategoria = category && CATEGORIES.includes(category) ? category : last.category

  db.prepare(`UPDATE expenses SET amount = ?, category = ? WHERE id = ?`).run(nuevoMonto, nuevaCategoria, last.id)
  return { antes: last, despues: { ...last, amount: nuevoMonto, category: nuevaCategoria } }
}

export function getBudget(userId) {
  return db.prepare(`SELECT monthly, currency FROM budgets WHERE user_id = ?`).get(userId) ?? null
}

export function setBudget(userId, monthly, currency = 'COP') {
  db.prepare(
    `INSERT INTO budgets (user_id, monthly, currency, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET monthly = excluded.monthly, currency = excluded.currency, updated_at = datetime('now')`,
  ).run(userId, monthly, currency)
  return { monthly, currency }
}

export function saveMessage(userId, role, content, source = 'web') {
  db.prepare(`INSERT INTO messages (user_id, role, content, source) VALUES (?, ?, ?, ?)`).run(
    userId,
    role,
    content,
    source,
  )
}

export function recentMessages(userId, limit = 10) {
  return db
    .prepare(`SELECT role, content FROM messages WHERE user_id = ? ORDER BY id DESC LIMIT ?`)
    .all(userId, limit)
    .reverse()
}

export function currentMonth() {
  return new Date().toISOString().slice(0, 7)
}
