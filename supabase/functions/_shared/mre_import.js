// MRE import (B-49) — ONE converter from a Brigade recipe to a lab document, shared by tools/mre_import.mjs (the 20
// pilots, 15/10) and the server (Chef "Edit" on any recipe, B-25 16/10). Pure function: reads nothing, writes nothing.
// Nothing is resolved automatically: text vs BOM differences are listed for the Chef. Provisional base = the BOM.
import { normUnit, dimOf } from './mre_engine.js'

// Hand-written lists in bot-direct-deduction v9 (verified 15/10) → become recipe data (role of the line)
const HYBRID = new Set(['dcaa616a-1fcb-41b6-957d-6036bfdc0729', 'dbdc80fd-142f-4ca1-8f83-7bcebe19ee63', '4429c13f-8811-4e50-b9cc-77c8c9128da3', '876ed092-6c9a-4c4b-b851-575aeba71231', '146ff381-49ba-46e1-b413-aea7bce1f265', '9e4ea921-93dc-4aaa-b2f2-2ff476dc3a08', '68b4e977-797a-4221-b9ec-3b9ed3233633', '14ccae9f-00b8-4f50-8b43-2cb8010d8ead'])
const CAKE_GARNISH = { '9e4ea921-93dc-4aaa-b2f2-2ff476dc3a08': ['fb674769-70bf-4c88-a419-a5de20dec44f'], '68b4e977-797a-4221-b9ec-3b9ed3233633': ['fb674769-70bf-4c88-a419-a5de20dec44f', 'd946f567-1356-4758-b510-350640d7e25f'] }
// B-48 (Chef Max 15/10): Mint Bavarese decorative chocolate and meringue are at the plate
const MINT = '68b4e977-797a-4221-b9ec-3b9ed3233633'

const norm = s => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^a-z ]/g, ' ').split(/\s+/).filter(w => w.length > 1).map(w => w.replace(/s$/, '')).join(' ')
const sim = (a, b) => { const A = new Set(a.split(' ')), B = new Set(b.split(' ')); if (!A.size || !B.size) return 0; let n = 0; A.forEach(x => { if (B.has(x)) n++ }); return n / Math.min(A.size, B.size) }
const MASSG = { g: 1, kg: 1000, oz: 28.3495, lb: 453.592, mg: 0.001 }
const toG = (q, u) => { const k = normUnit(u); return k in MASSG && isFinite(Number(q)) ? Number(q) * MASSG[k] : null }
const fmtq = (q, u) => `${q == null || q === '' ? '?' : Number(q)} ${u || ''}`.trim()

/**
 * id: recipe id · r: public.recipes row · rows: its recipe_bom rows (+ ing_name, ing_base, policy), ordered
 * stepRows: its recipe_steps · prepRows: its non-archived prep_tasks · y: its recipe_yield row · byId: id → recipes row (sub-recipe names)
 * importedAt: ISO time written in the frozen source snapshot
 */
export function buildLabDoc({ id, r, rows, stepRows, prepRows, y, byId, importedAt }) {
  y = y || {}
  const lines = rows.map((b, i) => {
    let role = 'produzione', role_src = 'predefinito'
    if (b.component_type === 'ITEM' && b.policy === 'non_food') { role = 'imballo'; role_src = 'ingredient_policy non_food' }
    if (HYBRID.has(id) && b.component_type === 'RECIPE') { role = 'al_piatto'; role_src = 'HYBRID_PARENT_ALLOWLIST (bot v9)' }
    if ((CAKE_GARNISH[id] || []).includes(b.sub_recipe_id)) { role = 'al_piatto'; role_src = 'CAKE_SLICE_GARNISH (bot v9)' }
    if (id === MINT && b.component_type === 'ITEM' && /chocolate|cioccolat|fondente|meringue|meringa/i.test(b.ing_name || '')) { role = 'al_piatto'; role_src = 'B-48 Chef Max 15/10' }
    return { id: 'b' + b.bom_id, kind: b.component_type === 'RECIPE' ? 'recipe' : 'ingredient', ref: b.component_type === 'RECIPE' ? b.sub_recipe_id : b.item_id,
      qty: b.quantity == null ? null : Number(b.quantity), unit: b.unit || null, role, note: b.notes || null, group: null, src: { bom_id: b.bom_id, role_src } }
  })
  const nameOf = l => l.kind === 'recipe' ? (byId[l.ref] || {}).title || '' : (rows.find(b => 'b' + b.bom_id === l.id) || {}).ing_name || ''

  // steps: recipe_steps (it/en/es) when present, otherwise the procedure text as one step per paragraph. Text kept verbatim.
  let st = stepRows.map(s => ({ title_it: s.title_it || null, title_en: s.title || null, title_es: s.title_es || null, it: s.instruction_it || '', en: s.instruction_en || '', es: s.instruction_es || '' }))
  if (!st.length) {
    const split = t => String(t || '').split(/\n\s*\n|\n(?=\s*\d+[.)])/).map(x => x.trim()).filter(Boolean)
    const it = split(r.procedure), en = split(r.procedure_en), es = split(r.procedure_es)
    const n = Math.max(it.length, en.length, es.length)
    st = Array.from({ length: n }, (_, k) => ({ it: it[k] || '', en: en[k] || '', es: es[k] || '' }))
  }
  // link numbers in the text to lines: only when the number+unit equals exactly ONE line and that line's name is near it
  let linked = 0, unlinked = 0
  const NUM = /(\d+(?:[.,]\d+)?)(\s?)(kg|g|gr|grams|ml|l|lt|oz|lb|lbs|pz|pcs|pezzi|each)?\b/gi
  for (const s of st) for (const k of ['it', 'en', 'es']) {
    s[k] = String(s[k] || '').replace(NUM, (m, num, sp, u, off, whole) => {
      const q = Number(num.replace(',', '.')), ku = u ? normUnit(u) : null
      if (!u) return m                                                    // bare numbers (temperatures, minutes…) are never linked
      const near = norm(whole.slice(Math.max(0, off - 40), off + m.length + 50))
      const cand = lines.filter(l => Number(l.qty) === q && normUnit(l.unit) === ku)
      const named = cand.filter(l => { const nm = norm(nameOf(l)); return nm && nm.split(' ').some(w => w.length > 2 && near.includes(w)) })
      const pick = named.length === 1 ? named[0] : cand.length === 1 ? cand[0] : null
      if (!pick) { unlinked++; return m }
      linked++; return `{{${pick.id}}}${sp}${u}`
    })
  }

  // text vs BOM differences (never resolved automatically)
  const diffs = []
  const text = Array.isArray(r.ingredients) ? r.ingredients.filter(l => l && l.type !== 'section') : []
  if (!text.length) diffs.push({ type: 'testo_vuoto', note: 'La ricetta scritta non ha ingredienti: oggi la scheda normale di Brigade non ne mostra nessuno. Base provvisoria: la distinta.' })
  else {
    const used = new Set()
    for (const l of lines) {
      const bn = norm(nameOf(l)); let best = -1, bs = 0
      text.forEach((t, j) => { if (used.has(j)) return; const s = sim(bn, norm(`${t.name || ''} ${t.comment || ''}`)); if (s > bs) { bs = s; best = j } })
      if (best >= 0 && bs >= 0.6) {
        used.add(best); const t = text[best]
        const g1 = toG(l.qty, l.unit), g2 = toG(t.qty, t.unit)
        const same = g1 != null && g2 != null ? Math.abs(g1 - g2) <= Math.max(0.5, 0.02 * Math.max(g1, g2)) : (normUnit(l.unit) === normUnit(t.unit) && Number(l.qty) === Number(t.qty))
        if (!same) diffs.push({ type: 'quantita_diversa', line: l.id, distinta: `${nameOf(l)} ${fmtq(l.qty, l.unit)}`, testo: `${t.name || ''} ${fmtq(t.qty, t.unit)}`.trim(), note: 'Base provvisoria: la distinta.' })
      } else diffs.push({ type: 'solo_in_distinta', line: l.id, distinta: `${nameOf(l)} ${fmtq(l.qty, l.unit)}`, note: 'Riga presente nella distinta, non trovata nel testo.' })
    }
    text.forEach((t, j) => { if (!used.has(j)) diffs.push({ type: 'solo_nel_testo', testo: `${t.name || ''} ${fmtq(t.qty, t.unit)}${t.comment ? ' (' + t.comment + ')' : ''}`.trim(), note: 'Riga presente nel testo, NON portata nella ricetta: decide lo Chef.' }) })
  }
  if (y.conflict) diffs.push({ type: 'resa_in_conflitto', note: y.conflict })
  lines.forEach(l => { if (dimOf(l.unit) == null) diffs.push({ type: 'unita_da_definire', line: l.id, distinta: `${nameOf(l)} ${fmtq(l.qty, l.unit)}`, note: 'Unità mancante o "da definire".' }) })
  if (unlinked) diffs.push({ type: 'numeri_non_collegati', note: `${unlinked} quantità scritte nel procedimento non sono state collegate a una riga (non si aggiornano quando scali).` })

  const doc = {
    schema: 1, id, title: r.title, category: r.category || null,
    yield: Object.assign({ g: y.yield_dim === 'mass' && Number(y.yield_qty) > 0 ? Number(y.yield_qty) : null, portions: Number(y.portions) > 0 ? Number(y.portions) : null, label: r.yield_text || null },
      // pieces per lot when the portion is counted in pieces (e.g. 25 portions × 2 nests = 50 nests): same rule FC05 uses (serving_qty × portions)
      dimOf(r.serving_unit) === 'c' && Number(r.serving_qty) > 0 && Number(y.portions) > 0 ? { count: Number(y.portions) * Number(r.serving_qty), count_unit: normUnit(r.serving_unit) } : {}),
    has_stock: prepRows.length > 0, stock: prepRows.map(p => ({ prep_task_id: p.id, name: p.name, unit: p.unit })),
    lines, steps: st, notes: null,
  }
  const source = { at: importedAt || new Date().toISOString(), recipe: { title: r.title, category: r.category, yield_text: r.yield_text, base_servings: r.base_servings, base_weight: r.base_weight, weight_unit: r.weight_unit, base_weight_g: r.base_weight_g, serving_weight_g: r.serving_weight_g, serving_qty: r.serving_qty, serving_unit: r.serving_unit, ingredients: r.ingredients, procedure: r.procedure, procedure_en: r.procedure_en, procedure_es: r.procedure_es }, recipe_yield: y, bom: rows.map(({ ing_name, ing_base, policy, ...b }) => b), steps: stepRows, preps: prepRows }
  return { doc, source, diffs, report: { lines: lines.length, steps: st.length, linked, unlinked, diffs: diffs.length, diff_types: [...new Set(diffs.map(d => d.type))], has_stock: doc.has_stock, yield: doc.yield } }
}
