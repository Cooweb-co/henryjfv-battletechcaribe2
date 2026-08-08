import { detectCategory, findAmount, interpret, sinTildes } from './ai.js'
import {
  CATEGORIES,
  addExpense,
  currentMonth,
  deleteLastExpense,
  getBudget,
  monthTotal,
  recentMessages,
  saveMessage,
  setBudget,
  totalByCategory,
  updateLastExpense,
} from './db.js'

import { buildInsights } from './insights.js'
import { CURRENCY, money } from './format.js'

export { money }

/**
 * Punto de entrada único del bot: recibe texto en lenguaje natural y devuelve
 * la respuesta ya con cifras reales de la base. Web y Telegram usan esto mismo.
 */
export async function handleMessage(userId, text, source = 'web') {
  const clean = (text ?? '').trim()
  if (!clean) return { reply: 'Escríbeme cuánto gastaste y en qué. Ejemplo: "12 mil en almuerzo".', intent: 'vacio' }

  // Comandos de Telegram y atajos, antes de gastar tokens en el modelo.
  const command = matchCommand(clean)
  if (command) return command(userId)

  await saveMessage(userId, 'user', clean, source)
  const parsed = await interpret(clean, await recentMessages(userId, 6))

  let reply
  if (parsed.budgetMonthly) {
    await setBudget(userId, parsed.budgetMonthly, CURRENCY)
    reply = `Listo, tu presupuesto mensual queda en ${money(parsed.budgetMonthly)}. ${await budgetLine(userId)}`
  } else if (parsed.expenses.length) {
    // Secuencial a propósito: el orden de inserción define cuál es "el último
    // gasto", y /deshacer y las correcciones dependen de eso.
    const saved = []
    for (const e of parsed.expenses) {
      saved.push(await addExpense({ userId, ...e, currency: CURRENCY, source, rawText: clean }))
    }
    const detalle = saved.map((s) => `${money(s.amount)} en ${s.category}`).join(', ')
    reply = `Anotado: ${detalle}. ${await budgetLine(userId)}`
  } else if (parsed.intent === 'resumen') {
    reply = await summaryText(userId)
  } else {
    reply = parsed.reply || 'No estoy seguro de haber entendido. ¿Cuánto gastaste y en qué?'
  }

  // budgetLine() vuelve vacía si no hay presupuesto: sin esto queda un espacio colgando.
  reply = reply.replace(/[ \t]+$/gm, '').trim()

  await saveMessage(userId, 'assistant', reply, source)
  return { reply, intent: parsed.intent, engine: parsed.engine, expenses: parsed.expenses }
}

function matchCommand(text) {
  // Sin tildes: "último" y "ultimo" deben disparar el mismo comando, y \b no
  // reconoce límites de palabra junto a caracteres acentuados.
  const lower = sinTildes(text.toLowerCase())
  if (/^\/(start|ayuda|help)/.test(lower)) return () => ({ reply: HELP, intent: 'ayuda' })
  if (/^\/(resumen|summary|mes)/.test(lower))
    return async (userId) => ({ reply: await summaryText(userId), intent: 'resumen' })
  if (/^\/categorias/.test(lower))
    return () => ({ reply: `Categorías disponibles:\n${CATEGORIES.map((c) => `· ${c}`).join('\n')}`, intent: 'ayuda' })

  // Deshacer: la corrección más común es "ese no iba".
  if (/^\/(deshacer|borrar)\b/.test(lower) || /\b(borra|elimina|deshaz|quita)\b.*\b(ultimo|ese|eso|gasto)\b/.test(lower)) {
    return async (userId) => {
      const borrado = await deleteLastExpense(userId)
      if (!borrado) return { reply: 'No hay ningún gasto reciente que borrar.', intent: 'deshacer' }
      return {
        reply: `Borré ${money(borrado.amount)} de ${borrado.category}. ${await budgetLine(userId)}`.trim(),
        intent: 'deshacer',
      }
    }
  }

  // Corregir el último gasto: monto, categoría o ambos.
  if (/\b(corrige|corrigelo|cambia|cambialo|en realidad|no eran|no fueron|eran|fueron)\b/.test(lower)) {
    const amount = findAmount(lower, { last: true })
    const category = detectCategory(lower)
    if (amount || category) {
      return async (userId) => {
        const cambio = await updateLastExpense(userId, { amount, category })
        if (!cambio) return { reply: 'Todavía no tienes gastos que corregir.', intent: 'corregir' }
        const { antes, despues } = cambio
        const partes = []
        if (antes.amount !== despues.amount) partes.push(`${money(antes.amount)} → ${money(despues.amount)}`)
        if (antes.category !== despues.category) partes.push(`${antes.category} → ${despues.category}`)
        if (!partes.length) return { reply: 'Ese gasto ya estaba así, no cambié nada.', intent: 'corregir' }
        return { reply: `Corregido: ${partes.join(', ')}. ${await budgetLine(userId)}`.trim(), intent: 'corregir' }
      }
    }
  }

  const budget = lower.match(/^\/presupuesto\s+([\d.,]+)/)
  if (budget) {
    const monto = Number(budget[1].replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.'))
    return async (userId) => {
      if (!(monto > 0)) return { reply: 'Usa: /presupuesto 1500000', intent: 'presupuesto' }
      await setBudget(userId, monto, CURRENCY)
      return { reply: `Presupuesto mensual fijado en ${money(monto)}.`, intent: 'presupuesto' }
    }
  }
  return null
}

/** Resumen del mes: total, presupuesto y desglose por categoría. */
export async function summaryText(userId, month = currentMonth()) {
  const { total, count } = await monthTotal(userId, month)
  if (!count) return `Todavía no tienes gastos registrados en ${month}. Cuéntame el primero.`

  const categorias = await totalByCategory(userId, month)
  const porCategoria = categorias
    .map((c) => `· ${c.category}: ${money(c.total)} (${Math.round((c.total / total) * 100)}%)`)
    .join('\n')

  const observaciones = await buildInsights(userId, month)

  return [
    `Resumen de ${month}`,
    `Total gastado: ${money(total)} en ${count} movimientos.`,
    porCategoria,
    await budgetLine(userId, month),
    observaciones.length ? `\n${observaciones.map((o) => `· ${o}`).join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

/** Línea de presupuesto con alerta si se pasó del límite o va camino a pasarse. */
export async function budgetLine(userId, month = currentMonth()) {
  const budget = await getBudget(userId)
  if (!budget) return ''
  const { total } = await monthTotal(userId, month)
  const pct = Math.round((total / budget.monthly) * 100)
  const restante = budget.monthly - total

  if (total > budget.monthly)
    return `ALERTA: te pasaste del presupuesto en ${money(total - budget.monthly)} (${pct}% de ${money(budget.monthly)}).`
  if (pct >= 80) return `Atención: llevas ${pct}% del presupuesto, te quedan ${money(restante)}.`
  return `Vas en ${pct}% del presupuesto, te quedan ${money(restante)}.`
}

export async function budgetStatus(userId, month = currentMonth()) {
  const budget = await getBudget(userId)
  const { total } = await monthTotal(userId, month)
  if (!budget) return { monthly: null, spent: total, pct: null, over: false, message: '' }
  return {
    monthly: budget.monthly,
    spent: total,
    pct: Math.round((total / budget.monthly) * 100),
    over: total > budget.monthly,
    message: await budgetLine(userId, month),
  }
}

const HELP = `Soy FinBot, tu asesor financiero.

Escríbeme en lenguaje natural:
· "gasté 20 mil en café"
· "12.000 taxi y 45 mil mercado"
· "¿cuánto llevo este mes?"

Si te equivocas, dímelo:
· "no eran 20 mil, eran 30 mil"
· "borra el último"

Comandos:
/resumen — gastos del mes por categoría
/presupuesto 1500000 — fija tu tope mensual
/deshacer — borra el último gasto registrado
/categorias — lista las categorías disponibles`
