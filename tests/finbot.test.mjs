import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Base aislada por corrida: los tests no tocan data/finbot.db.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-test-'))
process.env.FINBOT_DB = path.join(tmp, 'test.db')
delete process.env.ANTHROPIC_API_KEY // fuerza la ruta heurística, sin red

const { fallbackParse } = await import('../lib/ai.js')
const { handleMessage, budgetStatus, summaryText } = await import('../lib/finbot.js')
const { monthTotal, totalByCategory } = await import('../lib/db.js')

test('interpreta montos coloquiales', () => {
  assert.equal(fallbackParse('gasté 20 mil en café').expenses[0].amount, 20000)
  assert.equal(fallbackParse('$15.000 en taxi').expenses[0].amount, 15000)
  assert.equal(fallbackParse('2 lucas de bus').expenses[0].amount, 2000)
  assert.equal(fallbackParse('1.5k en cine').expenses[0].amount, 1500)
})

test('asigna categoría por palabra clave', () => {
  assert.equal(fallbackParse('30000 mercado').expenses[0].category, 'alimentacion')
  assert.equal(fallbackParse('8000 uber').expenses[0].category, 'transporte')
  assert.equal(fallbackParse('900000 arriendo').expenses[0].category, 'vivienda')
})

test('no inventa montos cuando el mensaje es ambiguo', () => {
  const parsed = fallbackParse('compré algo carísimo')
  assert.equal(parsed.intent, 'ambiguo')
  assert.equal(parsed.expenses.length, 0)
  assert.match(parsed.reply, /cuánto/i)
})

test('pide la categoría cuando hay monto pero no concepto', () => {
  const parsed = fallbackParse('se me fueron 40 mil ayer')
  assert.equal(parsed.intent, 'ambiguo')
  assert.equal(parsed.expenses.length, 0)
})

test('detecta la intención de resumen', () => {
  assert.equal(fallbackParse('¿cuánto llevo este mes?').intent, 'resumen')
})

test('persiste el gasto y lo suma al mes', async () => {
  const user = 'test-persistencia'
  await handleMessage(user, 'gasté 20 mil en café', 'test')
  await handleMessage(user, '30000 taxi', 'test')

  const { total, count } = monthTotal(user)
  assert.equal(total, 50000)
  assert.equal(count, 2)

  const categorias = totalByCategory(user).map((c) => c.category)
  assert.deepEqual(categorias.sort(), ['alimentacion', 'transporte'])
})

test('alerta cuando el gasto supera el presupuesto', async () => {
  const user = 'test-presupuesto'
  await handleMessage(user, '/presupuesto 50000', 'test')
  await handleMessage(user, '20000 almuerzo', 'test')

  let estado = budgetStatus(user)
  assert.equal(estado.over, false)
  assert.equal(estado.pct, 40)

  const { reply } = await handleMessage(user, '45000 taxi', 'test')
  assert.match(reply, /ALERTA/)

  estado = budgetStatus(user)
  assert.equal(estado.over, true)
  assert.equal(estado.spent, 65000)
})

test('avisa al 80% del presupuesto antes de pasarse', async () => {
  const user = 'test-umbral'
  await handleMessage(user, '/presupuesto 100000', 'test')
  await handleMessage(user, '85000 mercado', 'test')

  const estado = budgetStatus(user)
  assert.equal(estado.over, false)
  assert.match(estado.message, /Atención/)
})

test('el resumen desglosa por categoría con porcentajes', async () => {
  const user = 'test-resumen'
  await handleMessage(user, '75000 mercado', 'test')
  await handleMessage(user, '25000 uber', 'test')

  const texto = summaryText(user)
  assert.match(texto, /Total gastado/)
  assert.match(texto, /alimentacion: .*75/)
  assert.match(texto, /75%/)
  assert.match(texto, /25%/)
})

test('los usuarios no ven los gastos de otros', async () => {
  await handleMessage('test-ana', '10000 cafe', 'test')
  await handleMessage('test-luis', '99000 arriendo', 'test')

  assert.equal(monthTotal('test-ana').total, 10000)
  assert.equal(monthTotal('test-luis').total, 99000)
})

test('un mensaje vacío no rompe el bot', async () => {
  const { reply } = await handleMessage('test-vacio', '   ', 'test')
  assert.match(reply, /gastaste/i)
})

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }))

// --- corrección y deshacer ------------------------------------------------

const { lastExpense } = await import('../lib/db.js')

test('corrige el monto del último gasto', async () => {
  const user = 'test-correccion'
  await handleMessage(user, '20 mil en café', 'test')

  const { reply } = await handleMessage(user, 'no eran 20 mil, eran 30 mil', 'test')
  assert.match(reply, /Corregido/)
  assert.equal(lastExpense(user).amount, 30000)
  assert.equal(monthTotal(user).total, 30000)
})

test('corrige la categoría del último gasto', async () => {
  const user = 'test-recategoriza'
  await handleMessage(user, '18000 almuerzo', 'test')

  await handleMessage(user, 'en realidad fue un taxi', 'test')
  assert.equal(lastExpense(user).category, 'transporte')
  assert.equal(lastExpense(user).amount, 18000)
})

test('borra el último gasto y ajusta el total', async () => {
  const user = 'test-deshacer'
  await handleMessage(user, '10000 cafe', 'test')
  await handleMessage(user, '90000 mercado', 'test')

  const { reply } = await handleMessage(user, 'borra el último', 'test')
  assert.match(reply, /Borré/)
  assert.equal(monthTotal(user).total, 10000)
})

test('deshacer sin gastos previos no rompe', async () => {
  const { reply } = await handleMessage('test-deshacer-vacio', '/deshacer', 'test')
  assert.match(reply, /No hay ningún gasto/)
})

// --- insights -------------------------------------------------------------

const { buildInsights, previousMonth, projection } = await import('../lib/insights.js')

test('calcula el mes anterior incluso cruzando de año', () => {
  assert.equal(previousMonth('2026-08'), '2026-07')
  assert.equal(previousMonth('2026-01'), '2025-12')
})

test('proyecta el cierre del mes con el ritmo observado', async () => {
  const user = 'test-proyeccion'
  await handleMessage(user, '100000 mercado', 'test')

  const proy = projection(user)
  if (proy) {
    assert.ok(proy.promedioDiario > 0)
    assert.ok(proy.proyectado >= 100000)
    assert.equal(proy.proyectado, Math.round(proy.promedioDiario * proy.diasDelMes))
  }
})

test('avisa cuando el gasto se concentra en una categoría', async () => {
  const user = 'test-concentracion'
  await handleMessage(user, '900000 arriendo', 'test')
  await handleMessage(user, '10000 cafe', 'test')

  const texto = buildInsights(user).join(' ')
  assert.match(texto, /vivienda/)
})

test('sin gastos no inventa observaciones', () => {
  assert.deepEqual(buildInsights('test-sin-datos'), [])
})

// --- defensas de las rutas ------------------------------------------------

const { rateLimit, resetRateLimit, sanitizeMessage, sanitizeUserId } = await import('../lib/security.js')

test('valida el formato del userId', () => {
  assert.equal(sanitizeUserId('web-a1b2c3d4'), 'web-a1b2c3d4')
  assert.equal(sanitizeUserId('tg:123456'), 'tg:123456')
  assert.equal(sanitizeUserId(''), null)
  assert.equal(sanitizeUserId('con espacios'), null)
  assert.equal(sanitizeUserId('../../etc/passwd'), null)
  assert.equal(sanitizeUserId('x'.repeat(65)), null)
  assert.equal(sanitizeUserId(42), null)
})

test('rechaza mensajes vacíos o desmedidos', () => {
  assert.equal(sanitizeMessage('  hola  ').text, 'hola')
  assert.equal(sanitizeMessage('   ').ok, false)
  assert.equal(sanitizeMessage('a'.repeat(501)).ok, false)
  assert.equal(sanitizeMessage(null).ok, false)
})

test('el límite de tasa corta el abuso y aísla por clave', () => {
  resetRateLimit()
  for (let i = 0; i < 5; i++) assert.equal(rateLimit('u1', { max: 5 }).ok, true)

  const bloqueado = rateLimit('u1', { max: 5 })
  assert.equal(bloqueado.ok, false)
  assert.ok(bloqueado.retryAfter > 0)

  assert.equal(rateLimit('u2', { max: 5 }).ok, true)
  resetRateLimit()
})

// --- exportación ----------------------------------------------------------

const { escapeCell, expensesToCsv } = await import('../lib/csv.js')
const { listExpenses } = await import('../lib/db.js')

test('escapa comillas, comas y saltos de línea', () => {
  assert.equal(escapeCell('café'), 'café')
  assert.equal(escapeCell('taxi, aeropuerto'), '"taxi, aeropuerto"')
  assert.equal(escapeCell('dijo "barato"'), '"dijo ""barato"""')
  assert.equal(escapeCell('linea1\nlinea2'), '"linea1\nlinea2"')
  assert.equal(escapeCell(null), '')
})

test('neutraliza fórmulas para que Excel no las ejecute', () => {
  assert.equal(escapeCell('=1+1'), "'=1+1")
  assert.equal(escapeCell('@SUM(A1)'), "'@SUM(A1)")
  assert.equal(escapeCell('-2+3'), "'-2+3")
})

test('exporta los gastos del mes con encabezado', async () => {
  const user = 'test-export'
  await handleMessage(user, '25000 mercado', 'test')

  const csv = expensesToCsv(listExpenses(user))
  const [header, ...filas] = csv.split('\n')
  assert.equal(header, 'fecha,categoria,descripcion,monto,moneda,origen')
  assert.equal(filas.length, 1)
  assert.match(filas[0], /alimentacion/)
  assert.match(filas[0], /25000/)
})

test('reconoce vocabulario cotidiano de gasto', () => {
  const casos = {
    '18000 domicilio': 'alimentacion',
    '6000 pasaje': 'transporte',
    '80000 recibo de luz': 'servicios',
    '45000 peluquería': 'compras',
    '30000 vitaminas': 'salud',
    '25000 teatro': 'entretenimiento',
  }
  for (const [texto, categoria] of Object.entries(casos)) {
    assert.equal(fallbackParse(texto).expenses[0]?.category, categoria, texto)
  }
})

test('/categorias lista las categorías disponibles', async () => {
  const { reply } = await handleMessage('test-categorias', '/categorias', 'test')
  assert.match(reply, /alimentacion/)
  assert.match(reply, /transporte/)
  assert.match(reply, /otros/)
})
