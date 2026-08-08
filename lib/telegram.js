const API = 'https://api.telegram.org'

export function botToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) throw new Error('Falta TELEGRAM_BOT_TOKEN en el entorno')
  return token
}

async function call(method, payload) {
  const res = await fetch(`${API}/bot${botToken()}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json()
  if (!data.ok) throw new Error(`Telegram ${method}: ${data.description}`)
  return data.result
}

export function sendMessage(chatId, text) {
  return call('sendMessage', { chat_id: chatId, text, disable_web_page_preview: true })
}

export function getUpdates(offset, timeout = 25) {
  return call('getUpdates', { offset, timeout, allowed_updates: ['message'] })
}

/** Registra el webhook público. Útil una sola vez desde la terminal. */
export function setWebhook(url, secret) {
  return call('setWebhook', {
    url,
    secret_token: secret,
    allowed_updates: ['message'],
    drop_pending_updates: true,
  })
}

/** Extrae texto y chat de un update; devuelve null si no es un mensaje de texto. */
export function readUpdate(update) {
  const message = update?.message
  const text = message?.text
  if (!message?.chat?.id || !text) return null
  return {
    chatId: message.chat.id,
    userId: `tg:${message.chat.id}`,
    text,
    name: message.from?.first_name ?? 'usuario',
  }
}
