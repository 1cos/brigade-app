// Recipe completeness + ingredient cards (B-25 module 2) — ONE engine, ported from Shell V020 (app.js
// completenessRows / r-complete, r-ing, ing; commit 23f5616). Pure functions: the server runs them on live
// Brigade data, the tests on read-only dumps. Prices and vendors are built ONLY when chef = true.

const byId = (list, key = 'id') => { const m = {}; (list || []).forEach(x => { m[x[key]] = x }); return m }
const num = v => { const n = parseFloat(v); return isFinite(n) ? n : null }

/* ATTENTION01 — recipe completeness: a quiet checklist, never a decision. Same rule as V020 completenessRows. */
export const COMPLETE_KINDS = ['deferred', 'photo', 'procedure', 'portions']
export function completeness(attention, recipes) {
  const rec = byId(recipes)
  const rows = (attention || []).filter(a => a.origin === 'office' && a.attention === 'backlog' && a.recipe_id && rec[a.recipe_id])
    .map(a => ({ kind: a.reason === 'deferred_by_chef' ? 'deferred' : a.family === 'missing_photo' ? 'photo' : a.family === 'missing_procedure' ? 'procedure' : 'portions', r: rec[a.recipe_id] }))
  const out = {}
  COMPLETE_KINDS.forEach(k => {
    out[k] = rows.filter(x => x.kind === k).sort((a, b) => a.r.title.localeCompare(b.r.title)).map(x => ({ id: x.r.id, title: x.r.title, category: x.r.category || '' }))
  })
  return { total: rows.length, groups: out }
}

/* Ingredients list: every ingredient in Brigade, in Brigade's order by name (V020 r-ing). Vendor count and "do not order" only for Chef. */
export function ingredientList(ingredients, vendors, chef) {
  const vg = {}; if (chef) (vendors || []).forEach(v => { (vg[v.ingredient_id] = vg[v.ingredient_id] || []).push(v) })
  return (ingredients || []).map(i => Object.assign({ id: i.id, name: i.name, name_it: i.name_it || null, name_es: i.name_es || null, category: i.category || '', active: i.active !== false },
      chef ? { vendors: (vg[i.id] || []).length, dno: (vg[i.id] || []).some(v => v.do_not_order) } : {}))
}

/* Ingredient card (V020 ing): facts, used in (recipes whose BOM lists it), prep; vendors and prices for Chef only. */
export function ingredientCard(id, data, chef) {
  const i = (data.ingredients || []).find(x => x.id === id); if (!i) return null
  const rec = byId(data.recipes)
  const used = [...new Set((data.bom || []).filter(b => b.item_id === id).map(b => b.parent_recipe_id))].map(x => rec[x]).filter(Boolean)
    .sort((a, b) => a.title.localeCompare(b.title)).map(r => ({ id: r.id, title: r.title }))
  const preps = (data.prep || []).filter(t => t.ingredient_id === id).map(t => ({ id: t.id, name: t.name }))
  const card = {
    ingredient: { id: i.id, name: i.name, name_it: i.name_it || null, name_es: i.name_es || null, category: i.category || '', base_unit: i.base_unit || null, measure_type: i.measure_type || null,
      avg_unit_weight_g: num(i.avg_unit_weight_g), yield_factor: num(i.yield_factor), active: i.active !== false, notes: i.notes || null },
    used_in: used, preps, can_price: !!chef,
  }
  if (chef) card.vendors = (data.vendors || []).filter(v => v.ingredient_id === id).map(v => ({ vendor: v.vendor, sku: v.vendor_sku || null, pack: v.pack_description || v.purchase_unit || null,
    last_invoice_date: v.last_invoice_date || null, price_per_100g: num(v.price_per_100g), price_per_each: num(v.price_per_each), unit_price: num(v.unit_price),
    do_not_order: !!v.do_not_order, do_not_order_reason: v.do_not_order_reason || null }))
  return card
}
