import Anthropic from '@anthropic-ai/sdk'
import { CATEGORIES } from './db.js'

const MODEL = 'claude-opus-5'

// Esquema de extracción. Sin nulos: 0 y "" significan "no aplica", así el
// modelo no tiene que elegir entre tipos y el parseo del lado nuestro es trivial.
const SCHEMA = {
  type: 'object',
  properties: {
    intent: {
      type: 'string',
      enum: ['registrar_gasto', 'resumen', 'presupuesto', 'consulta', 'ambiguo'],
      description: 'Qué quiere hacer la persona en este mensaje.',
    },
    expenses: {
      type: 'array',
      description: 'Gastos detectados en el mensaje. Vacío si no hay ninguno.',
      items: {
        type: 'object',
        properties: {
          amount: { type: 'number', description: 'Monto en la moneda local. "20 mil" = 20000.' },
          category: { type: 'string', enum: CATEGORIES },
          description: { type: 'string', description: 'Qué se compró, en pocas palabras.' },
          spent_at: { type: 'string', description: 'Fecha YYYY-MM-DD, o "" si es hoy.' },
        },
        required: ['amount', 'category', 'description', 'spent_at'],
        additionalProperties: false,
      },
    },
    budget_monthly: {
      type: 'number',
      description: 'Presupuesto mensual si la persona lo está definiendo; 0 si no.',
    },
    reply: {
      type: 'string',
      description:
        'Respuesta conversacional en español, máximo 2 frases. Si el mensaje es ambiguo, pregunta lo que falta (monto o categoría).',
    },
  },
  required: ['intent', 'expenses', 'budget_monthly', 'reply'],
  additionalProperties: false,
}

const SYSTEM = `Eres FinBot, un asesor financiero personal que conversa por chat.

Tu trabajo en cada mensaje:
1. Detectar si la persona está registrando uno o varios gastos y extraer monto, categoría y descripción.
2. Interpretar montos coloquiales: "20 mil" = 20000, "1.5k" = 1500, "$15.000" = 15000, "dos lucas" = 2000.
3. Si el mensaje pide un resumen, usa intent "resumen". Si define un presupuesto, "presupuesto".
4. Si hay monto pero no se entiende en qué se gastó, o hay categoría pero no monto, usa intent "ambiguo",
   deja expenses vacío y pregunta en "reply" exactamente el dato que falta. Nunca inventes montos.
5. Responde en español, breve y directo, sin emojis. El sistema añade después las cifras exactas,
   así que no inventes totales ni saldos: en "reply" solo confirma o pregunta.`

let client = null
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null
  client ??= new Anthropic()
  return client
}

/** Interpreta un mensaje de lenguaje natural. Usa Claude si hay API key; si no, heurística local. */
export async function interpret(text, history = []) {
  const anthropic = getClient()
  if (!anthropic) return fallbackParse(text)

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: SYSTEM,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [
        ...history.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
        { role: 'user', content: text },
      ],
    })

    if (response.stop_reason === 'refusal') return fallbackParse(text)
    const block = response.content.find((b) => b.type === 'text')
    if (!block) return fallbackParse(text)
    return normalize(JSON.parse(block.text))
  } catch (err) {
    console.error('[finbot] fallo la extracción con Claude, uso heurística local:', err.message)
    return fallbackParse(text)
  }
}

function normalize(parsed) {
  return {
    intent: parsed.intent ?? 'consulta',
    expenses: (parsed.expenses ?? [])
      .filter((e) => Number(e.amount) > 0)
      .map((e) => ({
        amount: Number(e.amount),
        category: CATEGORIES.includes(e.category) ? e.category : 'otros',
        description: e.description || '',
        spentAt: /^\d{4}-\d{2}-\d{2}$/.test(e.spent_at) ? e.spent_at : null,
      })),
    budgetMonthly: Number(parsed.budget_monthly) > 0 ? Number(parsed.budget_monthly) : null,
    reply: parsed.reply ?? '',
    engine: 'claude',
  }
}

// ---------------------------------------------------------------------------
// Heurística local: mantiene el bot funcional sin API key y sirve de red de
// seguridad si la llamada a Claude falla.
// ---------------------------------------------------------------------------

const KEYWORDS = {
  alimentacion: ['cafe', 'café', 'almuerzo', 'comida', 'mercado', 'restaurante', 'desayuno', 'cena', 'pizza', 'super'],
  transporte: ['taxi', 'uber', 'bus', 'gasolina', 'metro', 'parqueadero', 'peaje', 'didi'],
  vivienda: ['arriendo', 'alquiler', 'renta', 'administracion', 'administración', 'hipoteca'],
  servicios: ['luz', 'agua', 'internet', 'celular', 'gas', 'netflix', 'spotify', 'plan'],
  salud: ['farmacia', 'medico', 'médico', 'droga', 'eps', 'gimnasio', 'gym'],
  entretenimiento: ['cine', 'bar', 'cerveza', 'fiesta', 'concierto', 'juego', 'salida'],
  educacion: ['curso', 'libro', 'universidad', 'colegio', 'matricula', 'matrícula'],
  compras: ['ropa', 'zapatos', 'tecnologia', 'tecnología', 'amazon', 'regalo', 'mercadolibre'],
}

export function fallbackParse(text) {
  const lower = text.toLowerCase()

  if (/(resumen|cuánto|cuanto llevo|gast[eé] este mes|balance|reporte)/.test(lower)) {
    return { intent: 'resumen', expenses: [], budgetMonthly: null, reply: '', engine: 'heuristica' }
  }

  const budget = lower.match(/presupuesto\D{0,20}([\d.,]+)\s*(k|mil|millones|millón|millon)?/)
  if (budget) {
    return {
      intent: 'presupuesto',
      expenses: [],
      budgetMonthly: parseAmount(budget[1], budget[2]),
      reply: '',
      engine: 'heuristica',
    }
  }

  const money = lower.match(/(?:\$\s*)?([\d][\d.,]*)\s*(k|mil|lucas|millones|millón|millon)?/)
  const amount = money ? parseAmount(money[1], money[2]) : 0
  if (!amount) {
    return {
      intent: 'ambiguo',
      expenses: [],
      budgetMonthly: null,
      reply: '¿Cuánto gastaste y en qué? Por ejemplo: "20 mil en café".',
      engine: 'heuristica',
    }
  }

  const category = detectCategory(lower)
  if (!category) {
    return {
      intent: 'ambiguo',
      expenses: [],
      budgetMonthly: null,
      reply: `Registré el monto ${amount} pero no entendí en qué fue. ¿En qué lo gastaste?`,
      engine: 'heuristica',
    }
  }

  return {
    intent: 'registrar_gasto',
    expenses: [{ amount, category, description: text.slice(0, 120), spentAt: null }],
    budgetMonthly: null,
    reply: '',
    engine: 'heuristica',
  }
}

export function detectCategory(lower) {
  for (const [category, words] of Object.entries(KEYWORDS)) {
    if (words.some((w) => lower.includes(w))) return category
  }
  return null
}

export function parseAmount(raw, suffix) {
  // "15.000" y "15,000" son quince mil; "15.5" con sufijo k es 15500.
  let n = Number(raw.replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) return 0
  if (suffix) {
    if (/^(k|mil|lucas)$/.test(suffix)) n *= 1000
    else n *= 1_000_000
  }
  return Math.round(n)
}

/**
 * Extrae un monto de texto libre, o 0 si no hay.
 * `last: true` toma el último monto mencionado — en "no eran 20 mil, eran 30 mil"
 * el dato bueno es el segundo, no el primero.
 */
export function findAmount(text, { last = false } = {}) {
  const matches = [...text.toLowerCase().matchAll(/(?:\$\s*)?([\d][\d.,]*)\s*(k|mil|lucas|millones|millón|millon)?/g)]
  if (!matches.length) return 0
  const m = last ? matches[matches.length - 1] : matches[0]
  return parseAmount(m[1], m[2])
}

/** Quita tildes para que los comandos casen con o sin acento ("último" / "ultimo"). */
export function sinTildes(text) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}
