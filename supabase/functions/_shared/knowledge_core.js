// Knowledge Engine, phase 1 (B-51, Chef Max GO 16/10/2026) — READ ONLY. No new catalog: it joins what Brigade
// already has (ingredients, vendors, invoices, FC05 prices and conversions via mre.ingredient_facts, recipe_bom,
// recipe_yield, POS, prep counts) around ONE ingredient id, and labels every value:
//   verified  = read from a confirmed source (invoice, approved conversion, POS, BOM)
//   estimated = present in Brigade but not confirmed (e.g. a piece weight nobody approved), or derived from one
//   missing   = not in Brigade, with the reason
// NO SILENT ASSUMPTIONS: nothing here invents a pack, a weight, a price or a quantity. Pure functions, no I/O:
// the server runs them on live data, the tests on read-only dumps. Prices/vendors/invoices only when chef = true.
import { ingredientCard } from './kitchen_core.js'
import { normUnit, dimOf, subFraction } from './mre_engine.js'

export const V = 'verified', E = 'estimated', M = 'missing'
const f = (v, s, src, why) => ({ v: v ?? null, s, src: src || null, why: why || null })
const num = x => { const n = Number(x); return x == null || x === '' || !isFinite(n) ? null : n }
const r2 = x => x == null ? null : Math.round(x * 100) / 100

/* ---------------- pack text → structure (never guessed) ---------------- */
const PU = { ct: 'count', count: 'count', pc: 'count', pcs: 'count', ea: 'count', each: 'count', dz: 'count',
  lb: 'mass', lbs: 'mass', '#': 'mass', kg: 'mass', g: 'mass', gr: 'mass', oz: 'oz',
  gal: 'volume', qt: 'volume', pt: 'volume', l: 'volume', lt: 'volume', ltr: 'volume', ml: 'volume' }
const CANON = { ct: 'pz', count: 'pz', pc: 'pz', pcs: 'pz', ea: 'pz', each: 'pz', lbs: 'lb', '#': 'lb', gr: 'g', lt: 'l', ltr: 'l' }
/** "4/20 CT" → { outer:4, inner:20, unit:'pz', dim:'count', total:80 } ; anything ambiguous → status 'unclear' + why. */
export function parsePack(text) {
  const t = String(text || '').trim()
  if (!t) return { text: t, status: M, why: 'no pack text' }
  if (/^each$/i.test(t)) return { text: t, status: V, outer: 1, inner: 1, unit: 'pz', dim: 'count', total: 1 }
  const m = t.match(/^(?:(\d+)\s*\/\s*)?(\d+(?:\.\d+)?)\s*(ct|count|pcs?|ea|each|dz|lbs?|#|kg|gr?|oz|gal|qt|pt|ltr|lt|l|ml)\.?$/i)
  if (!m) return { text: t, status: M, why: /^\d+(\.\d+)?\s*-\s*\d/.test(t) ? 'not a single number (range, catch weight or mixed format)' : 'pack text not in a standard form' }
  const outer = m[1] ? Number(m[1]) : 1, size = Number(m[2]), u = m[3].toLowerCase()
  if (!(outer > 0) || !(size > 0)) return { text: t, status: M, why: 'pack numbers not readable' }
  const dim = PU[u], unit = CANON[u] || u
  if (u === 'dz') return { text: t, status: V, outer, inner: size * 12, unit: 'pz', dim: 'count', total: outer * size * 12 }
  if (dim === 'oz') return { text: t, status: E, outer, inner: size, unit: 'oz', dim: 'oz', total: outer * size, why: 'oz: weight or fluid ounces is not stated' }
  return { text: t, status: V, outer, inner: size, unit, dim, total: outer * size }
}
const MASS_G = { g: 1, kg: 1000, lb: 453.592, oz: 28.3495 }
const packLabel = p => p && p.total != null ? (p.outer > 1 ? `${p.outer} × ${p.inner} ${p.unit} = ${r2(p.total)} ${p.unit}` : `${r2(p.total)} ${p.unit}`) : null

/* ---------------- how much one invoice line brought in ----------------
   The pack text means different things by vendor: Hardie's "4/20 CT" at $159.88 × 1 case = content of ONE case;
   Fruge "20 LB" at $8.50 × 2 cases = $170 = the WHOLE line (2 × 10 lb, priced per lb). The line total decides:
   qty × unit price = total → pack is per case; pack × unit price = total → pack is the line. Both or neither → unclear. */
export function lineAmount(l) {
  const pk = parsePack(l.pack_description), q = num(l.qty), up = num(l.unit_price), tot = num(l.line_total)
  if (pk.status !== V) return { s: M, why: `pack "${l.pack_description || '—'}" cannot be read as a number` }
  if (q == null || up == null || tot == null) return { s: M, why: 'quantity, price or total missing on the invoice line' }
  const near = (a, b) => Math.abs(a - b) <= Math.max(0.05, 0.02 * Math.abs(b))
  const perCase = near(q * up, tot), perLine = near(pk.total * up, tot)
  if (perCase === perLine) return { s: M, why: perCase ? 'pack could be per case or for the whole line' : 'price × quantity does not match the line total' }
  const n = perCase ? q * pk.total : pk.total
  return pk.dim === 'mass' ? { s: V, amt: n * MASS_G[pk.unit], unit: 'g', rule: perCase ? 'per case' : 'whole line' } : { s: V, amt: n, unit: pk.unit, rule: perCase ? 'per case' : 'whole line' }
}

/* ---------------- one vendor row: pack, price and coherence ---------------- */
function vendorFacts(v, ing) {
  const p = parsePack(v.pack_description)
  const out = { vendor: v.vendor, sku: v.vendor_sku || null, pack_text: v.pack_description || null, pack: f(packLabel(p), p.status, 'pack text on vendor sheet / invoice', p.why),
    pack_total: p.status === V ? { qty: p.total, unit: p.unit, dim: p.dim, outer: p.outer, inner: p.inner } : null,
    purchase_unit: v.purchase_unit || null, unit_price: num(v.unit_price), last_invoice_date: v.last_invoice_date || null, do_not_order: !!v.do_not_order, checks: [] }
  if (out.unit_price != null && p.status === V && p.dim === 'count') out.price_each = f(r2(out.unit_price / p.total * 10000) / 10000, V, `invoice price ÷ ${p.total} pieces`)
  else if (num(v.price_per_each) != null) out.price_each = f(num(v.price_per_each), E, 'vendor sheet (not recomputed from the pack)')
  const pu = normUnit(v.purchase_unit), puDim = dimOf(v.purchase_unit)
  if (p.status === V && pu && ((p.dim === 'count' && puDim === 'm') || (p.dim === 'mass' && puDim === 'c' && pu !== 'case')))
    out.checks.push({ s: E, msg: `Purchase unit says "${v.purchase_unit}" but the pack is ${p.dim === 'count' ? 'counted in pieces' : 'weighed'} (${v.pack_description}).` })
  const conv = num(v.conversion_to_base)
  if (conv && p.status === V && p.dim === 'count' && (ing.base_unit || '').toLowerCase() === 'g') {
    const g = conv / p.total
    out.checks.push({ s: E, msg: `The per-gram price assumes ${r2(g)} g a piece (${r2(conv)} g ÷ ${p.total} pieces). That weight is not approved.` })
  }
  return out
}

/* ---------------- conversions: approved vs present-but-not-approved vs missing ---------------- */
function conversions(ing, facts, convRows, eachRows, usedUnits) {
  const fc = facts || {}
  const piece = fc.piece_g && num(fc.piece_g.v) ? f(num(fc.piece_g.v), V, `approved conversion${fc.piece_g.fonte ? ' · ' + fc.piece_g.fonte : ''}`)
    : num(ing.avg_unit_weight_g) ? f(num(ing.avg_unit_weight_g), E, 'ingredient sheet (avg weight)', 'not approved: the cost and recipe engine does not use it')
    : (eachRows || []).length && num(eachRows[0].avg_weight_g) ? f(num(eachRows[0].avg_weight_g), E, `unit_each_weights${eachRows[0].source ? ' · ' + eachRows[0].source : ''}`, 'not approved')
    : f(null, M, null, 'no piece weight in Brigade')
  const pending = (convRows || []).filter(c => c.tipo === 'peso_pezzo' && !/approvat/i.test(c.stato || ''))
  if (piece.s !== V && pending.length) piece.why = (piece.why ? piece.why + '; ' : '') + `${pending.length} proposal(s) waiting for approval`
  const dens = fc.density && num(fc.density.v) ? f(num(fc.density.v), V, `approved conversion${fc.density.fonte ? ' · ' + fc.density.fonte : ''}`) : f(null, M, null, 'no density (ml → g) in Brigade')
  const needs = { piece: usedUnits.some(u => dimOf(u) === 'c' && normUnit(u) === 'pz'), volume: usedUnits.some(u => dimOf(u) === 'v') }
  return { piece_g: piece, density: dens, needed: needs }
}

/* ---------------- where it is used: recipes, then dishes sold (walking up sub-recipes) ---------------- */
// same yield reading as the B-49 import (mre_import.js): batch grams, portions, and pieces per batch when the portion is counted
function yieldDoc(y, r) {
  if (!y) return { yield: {} }
  const port = num(y.portions) > 0 ? num(y.portions) : null, sq = num(r && r.serving_qty)
  return { yield: Object.assign({ g: y.yield_dim === 'mass' && num(y.yield_qty) > 0 ? num(y.yield_qty) : null, portions: port },
    r && dimOf(r.serving_unit) === 'c' && sq > 0 && port ? { count: port * sq, count_unit: normUnit(r.serving_unit) } : {}) }
}
/** For every recipe with a POS name reached from the ingredient: amount of the ingredient per portion sold. */
export function dishesUsing(id, bom, recipes, yields) {
  const R = {}; (recipes || []).forEach(r => { R[r.id] = r })
  const Y = {}; (yields || []).forEach(y => { Y[y.id] = y })
  const parents = {}; (bom || []).forEach(b => { if (b.component_type === 'RECIPE' && b.sub_recipe_id) (parents[b.sub_recipe_id] = parents[b.sub_recipe_id] || []).push(b) })
  const out = {}
  const add = (rid, unit, amt, status, path) => {
    const r = R[rid]; if (!r) return
    const key = rid + '|' + unit
    const port = num((Y[rid] || {}).portions)
    const per = amt == null ? null : port > 0 ? amt / port : null
    const st = amt == null ? status : port > 0 ? status : M
    const o = out[key] || (out[key] = { recipe_id: rid, title: r.title, pos_names: posNames(r), addon: r.menu_group === 'Add-ons', unit, per_portion: 0, status: V, why: [], paths: [] })
    if (per == null) { o.per_portion = null; o.status = M; o.why.push(amt == null ? status === M ? 'conversion missing on the way' : 'not computable' : 'portions per batch not set') }
    else if (o.per_portion != null) o.per_portion += per
    if (st === E && o.status === V) o.status = E
    o.paths.push(path.map(p => (R[p] || {}).title || '?').join(' › '))
  }
  const walk = (rid, unit, amt, status, path, depth) => {
    if (depth > 6 || path.slice(1).includes(rid)) return
    if (posNames(R[rid]).length) add(rid, unit, amt, status, path)
    for (const b of parents[rid] || []) {
      const fr = subFraction(b.quantity, b.unit, yieldDoc(Y[rid], R[rid]))
      walk(b.parent_recipe_id, unit, amt != null && fr.f != null ? amt * fr.f : null, fr.f == null ? M : status, [b.parent_recipe_id, ...path], depth + 1)
    }
  }
  for (const b of bom || []) {
    if (b.item_id !== id) continue
    const u = normUnit(b.unit) || String(b.unit || ''), q = num(b.quantity)
    const g = q != null && MASS_G[u] ? { unit: 'g', amt: q * MASS_G[u] } : { unit: u || '?', amt: q }
    walk(b.parent_recipe_id, g.unit, g.amt, q == null ? M : V, [b.parent_recipe_id], 0)
  }
  return Object.values(out).sort((a, b) => a.title.localeCompare(b.title))
}
export const posNames = r => String((r && r.pos_name) || '').split('|').map(x => x.trim()).filter(Boolean)

/* ---------------- the card ---------------- */
/**
 * data: { ingredients, bom (all rows touching the ingredient and its parent chain), recipes, yields, prep, vendors,
 *         aliases, invoices (this ingredient, newest first, with doc_number), facts (mre.ingredient_facts entry),
 *         conv (food_cost.conversioni rows), each (unit_each_weights rows), sales ([{name, qty}] last N days, items + modifiers),
 *         counts (prep_stock_counts of linked preps), days, today }
 */
export function knowledgeCard(id, data, chef) {
  const base = ingredientCard(id, { ingredients: data.ingredients, bom: (data.bom || []).filter(b => b.item_id === id), prep: data.prep, recipes: data.recipes, vendors: data.vendors }, chef)
  if (!base) return null
  const ing = (data.ingredients || []).find(x => x.id === id)
  const facts = data.facts || null
  const direct = (data.bom || []).filter(b => b.item_id === id)
  const Y = {}; (data.yields || []).forEach(y => { Y[y.id] = y })
  const usedUnits = [...new Set(direct.map(b => b.unit).filter(Boolean))]
  const recipes = direct.map(b => { const y = Y[b.parent_recipe_id] || {}, port = num(y.portions), q = num(b.quantity)
    return { recipe_id: b.parent_recipe_id, title: ((data.recipes || []).find(r => r.id === b.parent_recipe_id) || {}).title || '?', qty: q, unit: b.unit || null,
      per_lot: f(q, q == null ? M : V, 'recipe BOM', q == null ? 'quantity missing' : null),
      per_portion: port > 0 && q != null ? f(r2(q / port * 1000) / 1000, V, `BOM ÷ ${port} portions`) : f(null, M, null, port > 0 ? 'quantity missing' : 'portions per batch not set'),
      unit_ok: dimOf(b.unit) ? null : 'unit not convertible' } }).sort((a, b) => a.title.localeCompare(b.title))
  const dishes = dishesUsing(id, data.bom, data.recipes, data.yields)
  // POS: sold in the window per dish (name = recipes.pos_name, the same rule the POS cleaner uses first)
  // dishes count menu items; add-ons (menu group "Add-ons", e.g. ADD LOBSTER = "Lobsters") count POS modifiers
  const sold = { item: {}, modifier: {} }; (data.sales || []).forEach(s => { const m = sold[s.kind === 'modifier' ? 'modifier' : 'item'], k = String(s.name || '').trim().toLowerCase(); m[k] = (m[k] || 0) + (num(s.qty) || 0) })
  let theo = 0, theoUnit = null, theoStatus = V; const theoWhy = []
  dishes.forEach(d => {
    const src = d.addon ? sold.modifier : sold.item
    d.sold = d.pos_names.reduce((a, n) => a + (src[n.toLowerCase()] || 0), 0)
    d.sold_f = f(d.sold, V, `POS ${d.addon ? 'modifiers' : 'menu items'}, last ${data.days} days`)
    if (!d.sold) return
    if (d.per_portion == null) { theoStatus = M; theoWhy.push(`${d.title}: ${d.why[0] || 'amount per portion missing'}`); return }
    if (theoUnit && theoUnit !== d.unit) { theoStatus = M; theoWhy.push(`${d.title}: unit ${d.unit} cannot be added to ${theoUnit} without an approved conversion`); return }
    theoUnit = d.unit; theo += d.sold * d.per_portion; if (d.status === E && theoStatus === V) theoStatus = E
  })
  const theoretical = dishes.some(d => d.sold) ? f(theoUnit ? r2(theo) : null, theoUnit ? theoStatus : M, `POS × recipes, last ${data.days} days`, theoWhy.join(' · ') || null) : f(null, M, null, `no dish using it was sold in the last ${data.days} days`)
  if (theoretical.v != null) { theoretical.unit = theoUnit; if (theoStatus === M) theoretical.partial = true }   // a lower bound: some dishes could not be counted
  const out = Object.assign(base, {
    knowledge: true, days: data.days,
    identity: { id: ing.id, name: ing.name, name_it: ing.name_it || null, name_es: ing.name_es || null, base_unit: f(ing.base_unit, ing.base_unit ? V : M, 'ingredient sheet'), category: ing.category || null },
    conversions: conversions(ing, facts, data.conv, data.each, usedUnits),
    policy: facts && facts.policy ? f(facts.policy, V, 'food_cost ingredient policy') : null,
    recipes, dishes, theoretical,
    stock: stockOf(data, id),
  })
  if (chef) {
    out.vendors_k = (data.vendors || []).filter(v => v.ingredient_id === id && v.active !== false)
      .sort((a, b) => String(a.vendor || '').localeCompare(String(b.vendor || '')) || String(a.vendor_sku || '').localeCompare(String(b.vendor_sku || ''))).map(v => vendorFacts(v, ing))
    out.aliases = (data.aliases || []).filter(a => a.ingredient_id === id && a.active !== false).map(a => ({ vendor: a.vendor, sku: a.vendor_sku || null, description: a.vendor_description || null, confirmed_by: a.confirmed_by || null }))
    const p = facts && facts.price
    out.price = p ? Object.assign(f(true, p.price_class === 'A' && !(p.conflicts > 0) ? V : E, `FC05 price · ${p.vendor || ''}${p.last_invoice_date ? ' · ' + p.last_invoice_date : ''}`, (p.warnings || []).join('; ') || (p.conflicts > 0 ? `${p.conflicts} conflicting prices` : null)),
      { per_each: num(p.cost_per_each), per_g: p.basis_dim === 'mass' ? num(p.cost_per_base) : null, per_ml: num(p.cost_per_ml), pack: p.pack_description || null, class: p.price_class || null })
      : facts && facts.policy ? null : f(null, M, null, 'no usable invoice price')
    // per-gram price that rests on an unapproved piece weight is an estimate, not a verified price
    if (out.price && out.price.per_g != null && out.conversions.piece_g.s !== V && out.vendors_k.some(v => v.checks.some(c => /per-gram price assumes/.test(c.msg)))) out.price.per_g_status = E
    out.invoices = (data.invoices || []).slice(0, 8).map(l => { const a = lineAmount(l)
      return { date: l.invoice_date, vendor: l.vendor, number: l.invoice_number || l.doc_number || null, number_src: l.invoice_number ? 'invoice line' : l.doc_number ? 'original document' : null,
        description: l.raw_description, sku: l.vendor_sku || null, qty: num(l.qty), unit: l.purchase_unit || null, pack: l.pack_description || null, amount: a.s === V ? { qty: r2(a.amt), unit: a.unit, rule: a.rule } : null, amount_why: a.s === V ? null : a.why,
        unit_price: num(l.unit_price), total: num(l.line_total) } })
    // bought vs used, same window: only lines whose amount is unambiguous (see lineAmount)
    const since = data.since
    const inWin = (data.invoices || []).filter(l => l.invoice_date >= since)
    let bought = 0, bUnit = null, bOk = inWin.length > 0, bWhy = null
    inWin.forEach(l => { const a = lineAmount(l)
      if (a.s !== V) { bOk = false; bWhy = bWhy || a.why; return }
      if (bUnit && bUnit !== a.unit) { bOk = false; bWhy = 'invoices in different units'; return }
      bUnit = a.unit; bought += a.amt })
    out.bought = inWin.length ? f(bOk ? r2(bought) : null, bOk ? V : M, `invoices since ${since}`, bOk ? null : bWhy) : f(null, M, null, `no invoice since ${since}`)
    if (out.bought.v != null) out.bought.unit = bUnit
  }
  return out
}
function stockOf(data, id) {
  const preps = (data.prep || []).filter(p => p.ingredient_id === id)
  const counts = (data.counts || []).filter(c => preps.some(p => p.id === c.prep_task_id)).sort((a, b) => String(b.counted_at).localeCompare(String(a.counted_at)))
  if (counts.length) { const c = counts[0]; return Object.assign(f(num(c.counted_qty), V, `counted by ${c.counted_by || '?'} · ${String(c.counted_at).slice(0, 16).replace('T', ' ')}`), { unit: c.unit || null, at: c.counted_at }) }
  return f(null, M, null, preps.length ? 'no count of the linked prep' : 'Brigade does not count this ingredient')
}

/* ---------------- "To complete" (Chef, Office): the gaps, one list per kind ---------------- */
/** data: { ingredients, bom, vendors, facts (all bom ingredients), unmatched (invoice lines w/o ingredient, recent),
 *          nonumber {total, recoverable}, posFood ([{name, qty}] last N days), recipes } */
export function gaps(data) {
  const used = {}; (data.bom || []).forEach(b => { if (b.item_id) (used[b.item_id] = used[b.item_id] || []).push(b.unit) })
  const I = {}; (data.ingredients || []).forEach(i => { I[i.id] = i })
  const vend = {}; (data.vendors || []).filter(v => v.active !== false).forEach(v => { (vend[v.ingredient_id] = vend[v.ingredient_id] || []).push(v) })
  const facts = data.facts || {}
  const row = (id, note) => ({ id, name: (I[id] || {}).name || '?', note })
  const L = { no_vendor: [], pack_unclear: [], unit_mismatch: [], piece_estimate: [], piece_missing: [], density_missing: [], price_missing: [] }
  Object.keys(used).filter(id => I[id]).sort((a, b) => I[a].name.localeCompare(I[b].name)).forEach(id => {
    const ing = I[id], fc = facts[id] || {}, units = used[id], vs = vend[id] || []
    if (!vs.length && !fc.policy) L.no_vendor.push(row(id, `${units.length} recipe line(s)`))
    vs.forEach(v => { const vf = vendorFacts(v, ing)
      if (vf.pack.s !== V) L.pack_unclear.push(row(id, `${v.vendor}: "${v.pack_description || '—'}"${vf.pack.why ? ' — ' + vf.pack.why : ''}`))
      vf.checks.filter(c => /Purchase unit/.test(c.msg)).forEach(c => L.unit_mismatch.push(row(id, `${v.vendor}: ${c.msg}`))) })
    if (fc.policy) return   // non-food / zero-cost items: counted as they are, no weight needed
    const c = conversions(ing, fc, [], [], units)
    if (c.needed.piece && c.piece_g.s === E) L.piece_estimate.push(row(id, `${c.piece_g.v} g · ${c.piece_g.src}`))
    if (c.needed.piece && c.piece_g.s === M) L.piece_missing.push(row(id, [...new Set(units.filter(u => dimOf(u) === 'c'))].join(', ') + ` · ${units.length} recipe line(s)`))
    if (c.needed.volume && c.density.s === M) L.density_missing.push(row(id, [...new Set(units.filter(u => dimOf(u) === 'v'))].join(', ') + ` · ${units.length} recipe line(s)`))
    if (!fc.price && !fc.policy && vs.length) L.price_missing.push(row(id, 'vendor present, no usable invoice price'))
  })
  const mapped = new Set((data.recipes || []).flatMap(r => posNames(r).map(n => n.toLowerCase())))
  const pos = (data.posFood || []).filter(p => !mapped.has(String(p.name).trim().toLowerCase())).sort((a, b) => b.qty - a.qty)
  return { lists: L, invoices_unmatched: data.unmatched || [], invoices_no_number: data.nonumber || null,
    pos_unmapped: pos, pos_total: (data.posFood || []).reduce((a, p) => a + (num(p.qty) || 0), 0), pos_unmapped_qty: pos.reduce((a, p) => a + (num(p.qty) || 0), 0),
    used_ingredients: Object.keys(used).filter(id => I[id]).length }
}
