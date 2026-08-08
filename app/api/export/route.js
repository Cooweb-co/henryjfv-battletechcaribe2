import { currentMonth, listExpenses } from '../../../lib/db.js'
import { expensesToCsv } from '../../../lib/csv.js'
import { rateLimit, sanitizeUserId } from '../../../lib/security.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  const { searchParams } = new URL(request.url)

  const userId = sanitizeUserId(searchParams.get('userId'))
  if (!userId) return Response.json({ error: 'userId inválido' }, { status: 400 })

  const monthParam = searchParams.get('month')
  const month = /^\d{4}-\d{2}$/.test(monthParam ?? '') ? monthParam : currentMonth()

  const limit = rateLimit(`export:${userId}`, { max: 10 })
  if (!limit.ok) return Response.json({ error: 'Demasiadas descargas seguidas' }, { status: 429 })

  const csv = expensesToCsv(listExpenses(userId, { month, limit: 5000 }))

  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="finbot-${month}.csv"`,
    },
  })
}
