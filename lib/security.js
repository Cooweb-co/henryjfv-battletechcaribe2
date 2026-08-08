// Defensas de las rutas HTTP: el chat es un endpoint abierto que gasta tokens
// de Claude y escribe en la base, así que valida antes de llegar a la lógica.

export const MAX_MESSAGE_LENGTH = 500
const USER_ID_PATTERN = /^[a-zA-Z0-9:_-]{1,64}$/

/** Devuelve el userId si es aceptable, o null. Evita ids gigantes o con formato raro. */
export function sanitizeUserId(raw) {
  const value = typeof raw === 'string' ? raw.trim() : ''
  return USER_ID_PATTERN.test(value) ? value : null
}

/** Normaliza el mensaje: recorta espacios y rechaza vacío o excesivamente largo. */
export function sanitizeMessage(raw) {
  if (typeof raw !== 'string') return { ok: false, error: 'El mensaje debe ser texto' }
  const text = raw.trim()
  if (!text) return { ok: false, error: 'El mensaje está vacío' }
  if (text.length > MAX_MESSAGE_LENGTH)
    return { ok: false, error: `El mensaje supera los ${MAX_MESSAGE_LENGTH} caracteres` }
  return { ok: true, text }
}

// Ventana deslizante en memoria. Suficiente para un despliegue de un proceso;
// con varias instancias esto se mueve a Redis.
const WINDOW_MS = 60_000
const MAX_REQUESTS = 20
const hits = new Map()

export function rateLimit(key, { max = MAX_REQUESTS, windowMs = WINDOW_MS } = {}) {
  const now = Date.now()
  const recientes = (hits.get(key) ?? []).filter((t) => now - t < windowMs)

  if (recientes.length >= max) {
    hits.set(key, recientes)
    return { ok: false, retryAfter: Math.ceil((windowMs - (now - recientes[0])) / 1000) }
  }

  recientes.push(now)
  hits.set(key, recientes)

  // Poda perezosa para que el Map no crezca sin límite.
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k)
  }

  return { ok: true, remaining: max - recientes.length }
}

export function resetRateLimit() {
  hits.clear()
}
