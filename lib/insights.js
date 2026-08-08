import { currentMonth, getBudget, monthTotal, totalByCategory, totalByDay } from './db.js'
import { money } from './format.js'

/** Mes anterior en formato YYYY-MM. */
export function previousMonth(month = currentMonth()) {
  const [y, m] = month.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 2, 1))
  return date.toISOString().slice(0, 7)
}

function daysInMonth(month) {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/**
 * Proyecta el cierre del mes con el ritmo de gasto observado hasta hoy.
 * Solo aplica al mes en curso: en meses cerrados el total ya es el cierre.
 */
export async function projection(userId, month = currentMonth()) {
  const { total } = await monthTotal(userId, month)
  const total_dias = daysInMonth(month)
  const hoy = new Date().toISOString().slice(0, 10)
  const diaActual = month === currentMonth() ? Number(hoy.slice(8)) : total_dias
  if (!total || diaActual < 3) return null // muy temprano: la proyección sería ruido

  const promedioDiario = total / diaActual
  return {
    dia: diaActual,
    diasDelMes: total_dias,
    promedioDiario: Math.round(promedioDiario),
    proyectado: Math.round(promedioDiario * total_dias),
  }
}

/**
 * Observaciones sobre el comportamiento de gasto, en frases listas para mostrar.
 * Todas se calculan sobre la base: el modelo no interviene, así que no hay
 * riesgo de cifras inventadas.
 */
export async function buildInsights(userId, month = currentMonth()) {
  const out = []
  const { total, count } = await monthTotal(userId, month)
  if (!count) return out

  // 1. Comparación con el mes anterior.
  const anterior = await monthTotal(userId, previousMonth(month))
  if (anterior.count) {
    const delta = total - anterior.total
    const pct = Math.round(Math.abs(delta / anterior.total) * 100)
    out.push(
      delta >= 0
        ? `Vas ${pct}% por encima del mes pasado (${money(anterior.total)} → ${money(total)}).`
        : `Vas ${pct}% por debajo del mes pasado (${money(anterior.total)} → ${money(total)}). Buen ritmo.`,
    )
  }

  // 2. Concentración del gasto.
  const categorias = await totalByCategory(userId, month)
  const top = categorias[0]
  if (top && categorias.length > 1) {
    const peso = Math.round((top.total / total) * 100)
    if (peso >= 40) out.push(`${peso}% de tu gasto está en ${top.category}: ahí es donde más peso puedes recortar.`)
  }

  // 3. Proyección de cierre contra el presupuesto.
  const proy = await projection(userId, month)
  const budget = await getBudget(userId)
  if (proy) {
    if (budget && proy.proyectado > budget.monthly) {
      out.push(
        `A ${money(proy.promedioDiario)} por día terminarías el mes en ${money(proy.proyectado)}, ` +
          `${money(proy.proyectado - budget.monthly)} sobre tu presupuesto. Bajar a ` +
          `${money(Math.floor(budget.monthly / proy.diasDelMes))} diarios te devuelve al carril.`,
      )
    } else if (budget) {
      out.push(`A este ritmo cerrarías el mes en ${money(proy.proyectado)}, dentro de tu presupuesto.`)
    } else {
      out.push(`A ${money(proy.promedioDiario)} por día, cerrarías el mes en ${money(proy.proyectado)}.`)
    }
  }

  // 4. Día más caro, útil para reconocer patrones (fines de semana, quincena).
  const dias = await totalByDay(userId, month)
  if (dias.length > 2) {
    const peor = dias.reduce((a, b) => (b.total > a.total ? b : a))
    if (peor.total > total * 0.35) out.push(`Tu día más caro fue el ${peor.day.slice(8)} con ${money(peor.total)}.`)
  }

  return out
}
