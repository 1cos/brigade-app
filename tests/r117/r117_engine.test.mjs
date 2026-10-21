// R1.17 (Chef 21/10 "STANDARD DI RESA, MULTILINGUA") — engine rules on the real Spinach Cup (official rows read-only + the Chef's lab draft).
// Usage: SNAP=<snapall_parsed.json> node tests/r117/r117_engine.test.mjs
import fs from 'node:fs'
import * as E from '../../supabase/functions/_shared/mre_engine.js'
import { buildLabDoc } from '../../supabase/functions/_shared/mre_import.js'
const S = JSON.parse(fs.readFileSync(process.env.SNAP, 'utf8'))
const byId = Object.fromEntries(S.recipes.map(r => [r.id, r])), Y = Object.fromEntries(S.yield.map(y => [y.id, y])), DOC = {}
for (const r of S.recipes) DOC[r.id] = Object.assign(buildLabDoc({ id: r.id, r, rows: S.bom.filter(b => b.parent_recipe_id === r.id), stepRows: S.steps.filter(s => s.recipe_id === r.id), prepRows: S.prep.filter(p => p.recipe_id === r.id && !p.archived), y: Y[r.id], byId, importedAt: 'x' }).doc, { id: r.id })
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++ }
const SPIN = '9cec677b-55d6-4329-9dae-5dd4d489e147', POS = 'b0490000-0000-4000-8000-0000000000a1', SIC = '445b2309-6da9-4b77-8163-d1c875ec53f0', PARM = '6357c9f1-f944-4153-8d7f-afb11336d91a'
const CW = 'db944759-42e3-4fdf-a705-d073f181d698', CONT = 'bb09009b-adba-4f20-a4a7-fe5ba4cd4ce7'
// the Spinach Cup as the Chef decided (CD-071 + 21/10 evening): 4 lb, 440 g, seasoning, 1 container per cup, 15 cups expected, 80 g cooked each
const cup = (o = {}) => Object.assign({ schema: 1, id: SPIN, title: 'Spinach Cup', category: 'Contorni', has_stock: true, stock: DOC[SPIN].stock, notes: null,
  yield: Object.assign({ g: null, portions: 15, portion_g: 80, portion_unit: 'cup', label: null, label_hist: ['15 contenitori =7,5 porzioni'] }, o.yield || {}),
  lines: DOC[SPIN].lines.filter(l => l.id !== 'b1757' && l.id !== 'b1758').map(l => l.id === 'b1752' ? Object.assign({}, l, { ref: CW }) : l.id === 'b1756' ? Object.assign({}, l, { ref: CONT, qty: 1, unit: 'each', per: 'portion', role: 'imballo' }) : l),
  steps: [{ src: 'it', it: 'Cuocere tutti gli spinaci insieme con gli ingredienti previsti.', en: '', es: '', tr: { en: 'stale', es: 'stale' } }, { src: 'it', it: 'Mettere {{y:portion_g}} g di spinaci cotti in ogni contenitore.', en: 'Put {{y:portion_g}} g of cooked spinach in each container.', es: 'Poner {{y:portion_g}} g de espinacas cocidas en cada recipiente.', tr: { en: 'auto', es: 'auto' } }] }, o.doc || {})
const dish = { schema: 1, id: POS, title: 'Butter Spinach', yield: { portions: 1 }, has_stock: false, lines: [{ id: 'p1', kind: 'recipe', ref: SPIN, qty: 2, unit: 'portion', role: 'produzione' }, { id: 'p2', kind: 'recipe', ref: PARM, qty: 5, unit: 'g', role: 'al_piatto' }], steps: [] }
const mk = sp => ({ doc: x => x === SPIN ? sp : x === POS ? dish : DOC[x], facts: x => S.facts[x], measures: S.measures })
const C = cup(), ctx = mk(C), R = E.resolveDoc(C)
ok(R.lines.find(l => l.id === 'b1756').qty === 15 && R.yield.g === 1200 && R.yield.g_derived, 'contenitori = 1 per cup × 15 = 15; lotto previsto 15 × 80 g = 1.200 g cotti (calcolati, non scritti)')
ok(C.lines.find(l => l.id === 'b1756').qty === 1 && C.yield.g === null, 'nella ricetta resta scritto una sola volta: 1 per cup, 80 g, 15')
const RR = E.resolveDoc(E.resolveDoc(C)), cR = E.cost(SPIN, 1, { doc: x => x === SPIN ? R : DOC[x], facts: x => S.facts[x], measures: S.measures })
ok(RR.lines.find(l => l.id === 'b1756').qty === 15 && Math.abs(cR.pack - E.cost(SPIN, 1, mk(C)).pack) < 1e-9, 'calcolata due volte resta 15 contenitori (mai 15 × 15): imballo uguale')
const c15 = E.cost(SPIN, 1, ctx)
const old15 = E.cost(SPIN, 1, mk(cup({ yield: { portion_g: null }, doc: { lines: cup().lines.map(l => l.per ? Object.assign({}, l, { per: undefined, qty: 15 }) : l) } })))
ok(Math.abs(c15.food - old15.food) < 1e-9 && Math.abs(c15.pack - old15.pack) < 1e-9, `food cost uguale a una riga "15 contenitori" scritta a mano: lotto $${c15.food.toFixed(2)} + imballo $${c15.pack.toFixed(2)}`)
ok(Math.abs(c15.per_portion - c15.food / 15) < 1e-12, `Spinach Cup standard = lotto / 15 = $${c15.per_portion.toFixed(3)} (ingredienti del lotto divisi per la resa prevista)`)
const C16 = cup({ yield: { portions: 16 } }), c16 = E.cost(SPIN, 1, mk(C16))
ok(E.resolveDoc(C16).lines.find(l => l.id === 'b1756').qty === 16 && Math.abs(c16.food - c15.food) < 1e-9 && Math.abs(c16.per_portion - c16.food / 16) < 1e-12, 'resa prevista 16: contenitori 16 da soli, ingredienti uguali, costo a cup = lotto / 16')
const C85 = cup({ yield: { portion_g: 85 } })
ok(['it', 'en', 'es'].every(k => E.stepParts(C85.steps[1][k], C85, 1, 'it-IT').some(x => x.v === '85')) && Math.abs(E.cost(SPIN, 1, mk(C85)).food - c15.food) < 1e-9, 'peso porzione 85 g: il numero cambia da solo nelle tre lingue; il costo del lotto non cambia (gli ingredienti sono gli stessi)')
ok(E.stepParts(C.steps[1].it, C, 2, 'it-IT').some(x => x.v === '80'), 'con 2 lotti la porzione resta 80 g (è uno standard, non si moltiplica)')
ok(!E.issues(SPIN, ctx).some(i => /peso|resa_|crudo|cotto/.test(i.code)) && !E.validate(C, ctx, false).length, `nessun confronto crudo/cotto: 4 lb crudi contro 1.200 g cotti non è un errore (problemi aperti: ${E.issues(SPIN, ctx).map(i => i.code).join(', ') || 'nessuno'})`)
ok(E.validate(cup({ yield: { g: 80 } }), null, false).includes('resa_doppia'), 'peso del lotto 80 g scritto accanto a 15 × 80 g: rifiutato ("resa_doppia"), un numero in un posto solo')
const sale = E.explode(POS, 1, 'vendita', ctx), pr = sale.find(x => x.kind === 'prep')
ok(pr && Math.abs(pr.portions - 2) < 1e-9 && Math.abs(pr.fraction - 2 / 15) < 1e-12, 'Butter Spinach venduto: 2 Spinach Cup = 2/15 del lotto, nessuno spinacio crudo alla vendita')
const th = E.theoretical(POS, 1, ctx), sp = Object.values(E.sumMovements([th])).find(x => x.ref === CW), ct = Object.values(E.sumMovements([th])).find(x => x.ref === CONT)
ok(sp && Math.abs(Math.abs(sp.g) - 4 * 453.592 * 2 / 15) < 1e-6 && ct && Math.abs(Math.abs(ct.count) - 2) < 1e-9, `consumo teorico di 1 Butter Spinach: spinaci crudi ${sp && Math.abs(sp.g).toFixed(1)} g, contenitori ${ct && Math.abs(ct.count)}`)
const cp = E.cost(POS, 1, ctx)
ok(Math.abs(cp.byLine.p1.cost - 2 * c15.per_portion) < 1e-9 && Math.abs(cp.pack - 2 * c15.pack / 15) < 1e-9, `food cost del piatto dalla stessa PREP: 2 cup = $${cp.byLine.p1.cost.toFixed(3)} + imballo $${cp.pack.toFixed(3)}`)
const sic = DOC[SIC], l1 = sic.lines.find(l => l.ref === SPIN)
ok(l1 && E.subFraction(l1.qty, l1.unit, C).status === 'ok' && Math.abs(E.subFraction(l1.qty, l1.unit, C).f - 1 / 15) < 1e-12, `Siciliana "${l1 && l1.qty} ${l1 && l1.unit}" = 1 Spinach Cup (1/15 del lotto), non una tazza`)
ok(E.subFraction(l1.qty, l1.unit, DOC[SPIN]).status === 'unita_sospetta', 'sulla ricetta ufficiale di oggi resta "unità sospetta": niente cambia finché non si pubblica')
const cs = E.cost(SIC, 1, mk(C)), csOld = E.cost(SIC, 1, mk(DOC[SPIN]))
ok(cs.missing < csOld.missing || (csOld.byLine[l1.id] || {}).missing, `Siciliana: la parte spinaci ora ha un costo ($${((cs.byLine[l1.id] || {}).cost || 0).toFixed(3)}); prima mancava`)
// languages
const max1 = 'Scaldare due Cup di spinaci messe su un piatto bianco quadrato o verde rettangolare nel microonde senza la Cup di alluminio per un minuto e mezzo affinché caldi'
ok(E.langOf(max1).lang === 'it' && E.langOf(max1).sure, 'lo step scritto in italiano con l\'app in inglese è riconosciuto come italiano')
ok(E.stepIn({ en: '', it: 'Cuocere', src: 'it', tr: { en: 'stale' } }, 'en').kind === 'fallback' && E.stepIn(C.steps[1], 'es').kind === 'auto', 'inglese mancante → si mostra l\'originale segnato; traduzione automatica riconoscibile')
const pt = E.protectTokens('Mettere {{y:portion_g}} g a 180 °C per 12 minuti')
ok(E.restoreTokens('Put [[1]] g at 180 °C for 12 minutes', pt.map, pt.text).ok && !E.restoreTokens('Put g at 180 °C for 12 minutes', pt.map, pt.text).ok && !E.restoreTokens('Put [[1]] g at 160 °C for 12 minutes', pt.map, pt.text).ok, 'traduzione che perde un numero collegato o cambia 180 °C → segnata "controlla i numeri"')
ok(E.linkNumbers('Mettere 80 g di spinaci cotti in ogni contenitore', C) === 'Mettere {{y:portion_g}} g di spinaci cotti in ogni contenitore' && E.linkNumbers('Cuocere a 80 °C', C) === 'Cuocere a 80 °C', '"80 g" diventa il peso porzione strutturato; "80 °C" resta testo')
console.log(`# pass ${pass}\n# fail ${fail}`); process.exitCode = fail ? 1 : 0
