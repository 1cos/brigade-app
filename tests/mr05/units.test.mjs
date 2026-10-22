// MR-05 «unità libere» (Chef 22/10): spoken units → standard form; oz on a liquid → fl oz; NO existing unit is rewritten.
// Usage: node tests/mr05/units.test.mjs <official_dump.json>
import fs from 'node:fs'
import * as E from '../../supabase/functions/_shared/mre_engine.js'
const D = JSON.parse(fs.readFileSync(process.argv[2]))
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++ }
const L = { liquid: true }, S = { liquid: false }
const cases = [['once', S, 'oz'], ['oncia', S, 'oz'], ['onza', S, 'oz'], ['libbre', S, 'lb'], ['chili', S, 'kg'], ['cucchiaio', S, 'tbsp'], ['cucchiaino', S, 'tsp'], ['tazza', S, 'cup'],
  ['once', L, 'fl_oz'], ['oz', L, 'fl_oz'], ['ounces', L, 'fl_oz'], ['oz', S, 'oz'], ['Oncia fluida', S, 'fl_oz'], ['cucharadas', S, 'tbsp']]
for (const [u, f, w] of cases) ok(E.standardUnit(u, f) === w, `«${u}»${f.liquid ? ' (liquido)' : ''} → ${w}`)
ok(E.dimOf(E.standardUnit('once', L)) === 'v' && E.dimOf(E.standardUnit('once', S)) === 'm', 'oncia fluida = volume, oncia = peso')
const am = E.ingredientAmount(2, E.standardUnit('once', L), { density: null }, {})
ok(Math.abs(am.ml - 59.147) < 0.01 && am.status === 'densita_mancante', '2 once di rum = 59,1 ml; in grammi solo con la densità (qui manca: lo dice, non inventa)')
// every unit written today on the 1,334 official lines stays exactly as it is (only the new words would change)
let same = 0
for (const b of D.bom) if (E.standardUnit(b.unit, S) === b.unit || b.unit == null) same++
ok(same === D.bom.length, `righe ufficiali con l'unità invariata: ${same}/${D.bom.length}`)
// the only official line that the liquid rule would change is the Bourbon (Chef 22/10: «sì, passa a fl oz»)
const liqNames = new Set(['Bourbon', 'Rum', 'White Wine', 'Red Wine', 'Extra Virgin Olive Oil', 'Heavy Cream', 'Milk', 'Water'])
const changed = D.bom.filter(b => b.component_type === 'ITEM' && liqNames.has(b.ing_name) && E.standardUnit(b.unit, L) !== b.unit).map(b => b.ing_name + ' ' + b.quantity + ' ' + b.unit)
ok(changed.length === 1 && /^Bourbon 2 oz$/.test(changed[0]), 'regola dei liquidi sulle righe di oggi: cambia solo il Bourbon (2 oz → 2 fl oz) — ' + changed.join(', '))
ok(E.unitLabel('fl_oz') === 'fl oz' && E.unitLabel('g') === 'g', 'sullo schermo: «fl oz»')
console.log(`\nTOTALE ${pass} PASS, ${fail} FAIL`)
