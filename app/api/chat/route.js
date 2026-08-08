import { handleMessage } from '../../../lib/finbot.js'
import { budgetStatus } from '../../../lib/finbot.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const message = typeof body.message === 'string' ? body.message : ''
  const userId = String(body.userId || 'web-demo')

  if (!message.trim()) return Response.json({ error: 'Mensaje vacío' }, { status: 400 })

  try {
    const result = await handleMessage(userId, message, 'web')
    return Response.json({ ...result, budget: budgetStatus(userId) })
  } catch (err) {
    console.error('[finbot] error atendiendo el chat:', err)
    return Response.json({ error: 'No pude procesar el mensaje', detail: err.message }, { status: 500 })
  }
}
