'use client'

import { useCallback, useEffect, useState } from 'react'
import { CategoryBars, CumulativeLine, MonthlyTrend } from './Charts'

const fmt = (n) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n ?? 0)

export default function Dashboard({ userId, version }) {
  const [stats, setStats] = useState(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/stats?userId=${encodeURIComponent(userId)}`, { cache: 'no-store' })
      setStats(await res.json())
    } catch {
      /* si falla la carga dejamos la vista anterior en pantalla */
    }
  }, [userId])

  useEffect(() => {
    load()
  }, [load, version])

  // Esqueleto en vez de texto: la página no salta de altura cuando llegan los datos.
  if (!stats) {
    return (
      <div className="charts-stack" aria-busy="true" aria-label="Cargando tus datos">
        <div className="stat-row">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="stat">
              <div className="skeleton line short" />
              <div className="skeleton line" />
            </div>
          ))}
        </div>
        <section className="card">
          <div className="skeleton line short" />
          <div className="skeleton block" />
        </section>
        <section className="card">
          <div className="skeleton line short" />
          <div className="skeleton block tall" />
        </section>
      </div>
    )
  }

  const budget = stats.budget
  const pct = budget.pct ?? 0
  const fillClass = budget.over ? 'over' : pct >= 80 ? 'warn' : ''

  return (
    <div className="charts-stack">
      <div className="stat-row">
        <div className="stat">
          <div className="label">Gastado en {stats.month}</div>
          <div className="value">{fmt(stats.total)}</div>
        </div>
        <div className="stat">
          <div className="label">Movimientos</div>
          <div className="value">{stats.count}</div>
        </div>
        <div className="stat">
          <div className="label">Ticket promedio</div>
          <div className="value">{fmt(stats.average)}</div>
        </div>
        <div className="stat">
          <div className="label">Categoría dominante</div>
          <div className="value">
            {stats.topCategory ? stats.topCategory[0].toUpperCase() + stats.topCategory.slice(1) : '—'}
          </div>
        </div>
      </div>

      {stats.insights?.length > 0 && (
        <section className="card">
          <h2>Qué dicen tus números</h2>
          <ul className="insights">
            {stats.insights.map((linea, i) => (
              <li key={i}>{linea}</li>
            ))}
          </ul>
        </section>
      )}

      {budget.monthly && (
        <section className="card">
          <h2>Presupuesto</h2>
          <div>
            {fmt(budget.spent)} de {fmt(budget.monthly)} · {pct}%
          </div>
          <div className="bar-track">
            <div className={`bar-fill ${fillClass}`} style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
          <div className={`alert ${budget.over ? '' : 'ok'}`}>{budget.message}</div>
        </section>
      )}

      <section className="card">
        <h2>En qué se te va la plata</h2>
        <CategoryBars data={stats.byCategory} />
      </section>

      <section className="card">
        <h2>Ritmo del mes vs presupuesto</h2>
        <CumulativeLine byDay={stats.byDay} budget={budget} />
      </section>

      <section className="card">
        <h2>Tendencia de los últimos meses</h2>
        <MonthlyTrend data={stats.trend} />
      </section>

      {stats.latest.length > 0 && (
        <section className="card">
          <div className="card-head">
            <h2>Últimos movimientos</h2>
            <a className="link-btn" href={`/api/export?userId=${encodeURIComponent(userId)}&month=${stats.month}`}>
              Exportar CSV
            </a>
          </div>
          <table className="movs">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Categoría</th>
                <th>Detalle</th>
                <th className="num">Monto</th>
              </tr>
            </thead>
            <tbody>
              {stats.latest.map((e) => (
                <tr key={e.id}>
                  <td>{e.spent_at}</td>
                  <td>{e.category}</td>
                  <td>{e.description || '—'}</td>
                  <td className="num">{fmt(e.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}
