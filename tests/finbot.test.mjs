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
