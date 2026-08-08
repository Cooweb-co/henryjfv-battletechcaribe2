import { handleMessage } from '../../../../lib/finbot.js'
import { readUpdate, sendMessage } from '../../../../lib/telegram.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request) {
  // Telegram reintenta si no devolvemos 200, así que respondemos 200 salvo en
  // el caso de secreto inválido: ahí sí queremos cortar la petición.
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (secret && request.headers.get('x-telegram-bot-api-secret-token') !== secret) {
    return Response.json({ error: 'secreto inválido' }, { status: 401 })
  }

  let update
  try {
    update = await request.json()
  } catch {
    return Response.json({ ok: true })
  }

  const parsed = readUpdate(update)
  if (!parsed) return Response.json({ ok: true })

  try {
    const { reply } = await handleMessage(parsed.userId, parsed.text, 'telegram')
    await sendMessage(parsed.chatId, reply)
  } catch (err) {
    console.error('[telegram] error atendiendo update:', err)
    try {
      await sendMessage(parsed.chatId, 'Tuve un problema procesando eso. Vuelve a intentarlo en un momento.')
    } catch {
      /* si Telegram tampoco responde, no hay nada más que hacer */
    }
  }

  return Response.json({ ok: true })
}
