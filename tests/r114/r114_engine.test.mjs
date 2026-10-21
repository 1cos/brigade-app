// R1.14 (Chef 21/10, "CORREZIONI URGENTI DOPO TEST REALE IPHONE") — engine tests on the real read-only data.
// Conversions mass / pieces / packs / portions; Spinach Cup (CW spinach, 22 cups, NO cooked weight) + Butter Spinach POS ITEM;
// sales with and without registered production, cancellation, partial lot; never a double raw deduction; three ledgers apart.
// Usage: SNAP=<snap2_parsed.json> CW=<facts_cw_parsed.json> node tests/r114/r114_engine.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import * as E from '../../supabase/functions/_shared/mre_engine.js'
import { buildLabDoc } from '../../supabase/functions/_shared/mre_import.js'
const S = JSON.parse(fs.readFileSync(process.env.SNAP, 'utf8')), CW = JSON.parse(fs.readFileSync(process.env.CW, 'utf8'))
const byId = Object.fromEntries(S.recipes.map(r => [r.id, r])), Y = Object.fromEntries(S.yield.map(y => [y.id, y]))
const OFF = {}
for (const r of S.recipes) OFF[r.id] = Object.assign(buildLabDoc({ id: r.id, r, rows: S.bom.filter(b => b.parent_recipe_id === r.id), stepRows: S.steps.filter(s => s.recipe_id === r.id), prepRows: S.prep.filter(p => p.recipe_id === r.id && !p.archived), y: Y[r.id], byId, importedAt: 'x' }).doc, { id: r.id })
const SPIN = '9cec677b-55d6-4329-9dae-5dd4d489e147', PARM = '6357c9f1-f944-4153-8d7f-afb11336d91a', POS = 'b0490000-0000-4000-8000-0000000000a1'
const CWSPIN = 'db944759-42e3-4fdf-a705-d073f181d698', HEB = '62c3e36b-1504-4868-b776-7708cf5afc48', CUPS = 'f61ccfe4-2512-4f67-9402-4a00c37efea1', PEPPER = 'b86f83e6-694c-4136-89a2-c1509c8b3cb2'
const facts = Object.assign({}, S.facts, CW)
// Spinach Cup draft as Chef confirmed it (CD-067): 4 lb spinach (Chef's Warehouse), 440 g butter, 22 cups = 22 portions, no parmesan, NO cooked weight
const CUP = Object.assign(JSON.parse(JSON.stringify(OFF[SPIN])), { title: 'Spinach Cup', yield: { g: null, portions: 22, label: '22 contenitori = 22 porzioni' } })
CUP.lines = CUP.lines.filter(l => l.id !== 'b1757').map(l => l.id === 'b1752' ? Object.assign({}, l, { ref: CWSPIN }) : l)
const DISH = { schema: 1, id: POS, title: 'Butter Spinach', yield: { g: null, portions: 1 }, has_stock: false, steps: [], lines: [
  { id: 'p1', kind: 'recipe', ref: SPIN, qty: 1, unit: 'portion', role: 'produzione' }, { id: 'p2', kind: 'recipe', ref: PARM, qty: 5, unit: 'g', role: 'al_piatto' }] }
const docs = Object.assign({}, OFF, { [SPIN]: CUP, [POS]: DISH })
const ctx = { doc: x => docs[x], facts: x => facts[x], measures: S.measures }
const r3 = x => Math.round(x * 1000) / 1000

test('1 unità: massa, pezzi, confezioni, porzioni — nessuna conversione inventata', () => {
  assert.equal(E.ingredientAmount(4, 'lb', facts[CWSPIN]).g, 4 * 453.592)
  const cups = E.ingredientAmount(22, 'each', facts[CUPS]); assert.equal(cups.status, 'ok'); assert.equal(cups.count, 22); assert.equal(cups.g, null)   // 22 cups are 22 cups: no weight asked
  assert.equal(E.ingredientAmount(1, 'l', {}).status, 'densita_mancante')                                                                                // volume → weight only with a verified density
  for (const [u, k] of [['porz.', 'portion'], ['porz', 'portion'], ['porzioni', 'portion'], ['portion', 'portion'], ['each', 'pz'], ['pz', 'pz'], ['nidi', 'nest'], ['cs', 'case'], ['#', 'lb']]) assert.equal(E.normUnit(u), k, u)
  assert.equal(E.subFraction(1, 'porz.', CUP).f, 1 / 22); assert.equal(E.subFraction(2, 'case', CUP).status, 'resa_mancante')   // a case of cups is not a portion: not invented
  assert.equal(E.subFraction(50, 'g', CUP).status, 'resa_mancante')                                                            // grams of a prep without cooked weight: unknown, never 54,5 g
})
test('2 il tocco sull\'iPhone: "Spinach Cup 1 porz." si scala (era "missing conversion")', () => {
  assert.equal(E.factorFromLine(DISH, 'p1', 2, 'porz.', ctx), 2)
  assert.equal(E.factorFromLine(DISH, 'p1', 1, 'portion', ctx), 1)
  assert.equal(E.factorFromLine(CUP, 'b1756', 44, 'pz', ctx), 2)                           // Alluminium Cups 22 each → 44
  assert.equal(r3(E.factorFromLine(CUP, 'b1752', 2, 'lb', ctx)), 0.5)
})
test('3 scaling della prep senza peso cotto: 11 porzioni = mezzo lotto', () => {
  const f = E.factorFromPortions(CUP, 11); assert.equal(f, 0.5)
  assert.equal(E.showLine(CUP.lines.find(l => l.id === 'b1752'), f, ctx).n, '907')
  assert.equal(E.factorFromYield(CUP, 600, 'g'), null)                                      // no weight known → no scaling by weight, no guess
})
test('4 food cost completo / parziale, problemi aperti elencati', () => {
  const c = E.cost(SPIN, 1, ctx)
  assert.equal(c.state, 'parziale'); assert.equal(c.missing, 1)                             // White Pepper without price
  const sp = 4 * 453.592 * facts[CWSPIN].price.cost_per_base
  assert.ok(Math.abs(c.byLine.b1752.cost - sp) < 1e-9, 'spinaci al prezzo Chef\'s Warehouse')
  const iss = E.issues(SPIN, ctx)
  assert.ok(iss.some(i => i.code === 'prezzo_mancante' && i.ref === PEPPER), 'White Pepper senza prezzo')
  assert.ok(iss.some(i => i.code === 'imballo_senza_prezzo' && i.ref === CUPS), 'Alluminium Cups: imballo senza prezzo (non un errore di conversione)')
  assert.ok(!iss.some(i => i.code === 'conversione'), 'nessun problema di conversione')
  const d = E.cost(POS, 1, ctx); assert.equal(d.state, 'parziale')
  assert.ok(Math.abs(d.food - (c.food / 22 + E.cost(PARM, 1, ctx).food / OFF[PARM].yield.g * 5)) < 1e-9, 'Butter Spinach = 1/22 di lotto + 5 g di parmigiano')
  assert.ok(E.issues(POS, ctx).some(i => i.code === 'procedimento_mancante'))
  console.log(`   lotto Spinach Cup $${r3(c.food)} (parziale: pepe bianco) · cup $${r3(c.food / 22)} · Butter Spinach $${r3(d.food)}`)
})
test('5 vendita di 1 Butter Spinach: 1 Spinach Cup + 5 g parmigiano; il ruolo della riga non cambia niente nel piatto', () => {
  const m = E.sumMovements([E.movements({ kind: 'vendita', recipe: POS, portions: 1 }, ctx)])
  assert.equal(r3(-m['prep:' + SPIN].portions), 1); assert.equal(m['prep:' + SPIN].g, 0)   // no grams invented for the cup
  assert.equal(r3(-m['prep:' + PARM].g), 5)
  assert.ok(!m['ingrediente:' + CWSPIN], 'alla vendita nessuno spinacio crudo (è nella prep)')
  const DISH2 = Object.assign({}, DISH, { lines: DISH.lines.map(l => Object.assign({}, l, { role: 'al_piatto' })) }), ctx2 = { doc: x => x === POS ? DISH2 : docs[x], facts: ctx.facts, measures: ctx.measures }
  assert.deepEqual(E.sumMovements([E.movements({ kind: 'vendita', recipe: POS, portions: 1 }, ctx2)]), m, 'piatto senza scorta: produzione o al piatto, la vendita è identica')
  const t = E.sumMovements([E.theoretical(POS, 1, ctx)])
  assert.equal(r3(-t['ingrediente:' + CWSPIN].g), r3(4 * 453.592 / 22)); assert.equal(r3(-t['ingrediente:' + facts[Object.keys(facts).find(k => facts[k] && facts[k].name === 'Butter')].id].g), 20)
})
test('6 vendite senza produzione registrata: consumo teorico, giacenza sconosciuta, niente movimenti di materie prime', () => {
  const r = E.reconcile({ sales: [{ recipe: POS, portions: 22 }] }, ctx), p = r.preps.find(x => x.prep === SPIN)
  assert.equal(p.uncovered_portions, 22); assert.equal(p.stock_known, false); assert.equal(p.end_portions, null)
  assert.equal(Object.keys(r.registered).length, 0)
  assert.equal(r3(-r.uncovered_theoretical['ingrediente:' + CWSPIN].g), r3(4 * 453.592))
})
test('7 vendite + 1 lotto registrato: materie prime una volta sola', () => {
  const r = E.reconcile({ sales: [{ recipe: POS, portions: 22 }], productions: [{ recipe: SPIN, lots: 1 }] }, ctx)
  assert.equal(r3(-r.registered['ingrediente:' + CWSPIN].g), r3(4 * 453.592)); assert.equal(r.uncovered_theoretical['ingrediente:' + CWSPIN], undefined)
  assert.equal(r.preps.find(x => x.prep === SPIN).covered_portions, 22)
})
test('8 lotto parziale, conteggio, annullamento', () => {
  const half = E.movements({ kind: 'produzione', recipe: SPIN, lots: 0.5 }, ctx), s = E.sumMovements([half])
  assert.equal(r3(s['prep:' + SPIN].portions), 11); assert.equal(r3(-s['ingrediente:' + CWSPIN].g), r3(2 * 453.592)); assert.equal(s['prep:' + SPIN].g, 0)
  const r = E.reconcile({ sales: [{ recipe: POS, portions: 20 }], productions: [{ recipe: SPIN, lots: 0.5 }], counts: { [SPIN]: { portions: 12 } } }, ctx), p = r.preps.find(x => x.prep === SPIN)
  assert.equal(p.end_portions, 3); assert.equal(p.uncovered_portions, 0); assert.equal(p.stock_known, true)   // 12 counted + 11 made − 20 sold
  const sale = E.movements({ kind: 'vendita', recipe: POS, portions: 3 }, ctx), back = E.reverseMovements(sale, 'annullata')
  for (const o of Object.values(E.sumMovements([sale, back]))) for (const f of ['g', 'count', 'portions', 'lots']) assert.equal(o[f], 0)
})
test('9 Spinach Cup con l\'articolo Chef\'s Warehouse, H-E-B resta nello storico', () => {
  assert.equal(CUP.lines.find(l => l.id === 'b1752').ref, CWSPIN); assert.equal(facts[CWSPIN].price.price_class, 'A'); assert.equal(facts[HEB].price.price_class, 'C')
  assert.equal(OFF[SPIN].lines.find(l => l.id === 'b1752').ref, HEB, 'ricetta ufficiale invariata')
})
