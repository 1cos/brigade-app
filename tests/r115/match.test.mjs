// R1.15 suggested purchase match — on ALL real invoice lines (read-only dump). Right, wrong and ambiguous cases.
// Usage: DUMP=<match_dump.json> node tests/r115/match.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { matchCandidates, needsMatch, tokens } from '../../supabase/functions/_shared/purchase_match.js'
const D = JSON.parse(fs.readFileSync(process.env.DUMP, 'utf8'))
const id = n => D.ing.find(i => i.name === n).id
const top = (n, opt) => matchCandidates(id(n), D, [], opt).candidates
const good = c => c.filter(x => x.level === 'forte' || x.level === 'possibile')
test('Aluminium Cups → Cont Alum 4 Oz Utility (Ben E. Keith), $0,13591 al pezzo, motivo spiegato', () => {
  const c = top('Alluminium Cups')[0]
  assert.equal(c.level, 'forte'); assert.equal(c.vendor, 'Ben E. Keith'); assert.equal(c.sku, '168430'); assert.equal(c.target.name, 'Container Aluminum 4 oz Utility')
  assert.equal(c.last.date, '2026-07-02'); assert.equal(c.last.unit_price, 135.91); assert.ok(Math.abs(c.price.each - 0.13591) < 1e-12)
  assert.deepEqual(c.why.map(w => w.k), ['name', 'unit_ok', 'invoices', 'canonical'])
})
test('sbagliato: la paletta gelato in alluminio e i coperchi non sono proposti come corrispondenza', () => {
  assert.ok(!good(top('Alluminium Cups', { more: true })).some(x => /Scoop|Lid/i.test(x.description)))
})
test('Fresh Spinach (H-E-B occasionale) → SPINACH BABY Chef\'s Warehouse, articolo canonico "Spinach"', () => {
  const c = top('Fresh Spinach')[0]
  assert.equal(c.level, 'forte'); assert.equal(c.vendor, "Chef's Warehouse"); assert.equal(c.target.name, 'Spinach'); assert.ok(c.invoices >= 25)
  assert.ok(!top('Fresh Spinach').some(x => /COOKING W SPINACH/.test(x.description)), 'il suo stesso acquisto H-E-B non è un suggerimento')
})
test('Cheese Wheel: il nome da solo non basta → nessuna proposta automatica (vale la decisione CD-069)', () => {
  assert.equal(good(top('Cheese Wheel')).length, 0)
  const dec = [{ key: "Hardie's Fresh Foods / Dairyland Produce|sku:00907", decision: 'collega' }]
  const r = matchCandidates(id('Cheese Wheel'), D, dec, { more: true }).candidates
  assert.ok(r.length === 0 || r[0].level !== 'forte', 'mai "forte" solo per una parola in comune')
})
test('White Pepper: nessun pepe nero proposto come corrispondenza (solo "debole" su richiesta)', () => {
  assert.equal(good(top('White Pepper')).length, 0)
  assert.ok(top('White Pepper', { more: true }).every(x => x.level === 'debole'))
})
test('altro tipo di prodotto: "Olives" non diventa olio d\'oliva', () => {
  const c = good(top('Olives', { more: true }))
  assert.ok(c.length && /KALAMATA/.test(c[0].description)); assert.ok(!c.some(x => /Oil/i.test(x.description)))
})
test('ambigui: Onions (rossa / gialla) e Mozzarella (grattugiata / a fette) → scegli tu', () => {
  for (const n of ['Onions', 'Mozzarella']) { const c = good(top(n)); assert.ok(c[0].ambiguous && c[1].ambiguous, n) }
})
test('decisioni: "Non corrisponde" non torna, "Collega" resta in cima', () => {
  const cs = top('Alluminium Cups', { more: true }), k0 = cs[0].key, k1 = cs[1].key
  const r = matchCandidates(id('Alluminium Cups'), D, [{ key: k1, decision: 'non_corrisponde' }, { key: k0, decision: 'collega' }], { more: true })
  assert.equal(r.rejected, 1); assert.ok(!r.candidates.some(x => x.key === k1)); assert.equal(r.candidates[0].level, 'collegato')
})
test('in tutto lo storico: nessuna proposta "forte" di un altro tipo di prodotto, mai "collegato" senza decisione', () => {
  let n = 0
  for (const i of D.ing) { const c = matchCandidates(i.id, D, [], { more: true }).candidates; n += c.length
    for (const x of c) { assert.notEqual(x.level, 'collegato'); if (x.level === 'forte') assert.ok(!x.why.some(w => w.k === 'other_kind'), i.name + ' → ' + x.description) } }
  assert.ok(n > 0)
})
test('serve un suggerimento? senza prezzo / prezzo occasionale / nessuna fattura recente', () => {
  assert.equal(needsMatch(id('Alluminium Cups'), D, { policy: 'non_food', price: null }, '2026-10-21').why, 'no_invoice')   // no price and no invoice linked
  assert.equal(needsMatch(id('Fresh Spinach'), D, { price: { price_class: 'C' } }, '2026-10-21').why, 'occasional_price')
  assert.equal(needsMatch(id('Spinach'), D, { price: { price_class: 'A' } }, '2026-10-21').need, false)
})
test('parole: abbreviazioni e italiano', () => {
  assert.deepEqual(tokens('CHZ PARMESAN REGGIANO 24 MOS'), ['cheese', 'parmesan', 'reggiano', 'month'])
  assert.deepEqual(tokens('Bicchierini di Alluminio'), ['cup', 'aluminum'])
})
