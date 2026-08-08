const COLUMNS = [
  ['spent_at', 'fecha'],
  ['category', 'categoria'],
  ['description', 'descripcion'],
  ['amount', 'monto'],
  ['currency', 'moneda'],
  ['source', 'origen'],
]

/**
 * Escapa un valor para CSV. Además de comillas y saltos de línea, neutraliza la
 * inyección de fórmulas: una celda que empieza por = + - @ se ejecuta al abrir
 * el archivo en Excel o Sheets, y la descripción viene de texto del usuario.
 */
export function escapeCell(value) {
  let text = value === null || value === undefined ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Convierte filas de gastos a CSV con encabezado en español. */
export function expensesToCsv(rows) {
  const header = COLUMNS.map(([, label]) => label).join(',')
  const body = rows.map((row) => COLUMNS.map(([key]) => escapeCell(row[key])).join(','))
  return [header, ...body].join('\n')
}
