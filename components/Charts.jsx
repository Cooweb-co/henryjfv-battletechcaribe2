'use client'

import { useState } from 'react'

// Paleta validada (scripts/validate_palette.js del skill dataviz): pasa banda de
// luminosidad, piso de croma, separación CVD y contraste en claro y oscuro.
const SERIES_1 = 'var(--series-1)' // acumulado / magnitud
const SERIES_2 = 'var(--series-2)' // presupuesto

const fmt = (n) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n ?? 0)

const compact = (n) => new Intl.NumberFormat('es-CO', { notation: 'compact', maximumFractionDigits: 1 }).format(n ?? 0)

const titulo = (texto) => (texto ? texto[0].toUpperCase() + texto.slice(1) : texto)

function useTooltip() {
  const [tip, setTip] = useState(null)
  const show = (event, text) => {
    const box = event.currentTarget.ownerSVGElement.getBoundingClientRect()
    setTip({ x: event.clientX - box.left, y: event.clientY - box.top, text })
  }
  return [tip, show, () => setTip(null)]
}

function Tooltip({ tip }) {
  if (!tip) return null
  return (
    <div className="tooltip" style={{ left: tip.x, top: tip.y }}>
      {tip.text}
    </div>
  )
}

/** Barras horizontales: magnitud por categoría, una sola tinta + etiqueta directa. */
export function CategoryBars({ data }) {
  const [tip, show, hide] = useTooltip()
  if (!data.length) return <p className="empty">Registra tu primer gasto para ver el desglose.</p>

  const max = Math.max(...data.map((d) => d.total))
  const rowH = 30
  const height = data.length * rowH + 8
  const labelW = 118
  const width = 520
  const trackW = width - labelW - 78

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Gasto del mes por categoría" onMouseLeave={hide}>
        {data.map((d, i) => {
          const w = Math.max(3, (d.total / max) * trackW)
          const y = i * rowH + 4
          return (
            <g key={d.category}>
              <text x={0} y={y + 15} className="tick label" dominantBaseline="middle">
                {titulo(d.category)}
              </text>
              <rect
                x={labelW}
                y={y + 4}
                width={w}
                height={16}
                rx={4}
                fill={SERIES_1}
                onMouseMove={(e) => show(e, `${titulo(d.category)}: ${fmt(d.total)} · ${d.n} mov.`)}
              />
              <text x={labelW + w + 8} y={y + 15} className="value" dominantBaseline="middle">
                {compact(d.total)}
              </text>
            </g>
          )
        })}
      </svg>
      <Tooltip tip={tip} />
    </div>
  )
}

/** Línea de gasto acumulado del mes contra la línea de presupuesto. */
export function CumulativeLine({ byDay, budget }) {
  const [tip, show, hide] = useTooltip()
  if (!byDay.length) return <p className="empty">Aún no hay movimientos este mes.</p>

  let running = 0
  const points = byDay.map((d) => ({ day: d.day.slice(8), total: (running += d.total) }))
  const width = 520
  const height = 200
  const pad = { l: 46, r: 12, t: 12, b: 26 }
  const max = Math.max(running, budget?.monthly ?? 0) * 1.08 || 1
  const x = (i) => pad.l + (points.length === 1 ? 0 : (i * (width - pad.l - pad.r)) / (points.length - 1))
  const y = (v) => height - pad.b - (v / max) * (height - pad.t - pad.b)
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.total)}`).join(' ')
  const budgetY = budget?.monthly ? y(budget.monthly) : null

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Gasto acumulado del mes" onMouseLeave={hide}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={pad.l} x2={width - pad.r} y1={y(max * f)} y2={y(max * f)} className="grid" />
            <text x={pad.l - 8} y={y(max * f)} className="tick" textAnchor="end" dominantBaseline="middle">
              {compact(max * f)}
            </text>
          </g>
        ))}

        {budgetY !== null && (
          <>
            <line x1={pad.l} x2={width - pad.r} y1={budgetY} y2={budgetY} stroke={SERIES_2} strokeWidth="2" strokeDasharray="6 4" />
            <text x={width - pad.r} y={budgetY - 6} className="value" textAnchor="end" fill={SERIES_2}>
              presupuesto {compact(budget.monthly)}
            </text>
          </>
        )}

        <path d={path} fill="none" stroke={SERIES_1} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <circle
            key={p.day}
            cx={x(i)}
            cy={y(p.total)}
            r={4}
            fill={SERIES_1}
            stroke="var(--surface)"
            strokeWidth="2"
            onMouseMove={(e) => show(e, `Día ${p.day}: ${fmt(p.total)} acumulado`)}
          />
        ))}

        {points.map((p, i) =>
          i === 0 || i === points.length - 1 || points.length < 8 ? (
            <text key={`t-${p.day}`} x={x(i)} y={height - 8} className="tick" textAnchor="middle">
              {p.day}
            </text>
          ) : null,
        )}
      </svg>
      <Tooltip tip={tip} />
      <div className="legend">
        <span>
          <i className="swatch" style={{ background: SERIES_1 }} /> Gasto acumulado
        </span>
        {budgetY !== null && (
          <span>
            <i className="swatch" style={{ background: SERIES_2 }} /> Presupuesto mensual
          </span>
        )}
      </div>
    </div>
  )
}

/** Tendencia mes a mes: comparación de magnitud entre periodos. */
export function MonthlyTrend({ data }) {
  const [tip, show, hide] = useTooltip()
  if (data.length < 2) return <p className="empty">Con al menos dos meses de datos verás tu tendencia aquí.</p>

  const width = 520
  const height = 180
  const pad = { l: 46, r: 12, t: 12, b: 26 }
  const max = Math.max(...data.map((d) => d.total)) * 1.1 || 1
  const slot = (width - pad.l - pad.r) / data.length
  const barW = Math.min(46, slot - 12) // el hueco deja los 2px de superficie entre barras

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Gasto total por mes" onMouseLeave={hide}>
        <line x1={pad.l} x2={width - pad.r} y1={height - pad.b} y2={height - pad.b} className="grid" />
        {data.map((d, i) => {
          const h = Math.max(3, (d.total / max) * (height - pad.t - pad.b))
          const x = pad.l + i * slot + (slot - barW) / 2
          return (
            <g key={d.month}>
              <rect
                x={x}
                y={height - pad.b - h}
                width={barW}
                height={h}
                rx={4}
                fill={SERIES_1}
                onMouseMove={(e) => show(e, `${d.month}: ${fmt(d.total)}`)}
              />
              <text x={x + barW / 2} y={height - 8} className="tick" textAnchor="middle">
                {d.month.slice(5)}
              </text>
            </g>
          )
        })}
      </svg>
      <Tooltip tip={tip} />
    </div>
  )
}
