// MR-04 — «Pubblica» on EVERY official recipe without changes must write NOTHING (plan empty), and the in-memory write of a
// plan read back must say what was approved. Data: a read-only dump of the official tables (argument 1).
// Usage: node tests/mr04/publish_roundtrip.test.mjs <official_dump.json>
import fs from 'node:fs'
import { buildLabDoc } from '../../supabase/functions/_shared/mre_import.js'
import { planPublish, applyPlan, verifyPublished, officialYield } from '../../supabase/functions/_shared/mre_publish.js'

const D = JSON.parse(fs.readFileSync(process.argv[2]))
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL ' + m) } }
const byId = Object.fromEntries(D.recipes.map(r => [r.id, r]))
const facts = {}; for (const b of D.bom) if (b.item_id) facts[b.item_id] = { name: b.ing_name, policy: b.policy, active: true }
const offOf = id => ({ r: byId[id], rows: D.bom.filter(b => b.parent_recipe_id === id).sort((a, b) => (a.sort_order ?? 1e9) - (b.sort_order ?? 1e9) || a.bom_id - b.bom_id),
  stepRows: (D.steps || []).filter(s => s.recipe_id === id).sort((a, b) => a.step_number - b.step_number), prepRows: (D.preps || []).filter(p => p.recipe_id === id),
  y: (D.yields || []).find(y => y.id === id) || {} })

// 1) the FC05 yield port gives what FC05 gives today, on every recipe
let yOk = 0
for (const r of D.recipes) { const a = officialYield(r, u => ({ g: { dim: 'mass', factor: 1 }, kg: { dim: 'mass', factor: 1000 }, lb: { dim: 'mass', factor: 453.592 }, oz: { dim: 'mass', factor: 28.3495 }, ml: { dim: 'volume', factor: 1 }, l: { dim: 'volume', factor: 1000 }, lt: { dim: 'volume', factor: 1000 } })[String(u || '').trim().toLowerCase()] || null), b = D.yields.find(y => y.id === r.id) || {}
  const same = (x, y) => (x == null ? null : Math.round(Number(x) * 1e6)) === (y == null ? null : Math.round(Number(y) * 1e6))
  if (same(a.portions, b.portions) && same(a.yield_qty, b.yield_qty) && (a.yield_dim || null) === (b.yield_dim || null) && !!a.conflict === !!b.conflict) yOk++
  else console.log('resa diversa', r.title, JSON.stringify(a), JSON.stringify(b)) }
ok(yOk === D.recipes.length, `resa FC05 ricalcolata uguale su ${yOk}/${D.recipes.length}`)

// 2) round trip: official → document → «Pubblica» with no change → nothing to write
let empty = 0
for (const r of D.recipes) {
  const off = offOf(r.id), doc = buildLabDoc({ id: r.id, ...off, byId }).doc
  const p = planPublish({ id: r.id, doc, off, facts, byId })
  if (p.empty) empty++
  else console.log('NON VUOTO', r.title, JSON.stringify(p.changes).slice(0, 400), p.summary.join(' | '))
}
ok(empty === D.recipes.length, `ricetta invariata = niente da scrivere: ${empty}/${D.recipes.length}`)

// 3) every recipe, with a real change (first line +1, last step edited): the in-memory write read back = what was approved
let ver = 0, tried = 0
for (const r of D.recipes) {
  const off = offOf(r.id), doc = JSON.parse(JSON.stringify(buildLabDoc({ id: r.id, ...off, byId }).doc))
  if (!doc.lines.length) continue
  tried++
  doc.lines[0].qty = Number(doc.lines[0].qty || 0) + 1
  if (doc.steps.length) doc.steps[doc.steps.length - 1].it = (doc.steps[doc.steps.length - 1].it || '') + ' (prova)'
  const p = planPublish({ id: r.id, doc, off, facts, byId })
  const after = applyPlan(off, p)
  const d = verifyPublished({ id: r.id, doc, offAfter: after, byId })
  if (!p.empty && d.length === 0) ver++
  else if (p.refusals.length === 0) console.log('VERIFICA', r.title, d.join('; '))
}
ok(ver === tried && tried > 200, `modifica scritta e riletta uguale: ${ver}/${tried}`)

// 4) the check after writing catches a wrong write (it must never say «ok» when the rows are not what was approved)
{
  const id = '5479387e-e4ad-4401-92ce-9cb785ef4a0d', off = offOf(id), doc = JSON.parse(JSON.stringify(buildLabDoc({ id, ...off, byId }).doc))
  doc.lines[0].qty = 10
  const p = planPublish({ id, doc, off, facts, byId }), after = applyPlan(off, p)
  ok(verifyPublished({ id, doc, offAfter: after, byId }).length === 0, 'Wheel Pasta burro 10 g: riletta uguale')
  const bad1 = JSON.parse(JSON.stringify(after)); bad1.rows[0].quantity = 20
  ok(verifyPublished({ id, doc, offAfter: bad1, byId }).some(x => /quantità/.test(x)), 'quantità sbagliata dopo la scrittura → scoperta')
  const bad2 = JSON.parse(JSON.stringify(after)); bad2.rows.pop()
  ok(verifyPublished({ id, doc, offAfter: bad2, byId }).some(x => /righe/.test(x)), 'riga persa dopo la scrittura → scoperta')
  const bad3 = JSON.parse(JSON.stringify(after)); bad3.r.base_servings = 2; bad3.y = officialYield(bad3.r, () => null)
  ok(verifyPublished({ id, doc, offAfter: bad3, byId }).some(x => /porzioni/.test(x)), 'porzioni sbagliate dopo la scrittura → scoperte')
}
// 5) what the official tables cannot carry is refused, never approximated
{
  const id = '5479387e-e4ad-4401-92ce-9cb785ef4a0d', off = offOf(id), base = buildLabDoc({ id, ...off, byId }).doc
  const t = f => { const d = JSON.parse(JSON.stringify(base)); f(d); return planPublish({ id, doc: d, off, facts: Object.assign({}, facts, { 'bb3717e0-3d2c-43ef-aac4-dc5df13f5d8a': { name: 'Parmesan Flakes', active: false } }), byId }) }
  ok(t(d => { d.lines[0].role = 'al_piatto' }).refusals.some(x => x.code === 'ruolo_non_pubblicabile'), 'ruolo che i bot leggerebbero diverso → rifiutato')
  ok(t(d => { d.lines[3].ref = 'bb3717e0-3d2c-43ef-aac4-dc5df13f5d8a' }).refusals.some(x => x.code === 'articolo_non_attivo'), 'articolo non attivo messo su una riga → rifiutato')
  ok(t(d => { d.yield.portion_unit = 'cup' }).refusals.some(x => x.code === 'unita_porzione_non_pubblicabile'), 'porzione in «cup» → rifiutata')
  ok(t(d => { d.lines[0].qty = null }).refusals.some(x => x.code === 'quantita_mancante'), 'quantità mancante → rifiutata')
  ok(t(d => { d.yield.label = '3 porzioni' }).refusals.some(x => x.code === 'resa_in_conflitto'), 'testo della resa in conflitto con le porzioni → rifiutato')
  const e = t(d => { d.lines[2].est = { usd: 25, qty: 750, unit: 'ml' }; d.lines[0].qty = 10 })
  ok(e.ok && e.warnings.some(x => x.code === 'prezzo_di_fiducia_solo_lab'), 'prezzo di fiducia: si pubblica, resta solo nel Recipe Master (avviso)')
  const rum = planPublish({ id, doc: (() => { const d = JSON.parse(JSON.stringify(base)); d.lines[2].unit = 'ml'; return d })(), off, byId,
    facts: Object.assign({}, facts, { [base.lines[2].ref]: { name: 'Rhum', base_unit: 'g', density: null, active: true } }) })
  ok(rum.ok && !rum.warnings.some(x => x.code === 'scarico_senza_conversione'), 'rum in ml su articolo in g senza densità: si pubblica, nessun avviso (1 ml = 1 g, Chef 22/10)')
  const s = t(d => { d.steps = [{ it: 'Sciogli {{b2173}} g di burro.', en: '', es: '', src: 'it', tr: { it: 'chef' } }] })
  ok(s.changes.steps && s.changes.steps.rows[0].instruction_it === 'Sciogli 20 g di burro.' && s.changes.steps.rows[0].instruction_en === null, 'passo: numero scritto per esteso, nessuna traduzione inventata')
  ok(s.changes.recipe.procedure === 'Sciogli 20 g di burro.' && s.warnings.some(x => x.code === 'passi_senza_traduzione'), 'procedimento di Brigade 1 allineato + avviso lingue mancanti')
}
console.log(`\nTOTALE ${pass} PASS, ${fail} FAIL · (verifica dopo la scrittura: ${ver}/${tried})`)
