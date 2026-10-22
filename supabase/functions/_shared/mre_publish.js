// MR-04 «Pubblica ricetta per ricetta» (Chef Max 22/10/2026, piano C di MR-01) — pure functions, read nothing, write nothing.
// The Chef's draft (lab document) → the exact changes to Brigade's official rows (recipes, recipe_bom, recipe_steps).
// Rule: only what the Chef changed is written. A draft identical to the official recipe gives NO change (tested on all recipes).
// What the official tables cannot carry the same way bots and FC05 read it is REFUSED, never approximated.
import { buildLabDoc, roleOf } from './mre_import.js'
import * as E from './mre_engine.js'

export const PUBLISH_VERSION = 'pub-1'
const LOC = { it: 'it-IT', en: 'en-US', es: 'es-ES' }
const LG = ['it', 'en', 'es']
const numEq = (a, b) => (a == null || a === '' ? null : Number(a)) === (b == null || b === '' ? null : Number(b))
const txt = v => v == null || v === '' ? null : String(v)

/** Step text in one language, tokens written as numbers (what the official tables and Brigade 1 show). null = no real text. */
export function stepText(st, lang, doc) {
  const s = st || {}, tr = s.tr || {}
  const raw = String(s[lang] || '').trim()
  if (!raw || tr[lang] === 'stale') return null                // an outdated translation is never published as if it were right
  return E.stepParts(raw, doc, 1, LOC[lang]).map(x => x.v).join('')
}
const stepsView = doc => (doc.steps || []).map(st => ({ it: stepText(st, 'it', doc), en: stepText(st, 'en', doc), es: stepText(st, 'es', doc),
  title_it: txt(st.title_it), title_en: txt(st.title_en), title_es: txt(st.title_es) }))

/** food_cost.recipe_yield (FC05) ported 1:1, to check BEFORE writing that bots/FC05 will read the yield the Chef approved. */
export function officialYield(r, unitInfo) {
  let yq = null, yd = null, np = null, ns = null, nt = null, conflict = null
  if (Number(r.base_weight_g) > 0) { yq = Number(r.base_weight_g); yd = 'mass' }
  else if (Number(r.base_weight) > 0) { const u = unitInfo(r.weight_unit); if (u && (u.dim === 'mass' || u.dim === 'volume')) { yq = Number(r.base_weight) * u.factor; yd = u.dim } }
  if (Number(r.base_servings) > 0) { np = Number(r.base_servings); ns = 'base_servings' }
  else if (yd === 'mass' && Number(r.serving_weight_g) > 0) { np = yq / Number(r.serving_weight_g); ns = 'resa / serving_weight_g' }
  else if (yd === 'mass' && String(r.serving_unit || '').toLowerCase() === 'g' && Number(r.serving_qty) > 0) { np = yq / Number(r.serving_qty); ns = 'resa / serving_qty g' }
  const m = String(r.yield_text || '').match(/^\s*(\d+(?:[.,]\d+)?)\s*porzion/)
  if (m) nt = Number(m[1].replace(',', '.'))
  if (np > 0 && nt > 0 && Math.abs(np - nt) / nt > 0.05) conflict = `porzioni in conflitto: ${np} da ${ns}, ${nt} dal testo della resa`
  return { portions: np, portions_source: ns, yield_qty: yq, yield_dim: yd, text_portions: nt, conflict }
}
const UNIT = { g: { dim: 'mass', factor: 1 }, kg: { dim: 'mass', factor: 1000 }, lb: { dim: 'mass', factor: 453.592 }, oz: { dim: 'mass', factor: 28.3495 }, ml: { dim: 'volume', factor: 1 }, l: { dim: 'volume', factor: 1000 }, lt: { dim: 'volume', factor: 1000 } }
const unitInfoDefault = u => UNIT[String(u || '').trim().toLowerCase()] || null

/**
 * Plan: what «Pubblica» would write. off = the official rows exactly as read ({ r, rows, stepRows, prepRows, y }).
 * facts: ingredient facts (name, policy) for every ingredient in the draft; byId: recipes by id (sub-recipe titles).
 */
export function planPublish({ id, doc, off, facts = {}, byId = {}, unitInfo = unitInfoDefault }) {
  const refusals = [], warnings = [], summary = []
  const base = buildLabDoc({ id, r: off.r, rows: off.rows, stepRows: off.stepRows || [], prepRows: off.prepRows || [], y: off.y || {}, byId }).doc
  const P = Number(doc.yield && doc.yield.portions)
  const nameOf = l => l.kind === 'recipe' ? ((byId[l.ref] || {}).title || l.ref) : ((facts[l.ref] || {}).name || l.ref)
  const rowsById = new Map(off.rows.map(b => [b.bom_id, b]))
  const recipe = {}, bom = { update: [], insert: [], delete: [] }
  const setR = (k, v) => { if (!numEq(off.r[k], v) && txt(off.r[k]) !== txt(v)) recipe[k] = v }

  if ((doc.title || '') !== (off.r.title || '')) { recipe.title = doc.title; summary.push(`Titolo: «${off.r.title}» → «${doc.title}»`) }
  if (txt(doc.category) !== txt(off.r.category) && txt(doc.category) !== txt(base.category)) recipe.category = doc.category

  // ---- lines → recipe_bom rows
  const docLines = doc.lines || [], seen = new Set()
  let linesChanged = false
  docLines.forEach((l, i) => {
    const qtyLot = l.per === 'portion' ? (P > 0 && l.qty != null ? Number(l.qty) * P : null) : (l.qty == null ? null : Number(l.qty))
    if (l.per === 'portion' && !(P > 0)) refusals.push({ code: 'porzioni_mancanti', line: l.id, msg: `${nameOf(l)}: quantità «a porzione» senza il numero di porzioni del lotto` })
    if (!(qtyLot > 0)) refusals.push({ code: 'quantita_mancante', line: l.id, msg: `${nameOf(l)}: quantità mancante` })
    if (E.dimOf(l.unit) == null) refusals.push({ code: 'unita_da_definire', line: l.id, msg: `${nameOf(l)}: unità da definire` })
    if (l.group) warnings.push({ code: 'gruppo_solo_lab', line: l.id, msg: `${nameOf(l)}: il gruppo «${l.group}» resta solo nel Recipe Master` })
    if (l.est) warnings.push({ code: 'prezzo_di_fiducia_solo_lab', line: l.id, msg: `${nameOf(l)}: il prezzo di fiducia resta nel Recipe Master (non è una fattura)` })
    const ct = l.kind === 'recipe' ? 'RECIPE' : 'ITEM'
    const f = facts[l.ref] || {}
    const want = { component_type: ct, item_id: ct === 'ITEM' ? l.ref : null, sub_recipe_id: ct === 'RECIPE' ? l.ref : null, quantity: qtyLot, unit: l.unit, notes: txt(l.note) }
    const rr = roleOf(id, { component_type: ct, sub_recipe_id: want.sub_recipe_id, ing_name: f.name || '', policy: f.policy || null })
    if ((l.role || 'produzione') !== rr.role) refusals.push({ code: 'ruolo_non_pubblicabile', line: l.id, msg: `${nameOf(l)}: «${l.role}» qui i bot lo leggerebbero come «${rr.role}» (serve una modifica ai bot, fuori dal Recipe Master)` })
    const bid = l.src && l.src.bom_id != null && rowsById.has(Number(l.src.bom_id)) ? Number(l.src.bom_id) : null
    // an article the Chef puts on a line (new or changed) must be active in Brigade; untouched lines stay as the bots read them today
    if (ct === 'ITEM' && f.active === false && (bid == null || rowsById.get(bid).item_id !== l.ref)) refusals.push({ code: 'articolo_non_attivo', line: l.id, msg: `${nameOf(l)}: l'articolo è «non attivo» in Brigade` })
    // volume on an article counted by weight (or the reverse) without a density: the stock deduction cannot convert it
    const du = E.dimOf(l.unit), db = E.dimOf(f.base_unit), dens = f.density && Number(f.density.v) > 0
    if (ct === 'ITEM' && du && db && ((du === 'v' && db === 'm') || (du === 'm' && db === 'v')) && !dens)
      warnings.push({ code: 'scarico_senza_conversione', line: l.id, msg: `${nameOf(l)}: riga in ${l.unit}, l'articolo si conta in ${f.base_unit} e non ha la densità: lo scarico di magazzino non può convertirlo (il food cost no, se manca il prezzo)` })
    if (bid != null && !seen.has(bid)) {
      seen.add(bid)
      const row = rowsById.get(bid), set = {}
      for (const k of ['component_type', 'item_id', 'sub_recipe_id', 'unit', 'notes']) if (txt(row[k]) !== txt(want[k])) set[k] = want[k]
      if (!numEq(row.quantity, want.quantity)) set.quantity = want.quantity
      if (Object.keys(set).length) { bom.update.push({ bom_id: bid, set, line: l.id }); linesChanged = true
        summary.push(`${nameOf(l)}: ` + Object.entries(set).map(([k, v]) => k === 'quantity' ? `${Number(row.quantity)} → ${v}` : k === 'unit' ? `unità ${row.unit} → ${v}` : k === 'notes' ? `nota «${row.notes || ''}» → «${v || ''}»` : `articolo cambiato`).join(', ')) }
    } else {
      bom.insert.push({ line: l.id, row: Object.assign({ parent_recipe_id: id, prep_task_id: null, sort_order: null }, want) }); linesChanged = true
      summary.push(`Nuova riga: ${nameOf(l)} ${qtyLot} ${l.unit}`)
    }
  })
  for (const b of off.rows) if (!seen.has(b.bom_id)) { bom.delete.push(b.bom_id); linesChanged = true; summary.push(`Tolta: ${b.ing_name || (byId[b.sub_recipe_id] || {}).title || b.bom_id} ${Number(b.quantity)} ${b.unit || ''}`) }
  // order: as in the draft; written only if it differs from today's reading order
  const orderNow = base.lines.map(l => l.id), orderDoc = docLines.map(l => l.src && rowsById.has(Number(l.src && l.src.bom_id)) ? 'b' + Number(l.src.bom_id) : l.id)
  const reorder = bom.insert.length > 0 || bom.delete.length > 0 || orderNow.join() !== orderDoc.join()
  if (reorder) {
    docLines.forEach((l, i) => {
      const so = i + 1, ins = bom.insert.find(x => x.line === l.id)
      if (ins) { ins.row.sort_order = so; return }
      const bid = Number(l.src.bom_id), row = rowsById.get(bid)
      if (!numEq(row.sort_order, so)) { let u = bom.update.find(x => x.bom_id === bid); if (!u) { u = { bom_id: bid, set: {}, line: l.id }; bom.update.push(u) } u.set.sort_order = so }
    })
    if (orderNow.join() !== orderDoc.join() && !bom.insert.length && !bom.delete.length) summary.push('Ordine delle righe cambiato')
  }

  // ---- yield → recipes fields (FC05 reads them through food_cost.recipe_yield)
  const y = doc.yield || {}, yb = base.yield || {}
  if (y.portion_unit) refusals.push({ code: 'unita_porzione_non_pubblicabile', msg: `Porzione in «${y.portion_unit}»: oggi bot e FC05 non leggono un'unità di porzione; serve un passo a parte` })
  if (!numEq(y.g, yb.g)) { setR('base_weight_g', y.g ?? null); if (y.g == null && Number(off.r.base_weight) > 0) setR('base_weight', null) }
  if (!numEq(y.portions, yb.portions)) setR('base_servings', y.portions ?? null)
  if (txt(y.label) !== txt(yb.label)) setR('yield_text', y.label || '')
  if (!numEq(y.count, yb.count) || txt(y.count_unit) !== txt(yb.count_unit)) {
    if (y.count != null && !(P > 0)) refusals.push({ code: 'porzioni_mancanti', msg: 'Pezzi per lotto senza il numero di porzioni' })
    else { setR('serving_qty', y.count != null ? Number(y.count) / P : null); setR('serving_unit', y.count != null ? y.count_unit : off.r.serving_unit) }
  }
  if (y.portion_g != null && !numEq(y.portion_g, off.r.serving_weight_g)) setR('serving_weight_g', y.portion_g)
  const rNew = Object.assign({}, off.r, recipe)
  const oy = officialYield(rNew, unitInfo), ry = E.resolveDoc(doc).yield || {}
  if (oy.conflict) refusals.push({ code: 'resa_in_conflitto', msg: oy.conflict })
  if (!numEq(oy.portions, y.portions ?? null) && !(y.portions == null && oy.portions == null)) refusals.push({ code: 'resa_letta_diversa', msg: `FC05 leggerebbe ${oy.portions ?? 'nessuna'} porzioni invece di ${y.portions ?? 'nessuna'}` })
  if (y.g != null && !(oy.yield_dim === 'mass' && Math.abs(oy.yield_qty - Number(y.g)) < 1e-6)) refusals.push({ code: 'resa_letta_diversa', msg: `FC05 leggerebbe una resa di ${oy.yield_qty ?? 'nessun'} ${oy.yield_dim === 'mass' ? 'g' : ''} invece di ${y.g} g` })
  for (const k of ['base_weight_g', 'base_servings', 'yield_text', 'serving_qty', 'serving_unit', 'serving_weight_g', 'base_weight'])
    if (k in recipe) summary.push(`Resa: ${k} ${off.r[k] ?? '—'} → ${recipe[k] ?? '—'}`)

  // ---- steps → recipe_steps + procedure text (Brigade 1 reads both)
  let steps = null
  const sv = stepsView(doc), sb = stepsView(base)
  if (JSON.stringify(sv) !== JSON.stringify(sb)) {
    const join = k => { const a = sv.map(s => s[k]).filter(Boolean); return a.length ? a.join('\n\n') : null }
    steps = { rows: sv.map((s, i) => ({ recipe_id: id, step_number: i + 1, title: s.title_en, title_it: s.title_it, title_es: s.title_es, instruction_it: s.it, instruction_en: s.en, instruction_es: s.es, timer_seconds: ((off.stepRows || [])[i] || {}).timer_seconds ?? null })) }
    recipe.procedure = join('it') || ''; recipe.procedure_en = join('en'); recipe.procedure_es = join('es')
    const miss = LG.filter(k => sv.length && sv.some(s => !s[k]))
    if (miss.length) warnings.push({ code: 'passi_senza_traduzione', msg: `Passi senza testo in ${miss.join(', ').toUpperCase()}: in quella lingua Brigade 1 traduce da sé o mostra l'originale; niente traduzione inventata` })
    summary.push(`Procedimento: ${sb.length} → ${sv.length} passi`)
  }
  // ---- written ingredient list (Brigade 1 card): regenerated from the lines when they change, so card and BOM say the same thing
  let ingredients = null
  if (linesChanged) {
    ingredients = docLines.map(l => { const q = l.per === 'portion' ? Number(l.qty) * P : Number(l.qty)
      return Object.assign({ name: nameOf(l), qty: String(q), unit: l.unit || '', comment: l.note || '' }, l.kind === 'recipe' ? { sub_recipe_id: l.ref } : { ingredient_id: l.ref }) })
    recipe.ingredients = ingredients
  }
  const empty = !Object.keys(recipe).length && !bom.update.length && !bom.insert.length && !bom.delete.length && !steps
  return { version: PUBLISH_VERSION, ok: refusals.length === 0 && !empty, empty, refusals, warnings, summary, changes: { recipe, bom, steps } }
}

/** The official rows after the plan, in memory (the server writes exactly these and compares them after reading them back). */
export function applyPlan(off, plan, newIds = {}) {
  const ch = plan.changes, r = Object.assign({}, off.r, ch.recipe)
  let rows = off.rows.filter(b => !ch.bom.delete.includes(b.bom_id)).map(b => { const u = ch.bom.update.find(x => x.bom_id === b.bom_id); return u ? Object.assign({}, b, u.set) : Object.assign({}, b) })
  for (const ins of ch.bom.insert) rows.push(Object.assign({ bom_id: newIds[ins.line] ?? null }, ins.row))
  rows.sort((a, b) => (a.sort_order ?? 1e9) - (b.sort_order ?? 1e9) || (a.bom_id ?? 1e12) - (b.bom_id ?? 1e12))
  const stepRows = ch.steps ? ch.steps.rows.map(s => Object.assign({}, s)) : (off.stepRows || [])
  return { r, rows, stepRows, prepRows: off.prepRows, y: officialYield(r, unitInfoDefault) }
}

/** After writing: read back → import → must say what the Chef approved. Returns the differences (empty = ok). */
export function verifyPublished({ id, doc, offAfter, facts = {}, byId = {} }) {
  const got = buildLabDoc({ id, r: offAfter.r, rows: offAfter.rows, stepRows: offAfter.stepRows || [], prepRows: offAfter.prepRows || [], y: offAfter.y || {}, byId }).doc
  const want = E.resolveDoc(doc), diff = []
  const W = want.lines || [], G = got.lines || []
  if (W.length !== G.length) diff.push(`righe: ${W.length} attese, ${G.length} lette`)
  W.forEach((l, i) => { const g = G[i]; if (!g) return
    if (l.kind !== g.kind || l.ref !== g.ref) diff.push(`riga ${i + 1}: articolo diverso`)
    if (!numEq(l.qty, g.qty)) diff.push(`riga ${i + 1}: quantità ${l.qty} attesa, ${g.qty} letta`)
    if (E.normUnit(l.unit) !== E.normUnit(g.unit)) diff.push(`riga ${i + 1}: unità ${l.unit} attesa, ${g.unit} letta`)
    if (txt(l.note) !== txt(g.note)) diff.push(`riga ${i + 1}: nota diversa`)
    if ((l.role || 'produzione') !== g.role) diff.push(`riga ${i + 1}: ruolo ${l.role} atteso, ${g.role} letto`) })
  const yw = doc.yield || {}, yg = got.yield || {}
  if (!numEq(yw.portions, yg.portions)) diff.push(`porzioni: ${yw.portions} attese, ${yg.portions} lette`)
  if (yw.g != null && !numEq(yw.g, yg.g)) diff.push(`resa: ${yw.g} g attesi, ${yg.g} letti`)
  if (JSON.stringify(stepsView(doc)) !== JSON.stringify(stepsView(got))) diff.push('procedimento diverso da quello approvato')
  return diff
}
