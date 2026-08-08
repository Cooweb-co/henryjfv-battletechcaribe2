import { currentMonth, listExpenses, monthlyTrend, monthTotal, totalByCategory, totalByDay } from '../../../lib/db.js'
import { budgetStatus } from '../../../lib/finbot.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('userId') || 'web-demo'
  const month = searchParams.get('month') || currentMonth()

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
    latest: listExpenses(userId, { month, limit: 8 }),
  })
}
