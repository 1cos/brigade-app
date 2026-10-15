// MRE engine tests (B-49). Run: node --test tests/mre_engine.test.mjs  [DATA=<dir with real imported docs + facts>]
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import * as E from '../supabase/functions/_shared/mre_engine.js'

const EGG = 'e0000000-0000-4000-8000-000000000001', SUG = 'e0000000-0000-4000-8000-000000000002', FLO = 'e0000000-0000-4000-8000-000000000003', BUT = 'e0000000-0000-4000-8000-000000000004', MILK = 'e0000000-0000-4000-8000-000000000005'
const facts = {
  [EGG]: { name: 'Eggs', piece_g: { v: 55 }, price: { basis_dim: 'mass', cost_per_base: null, cost_per_each: 0.07772 } },
  [SUG]: { name: 'Sugar', price: { basis_dim: 'mass', cost_per_base: 0.001975 } },
  [FLO]: { name: 'Flour', price: { basis_dim: 'mass', cost_per_base: 0.000881 } },
  [BUT]: { name: 'Butter', price: { basis_dim: 'mass', cost_per_base: 0.005266 } },
  [MILK]: { name: 'Milk', price: null },
}
const SPONGE = { id: 's0000000-0000-4000-8000-000000000001'.replace('s', 'a'), title: 'Pan di Spagna', yield: { g: 820, portions: 12 }, has_stock: true,
  lines: [{ id: 'l1', kind: 'ingredient', ref: EGG, qty: 7, unit: 'pz', role: 'produzione' }, { id: 'l2', kind: 'ingredient', ref: SUG, qty: 210, unit: 'g', role: 'produzione' },
    { id: 'l3', kind: 'ingredient', ref: FLO, qty: 175, unit: 'g', role: 'produzione' }, { id: 'l4', kind: 'ingredient', ref: BUT, qty: 140, unit: 'g', role: 'produzione' }],
  steps: [{ it: 'Monta {{l1}} uova con {{l2}} g di zucchero finché il composto scrive.' }] }
const CAKE = { id: 'a0000000-0000-4000-8000-000000000002', title: 'Torta', yield: { portions: 12 }, has_stock: true,
  lines: [{ id: 'c1', kind: 'recipe', ref: SPONGE.id, qty: 410, unit: 'g', role: 'produzione' }, { id: 'c2', kind: 'ingredient', ref: SUG, qty: 24, unit: 'g', role: 'al_piatto' }] }
const DISH = { id: 'a0000000-0000-4000-8000-000000000003', title: 'Piatto', yield: { portions: 1 }, has_stock: false,
  lines: [{ id: 'd1', kind: 'recipe', ref: CAKE.id, qty: 1, unit: 'pz', role: 'produzione' }, { id: 'd2', kind: 'ingredient', ref: BUT, qty: 5, unit: 'g', role: 'produzione' }] }
const docs = { [SPONGE.id]: SPONGE, [CAKE.id]: CAKE, [DISH.id]: DISH }
const ctx = { doc: id => docs[id], facts: id => facts[id], measures: { pinch: 0.5 } }
const show = (ln, f, p) => { const s = E.showLine(ln, f, ctx, p); return s.n + ' ' + s.u }

test('7 uova → 5: tutta la ricetta si ricalcola (esempio dello Chef)', () => {
  const f = E.factorFromLine(SPONGE, 'l1', 5, 'pz', ctx)
  assert.equal(Math.round(f * 1e6) / 1e6, Math.round(5 / 7 * 1e6) / 1e6)
  assert.deepEqual(SPONGE.lines.map(l => show(l, f)), ['5 pz', '150 g', '125 g', '100 g'])
})
test('da qualsiasi ingrediente, anche in once', () => {
  assert.equal(show(SPONGE.lines[0], E.factorFromLine(SPONGE, 'l3', 350, 'g', ctx)), '14 pz')
  const f = E.factorFromLine(SPONGE, 'l4', 12, 'oz', ctx)
  assert.ok(Math.abs(f - 340.194 / 140) < 1e-6)
  assert.deepEqual(SPONGE.lines.map(l => show(l, f)), ['17 pz', '510 g', '425 g', '340 g'])
})
test('lotti frazionari, porzioni, resa: arrotondamento al pezzo con valore teorico', () => {
  const s = E.showLine(SPONGE.lines[0], 3.7, ctx); assert.equal(s.n, '26'); assert.equal(s.theo, '25,9')
  assert.equal(show(SPONGE.lines[1], E.factorFromPortions(SPONGE, 42)), '735 g')
  assert.equal(Math.round(E.factorFromYield(SPONGE, 2.5, 'kg') * 1e4) / 1e4, Math.round(2500 / 820 * 1e4) / 1e4)
  assert.equal(show(SPONGE.lines[1], 10), '2,1 kg')
  assert.equal(show(SPONGE.lines[1], 1, 'imperial'), '7,4 oz')
})
test('unità: g/kg/oz/lb/ml/L; il volume diventa peso solo con densità verificata', () => {
  assert.equal(E.ingredientAmount(2, 'l', facts[MILK]).status, 'densita_mancante')
  assert.equal(E.ingredientAmount(2, 'l', { density: { v: 1.03 } }).g, 2060)
  assert.equal(E.ingredientAmount(1, 'lb', facts[BUT]).g, 453.592)
  assert.equal(E.ingredientAmount(3, 'pz', facts[EGG]).g, 165)
  assert.equal(E.ingredientAmount(3, 'pz', facts[SUG]).status, 'peso_pezzo_mancante')
  assert.equal(E.ingredientAmount(2, 'pinch', facts[SUG], ctx.measures).status, 'stima')
  assert.equal(E.normUnit('Gr'), 'g'); assert.equal(E.normUnit('each'), 'pz'); assert.equal(E.normUnit('da definire'), null)
})
test('procedimento: il numero cambia, il testo dello Chef resta', () => {
  const parts = E.stepParts(SPONGE.steps[0].it, SPONGE, 5 / 7)
  assert.equal(parts.map(p => p.v).join(''), 'Monta 5 uova con 150 g di zucchero finché il composto scrive.')
})
test('food cost: prezzo mancante mai uguale a zero', () => {
  const c = E.cost(SPONGE.id, 1, ctx)
  assert.equal(c.missing, 0); assert.ok(Math.abs(c.food - (7 * 0.07772 + 210 * 0.001975 + 175 * 0.000881 + 140 * 0.005266)) < 1e-9)
  const m = { id: 'x', title: 'x', yield: { g: 100 }, lines: [{ id: 'm1', kind: 'ingredient', ref: MILK, qty: 100, unit: 'g', role: 'produzione' }] }
  const c2 = E.cost('x', 1, { doc: id => id === 'x' ? m : null, facts: id => facts[id] })
  assert.equal(c2.missing, 1); assert.equal(c2.food, 0); assert.equal(c2.complete, false)
})
test('sotto-ricette: quota del lotto divisa per la resa', () => {
  const c = E.cost(CAKE.id, 1, ctx), cs = E.cost(SPONGE.id, 1, ctx)
  assert.ok(Math.abs(c.food - (cs.food * 410 / 820 + 24 * 0.001975)) < 1e-9)
})
test('scarichi: produzione e vendita, nessun doppio scarico', () => {
  // producing 1 cake: consumes 410 g of sponge PREP (stocked), never the sponge ingredients; the plate garnish is NOT consumed in production
  const prod = E.explode(CAKE.id, 1, 'produzione', ctx)
  assert.deepEqual(prod.map(x => [x.kind, x.ref, Math.round(x.g)]), [['prep', SPONGE.id, 410]])
  // selling 1 slice of the stocked cake: 1/12 of the cake prep + the plate garnish (24/12 = 2 g sugar)
  const sale = E.explode(CAKE.id, 1 / 12, 'vendita', ctx)
  assert.equal(sale.length, 2); assert.equal(sale[0].kind, 'prep'); assert.equal(sale[0].portions, 1)
  assert.equal(sale[1].ref, SUG); assert.ok(Math.abs(sale[1].g - 2) < 1e-9)
  // selling a dish that uses 1 slice: the slice is consumed from the cake prep, butter at the plate; no sponge, no eggs
  const dish = E.explode(DISH.id, 1, 'vendita', ctx)
  assert.deepEqual(dish.map(x => [x.kind, x.ref]), [['prep', CAKE.id], ['ingredient', BUT]])
  assert.ok(Math.abs(dish[0].portions - 1) < 1e-9)
  const all = [...prod, ...E.explode(DISH.id, 12, 'vendita', ctx)]
  assert.equal(all.filter(x => x.ref === EGG).length, 0)                     // eggs only when the SPONGE is produced
})
test('ciclo bloccato', () => {
  const A = { id: 'a1', title: 'A', yield: { g: 100 }, lines: [{ id: 'x', kind: 'recipe', ref: 'a2', qty: 10, unit: 'g', role: 'produzione' }] }
  const B = { id: 'a2', title: 'B', yield: { g: 100 }, lines: [{ id: 'y', kind: 'recipe', ref: 'a1', qty: 10, unit: 'g', role: 'produzione' }] }
  const out = E.explode('a1', 1, 'costo', { doc: id => ({ a1: A, a2: B })[id], facts: () => null })
  assert.equal(out[0].status, 'ciclo')
})

// Real pilot data (read-only dumps): requires DATA dir
const D = process.env.DATA
test('dati reali: Dino Rib non scarica più la concia intera', { skip: !D }, () => {
  const docsR = JSON.parse(fs.readFileSync(`${D}/mre_import_docs.json`)), byId = Object.fromEntries(docsR.map(d => [d.id, d]))
  const fx = (x => Array.isArray(x) ? x : x.rows)(JSON.parse(fs.readFileSync(`${D}/facts.json`)))[0]
  const F = typeof fx.facts === 'string' ? JSON.parse(fx.facts) : fx.facts
  const c = { doc: id => byId[id], facts: id => F[id], measures: {} }
  const dino = docsR.find(d => d.title.startsWith('48 Hour'))
  const sale = E.explode(dino.id, 1, 'vendita', c)
  const big = sale.filter(x => x.kind === 'ingredient' && x.g > 1000)
  assert.equal(big.length, 0, 'nessun ingrediente oltre 1 kg per una porzione')
  const lim = docsR.find(d => d.title === 'Limoncello Cake')
  const s = E.explode(lim.id, 1 / lim.yield.portions, 'vendita', c)
  assert.equal(s.filter(x => x.kind === 'ingredient').length, 0, 'una fetta scarica solo la fetta')
  const scal = docsR.find(d => d.title === 'Scallops Chefs Way')
  const ss = E.explode(scal.id, 1, 'vendita', c)
  assert.equal(ss.filter(x => x.kind === 'ingredient' && /scallop/i.test((F[x.ref] || {}).name || '')).length, 0, 'capesante scaricate una volta sola (dalla prep)')
})
