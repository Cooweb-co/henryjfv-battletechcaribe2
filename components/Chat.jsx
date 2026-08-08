'use client'

import { useEffect, useRef, useState } from 'react'

const SALUDO =
  'Hola, soy FinBot. Cuéntame en qué gastaste y lo registro. Prueba con "gasté 20 mil en café" o pídeme "/resumen".'

// Arrancar desde cero cuesta: estos atajos muestran de qué es capaz el bot.
const SUGERENCIAS = ['gasté 20 mil en café', '35000 mercado y 8000 bus', '/presupuesto 1500000', '/resumen']

export default function Chat({ userId, onUpdate }) {
  const [messages, setMessages] = useState([{ role: 'bot', text: SALUDO }])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [engine, setEngine] = useState(null)
  const logRef = useRef(null)

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  async function send(event, preset) {
    event?.preventDefault()
    const text = (preset ?? input).trim()
    if (!text || sending) return

    setMessages((prev) => [...prev, { role: 'user', text }])
    setInput('')
    setSending(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: text, userId }),
      })
      const data = await res.json()
      setMessages((prev) => [
        ...prev,
        { role: 'bot', text: data.reply ?? data.error ?? 'Algo falló procesando el mensaje.' },
      ])
      if (data.engine) setEngine(data.engine)
      onUpdate?.()
    } catch {
      setMessages((prev) => [...prev, { role: 'bot', text: 'No pude conectarme al servidor. Intenta otra vez.' }])
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="card">
      <h2>Chat</h2>
      <div className="chat-log" ref={logRef} role="log" aria-live="polite" aria-label="Conversación con FinBot">
        {messages.map((m, i) => (
          <div key={i} className={`msg-row ${m.role}`}>
            {m.role === 'bot' && <span className="avatar" aria-hidden="true">FB</span>}
            <div className={`msg ${m.role}`}>{m.text}</div>
          </div>
        ))}
        {sending && (
          <div className="msg-row bot">
            <span className="avatar" aria-hidden="true">FB</span>
            <div className="msg bot typing" aria-label="FinBot está respondiendo">
              Pensando…
            </div>
          </div>
        )}
      </div>

      <form className="chat-form" onSubmit={send}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="gasté 35 mil en mercado"
          aria-label="Mensaje para FinBot"
        />
        <button type="submit" disabled={sending || !input.trim()}>
          Enviar
        </button>
      </form>
      <div className="chips">
        {SUGERENCIAS.map((s) => (
          <button key={s} type="button" className="chip" onClick={() => send(null, s)} disabled={sending}>
            {s}
          </button>
        ))}
      </div>

      <p className="hints">Comandos: /resumen · /presupuesto 1500000 · /deshacer · /ayuda</p>
      {engine === 'heuristica' && (
        <p className="hints">Sin ANTHROPIC_API_KEY: estoy interpretando con reglas locales, no con Claude.</p>
      )}
    </section>
  )
}
