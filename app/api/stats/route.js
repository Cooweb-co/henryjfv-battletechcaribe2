import { currentMonth, listExpenses, monthlyTrend, monthTotal, totalByCategory, totalByDay } from '../../../lib/db.js'
import { budgetStatus } from '../../../lib/finbot.js'
import { buildInsights, projection } from '../../../lib/insights.js'
import { rateLimit, sanitizeUserId } from '../../../lib/security.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const userId = sanitizeUserId(searchParams.get('userId'))
  if (!userId) return Response.json({ error: 'userId inválido' }, { status: 400 })

  const monthParam = searchParams.get('month')
  const month = /^\d{4}-\d{2}$/.test(monthParam ?? '') ? monthParam : currentMonth()

  const limit = rateLimit(`stats:${userId}`, { max: 60 })
  if (!limit.ok) return Response.json({ error: 'Demasiadas consultas' }, { status: 429 })

  const { total, count } = monthTotal(userId, month)
  const byCategory = totalByCategory(userId, month)

  return Response.json({
    month,
    total,
    count,
    average: count ? Math.round(total / count) : 0,
    topCategory: byCategory[0]?.category ?? null,
    byCategory,
    byDay: totalByDay(userId, month),
    trend: monthlyTrend(userId, 6),
    budget: budgetStatus(userId, month),
    insights: buildInsights(userId, month),
    projection: projection(userId, month),
    latest: listExpenses(userId, { month, limit: 8 }),
  })
}
