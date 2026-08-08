import { db } from '../../../lib/db.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Chequeo de salud: confirma que la base responde y qué motor de extracción hay. */
export async function GET() {
  try {
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM expenses').get()
    return Response.json({
      ok: true,
      db: 'ok',
      expenses: n,
      engine: process.env.ANTHROPIC_API_KEY ? 'claude' : 'heuristica',
    })
  } catch (err) {
    console.error('[finbot] health falló:', err)
    return Response.json({ ok: false, db: 'error' }, { status: 503 })
  }
}
