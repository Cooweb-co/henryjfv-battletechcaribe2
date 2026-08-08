import { createClient } from '@libsql/client'

// En producción (Vercel) el filesystem es de solo lectura y efímero, así que la
// base vive en Turso. En local, sin TURSO_DATABASE_URL, se usa un archivo.
const URL = process.env.TURSO_DATABASE_URL ?? `file:${process.env.FINBOT_DB ?? './data/finbot.db'}`
const AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN

// Una sola conexión por proceso. Next recarga módulos en dev, así que la
// guardamos en globalThis para no abrir N clientes.
export const db =
  globalThis.__finbotDb ?? (globalThis.__finbotDb = createClient({ url: URL, authToken: AUTH_TOKEN }))

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS expenses (
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
   )`,
  `CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON expenses (user_id, spent_at)`,
  `CREATE TABLE IF NOT EXISTS budgets (
     user_id    TEXT PRIMARY KEY,
     monthly    REAL NOT NULL CHECK (monthly > 0),
     currency   TEXT NOT NULL DEFAULT 'COP',
     updated_at TEXT NOT NULL DEFAULT (datetime('now'))
   )`,
  `CREATE TABLE IF NOT EXISTS messages (
     id         INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id    TEXT NOT NULL,
     role       TEXT NOT NULL,
     content    TEXT NOT NULL,
     source     TEXT NOT NULL DEFAULT 'web',
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   )`,
  `CREATE INDEX IF NOT EXISTS idx_messages_user ON messages (user_id, id)`,
]

// La migración corre una vez por proceso: se cachea la promesa, no el resultado,
// para que dos llamadas simultáneas no lancen dos veces el batch.
let migration
function ready() {
  migration ??= db.batch(SCHEMA, 'write')
  return migration
}

/**
 * libsql devuelve cada fila como array con propiedades nombradas, así que
 * JSON.stringify la serializaría como lista. Se convierte a objeto plano.
 */
function rows(result) {
  return result.rows.map((row) => Object.fromEntries(result.columns.map((col, i) => [col, row[i]])))
}

function first(result) {
  return rows(result)[0] ?? null
}

async function query(sql, args = []) {
  await ready()
  return db.execute({ sql, args })
}

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

export async function addExpense({
  userId,
  amount,
  currency = 'COP',
  category,
  description,
  source = 'web',
  rawText,
  spentAt,
}) {
  const cat = CATEGORIES.includes(category) ? category : 'otros'
  const date = spentAt ?? new Date().toISOString().slice(0, 10)
  const info = await query(
    `INSERT INTO expenses (user_id, amount, currency, category, description, source, raw_text, spent_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, amount, currency, cat, description ?? null, source, rawText ?? null, date],
  )
  return { id: Number(info.lastInsertRowid), amount, currency, category: cat, description, spentAt: date }
}

export async function listExpenses(userId, { month = currentMonth(), limit = 200 } = {}) {
  return rows(
    await query(
      `SELECT id, amount, currency, category, description, source, spent_at
       FROM expenses
       WHERE user_id = ? AND substr(spent_at, 1, 7) = ?
       ORDER BY spent_at DESC, id DESC
       LIMIT ?`,
      [userId, month, limit],
    ),
  )
}

export async function totalByCategory(userId, month = currentMonth()) {
  return rows(
    await query(
      `SELECT category, SUM(amount) AS total, COUNT(*) AS n
       FROM expenses
       WHERE user_id = ? AND substr(spent_at, 1, 7) = ?
       GROUP BY category
       ORDER BY total DESC`,
      [userId, month],
    ),
  )
}

export async function totalByDay(userId, month = currentMonth()) {
  return rows(
    await query(
      `SELECT spent_at AS day, SUM(amount) AS total
       FROM expenses
       WHERE user_id = ? AND substr(spent_at, 1, 7) = ?
       GROUP BY spent_at
       ORDER BY spent_at`,
      [userId, month],
    ),
  )
}

export async function monthlyTrend(userId, months = 6) {
  const result = rows(
    await query(
      `SELECT substr(spent_at, 1, 7) AS month, SUM(amount) AS total
       FROM expenses
       WHERE user_id = ?
       GROUP BY month
       ORDER BY month DESC
       LIMIT ?`,
      [userId, months],
    ),
  )
  return result.reverse()
}

export async function monthTotal(userId, month = currentMonth()) {
  const row = first(
    await query(
      `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS n
       FROM expenses
       WHERE user_id = ? AND substr(spent_at, 1, 7) = ?`,
      [userId, month],
    ),
  )
  return { total: row.total, count: row.n }
}

export async function lastExpense(userId) {
  return first(
    await query(
      `SELECT id, amount, currency, category, description, spent_at
       FROM expenses WHERE user_id = ? ORDER BY id DESC LIMIT 1`,
      [userId],
    ),
  )
}

/** Borra el último gasto registrado y lo devuelve, o null si no había ninguno. */
export async function deleteLastExpense(userId) {
  const last = await lastExpense(userId)
  if (!last) return null
  await query(`DELETE FROM expenses WHERE id = ?`, [last.id])
  return last
}

/** Corrige monto y/o categoría del último gasto. Devuelve {antes, despues}. */
export async function updateLastExpense(userId, { amount, category }) {
  const last = await lastExpense(userId)
  if (!last) return null

  const nuevoMonto = amount > 0 ? amount : last.amount
  const nuevaCategoria = category && CATEGORIES.includes(category) ? category : last.category

  await query(`UPDATE expenses SET amount = ?, category = ? WHERE id = ?`, [nuevoMonto, nuevaCategoria, last.id])
  return { antes: last, despues: { ...last, amount: nuevoMonto, category: nuevaCategoria } }
}

export async function getBudget(userId) {
  return first(await query(`SELECT monthly, currency FROM budgets WHERE user_id = ?`, [userId]))
}

export async function setBudget(userId, monthly, currency = 'COP') {
  await query(
    `INSERT INTO budgets (user_id, monthly, currency, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET monthly = excluded.monthly, currency = excluded.currency, updated_at = datetime('now')`,
    [userId, monthly, currency],
  )
  return { monthly, currency }
}

export async function saveMessage(userId, role, content, source = 'web') {
  await query(`INSERT INTO messages (user_id, role, content, source) VALUES (?, ?, ?, ?)`, [
    userId,
    role,
    content,
    source,
  ])
}

export async function recentMessages(userId, limit = 10) {
  const result = rows(
    await query(`SELECT role, content FROM messages WHERE user_id = ? ORDER BY id DESC LIMIT ?`, [userId, limit]),
  )
  return result.reverse()
}

/** Comprueba que la base responde. Se usa en /api/health. */
export async function ping() {
  const row = first(await query(`SELECT COUNT(*) AS n FROM expenses`))
  return row.n
}

export function currentMonth() {
  return new Date().toISOString().slice(0, 7)
}
