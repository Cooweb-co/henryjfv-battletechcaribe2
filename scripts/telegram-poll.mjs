#!/usr/bin/env node
// Worker de long polling: alternativa al webhook para desarrollo local,
// donde no hay URL pública que Telegram pueda llamar.
//
//   TELEGRAM_BOT_TOKEN=... ANTHROPIC_API_KEY=... npm run telegram

import { handleMessage } from '../lib/finbot.js'
import { getUpdates, readUpdate, sendMessage } from '../lib/telegram.js'

let offset = 0
let running = true

process.on('SIGINT', () => {
  running = false
  console.log('\nCerrando el worker de Telegram…')
})

console.log('FinBot escuchando Telegram (Ctrl+C para salir)')

while (running) {
  try {
    const updates = await getUpdates(offset)
    for (const update of updates) {
      offset = update.update_id + 1
      const parsed = readUpdate(update)
      if (!parsed) continue

      console.log(`← ${parsed.name}: ${parsed.text}`)
      const { reply } = await handleMessage(parsed.userId, parsed.text, 'telegram')
      await sendMessage(parsed.chatId, reply)
      console.log(`→ ${reply.split('\n')[0]}`)
    }
  } catch (err) {
    console.error('[telegram] fallo el ciclo de polling:', err.message)
    await new Promise((r) => setTimeout(r, 3000))
  }
}
