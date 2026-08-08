import { budgetStatus, handleMessage } from '../../../lib/finbot.js'
import { rateLimit, sanitizeMessage, sanitizeUserId } from '../../../lib/security.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const userId = sanitizeUserId(body.userId)
  if (!userId) return Response.json({ error: 'userId inválido' }, { status: 400 })

  const message = sanitizeMessage(body.message)
  if (!message.ok) return Response.json({ error: message.error }, { status: 400 })

  const limit = rateLimit(`chat:${userId}`)
  if (!limit.ok) {
    return Response.json(
      { error: 'Vas muy rápido, espera unos segundos.' },
      { status: 429, headers: { 'retry-after': String(limit.retryAfter) } },
    )
  }

  try {
    const result = await handleMessage(userId, message.text, 'web')
    return Response.json({ ...result, budget: budgetStatus(userId) })
  } catch (err) {
    // El detalle va al log del servidor; al cliente solo el mensaje genérico.
    console.error('[finbot] error atendiendo el chat:', err)
    return Response.json({ error: 'No pude procesar el mensaje' }, { status: 500 })
  }
}
