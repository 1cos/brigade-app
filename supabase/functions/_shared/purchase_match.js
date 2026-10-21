// Suggested purchase match (B-49 R1.15, Chef GO 21/10/2026) — READ ONLY, pure functions (server + tests run THIS file).
// When an ingredient has no vendor, no price, only an occasional price or no recent invoice, look in EVERY invoice line
// (all history), vendor sheets, SKUs and aliases for a purchased article that may be it, and say WHY.
// Never links anything by itself: a name alone is never enough for a strong match, and a candidate the Chef rejected
// is not proposed again. One canonical article: a match points to the Brigade ingredient that already receives the invoices.
import { parsePack, vendorName } from './knowledge_core.js'
import { dimOf, normUnit } from './mre_engine.js'

// words that mean the same thing on invoices and in recipes (English / Italian / vendor abbreviations)
const SYN = { chz: 'cheese', formaggio: 'cheese', alum: 'aluminum', aluminium: 'aluminum', alluminium: 'aluminum', alluminio: 'aluminum', alu: 'aluminum',
  cont: 'container', contenitore: 'container', contenitori: 'container', ctnr: 'container', parm: 'parmesan', parmigiano: 'parmesan', parmigiana: 'parmesan',
  spinaci: 'spinach', spin: 'spinach', burro: 'butter', pepe: 'pepper', bianco: 'white', nero: 'black', pomodoro: 'tomato', pomodori: 'tomato', tom: 'tomato',
  mos: 'months', mesi: 'months', mo: 'months', bby: 'baby', crm: 'cream', panna: 'cream', latte: 'milk', farina: 'flour', zucchero: 'sugar', sale: 'salt',
  aglio: 'garlic', cipolla: 'onion', cipolle: 'onion', limone: 'lemon', limoni: 'lemon', uova: 'egg', uovo: 'egg', eggs: 'egg', olio: 'oil', aceto: 'vinegar',
  bicchierini: 'cup', bicchiere: 'cup', coppette: 'cup', noce: 'nutmeg', moscata: 'nutmeg', basilico: 'basil', prezzemolo: 'parsley', gamberi: 'shrimp' }
// weak equivalences (half weight): a cup can be a container
const WEAK = { cup: ['container'], container: ['cup'] }
// a different KIND of product: "olive oil" is not "olives", "tomato sauce" is not "tomatoes" — the article is demoted
const KIND = new Set(['oil', 'sauce', 'juice', 'powder', 'puree', 'paste', 'dressing', 'soup', 'chip', 'dip', 'cracker', 'vinegar', 'syrup', 'extract', 'seasoning', 'mix', 'stock', 'broth', 'concentrate', 'jam', 'spread', 'candy', 'cookie', 'bar', 'drink', 'soda', 'scoop', 'lid', 'spoon', 'knife', 'glove', 'bag', 'liner', 'wrap', 'foil'])
const STOP = new Set(['the', 'and', 'of', 'with', 'w', 'di', 'da', 'la', 'il', 'lo', 'le', 'i', 'per', 'con', 'in', 'a', 'fresh', 'fresco', 'freschi', 'fresca', 'grade', 'case', 'cs', 'ea', 'each', 'ct', 'pk', 'pack', 'lb', 'lbs', 'oz', 'kg', 'g', 'gr', 'gal', 'qt', 'pt', 'ml', 'l', 'x'])
export function tokens(s) {
  return [...new Set(String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
    .filter(w => w && !/^\d+([.,]\d+)?$/.test(w) && !/^\d+[a-z]{1,3}$/.test(w))
    .map(w => SYN[w] || w).map(w => SYN[w.replace(/s$/, '')] || (w.length > 3 && /s$/.test(w) && !/ss$/.test(w) ? w.slice(0, -1) : w))
    .filter(w => !STOP.has(w) && w.length > 1))]
}
/** How much of the INGREDIENT name the article covers (0..1): the article may say more ("4 oz utility"), never less. */
export function nameScore(ingTok, artTok) {
  if (!ingTok.length) return { s: 0, hit: [] }
  const A = new Set(artTok); let s = 0; const hit = []
  for (const t of ingTok) { if (A.has(t)) { s += 1; hit.push(t) } else if ((WEAK[t] || []).some(w => A.has(w))) { s += 0.5; hit.push(t + '≈' + WEAK[t].find(w => A.has(w))) } }
  return { s: s / ingTok.length, hit }
}
const num = x => x == null || x === '' || !isFinite(Number(x)) ? null : Number(x)
const MASS_G = { g: 1, kg: 1000, lb: 453.592, oz: 28.3495 }
/** Unit price of an article from its last invoice line: per piece (count packs) or per 100 g (weighed packs); null when the pack is not readable. */
function unitPrice(l) {
  const p = parsePack(l.pack), up = num(l.up)
  if (up == null || p.status !== 'verified') return null
  if (p.dim === 'count') return { each: up / p.total, basis: `${l.pack} → ${p.total} pz` }
  if (p.dim === 'mass') return { per100g: up / (p.total * MASS_G[p.unit]) * 100, basis: `${l.pack} → ${Math.round(p.total * MASS_G[p.unit])} g` }
  return null
}
const dimName = d => d === 'count' ? 'c' : d === 'mass' ? 'm' : d === 'volume' ? 'v' : null
/** Does this ingredient need help? (no vendor / no price / occasional price / no invoice in 90 days) */
export function needsMatch(ingId, data, facts, today) {
  const f = facts || {}, p = f.price, inv = (data.inv || []).filter(l => l.ing === ingId)
  const last = inv.map(l => l.d).sort().pop() || null
  const since = new Date(new Date(today || Date.now()).getTime() - 90 * 86400000).toISOString().slice(0, 10)
  if (!p && f.policy !== 'zero_cost') return { need: true, why: inv.length ? 'no_price' : 'no_invoice' }
  if (p && p.price_class && p.price_class !== 'A') return { need: true, why: 'occasional_price' }
  if (!last || last < since) return { need: true, why: 'no_recent_invoice' }
  return { need: false, why: null }
}
/**
 * Candidates for one ingredient. data: { inv, ing, vend, alias, bomu } (read-only rows), decisions: [{key, decision, target}],
 * opt: { more } → also weaker candidates. Returns { candidates, rejected } — best first, never more than 3 (10 with more).
 */
export function matchCandidates(ingId, data, decisions = [], opt = {}) {
  const I = {}; (data.ing || []).forEach(i => { I[i.id] = i })
  const me = I[ingId]; if (!me) return { candidates: [], rejected: 0 }
  const meTok = [...new Set([...tokens(me.name), ...tokens(me.name_it)])]
  // the recipe's way of using it: pieces / weight / volume
  const useDims = [...new Set((data.bomu || []).filter(b => b.ing === ingId).map(b => dimOf(b.u)).filter(Boolean))]
  const mySkus = new Set((data.vend || []).filter(v => v.ing === ingId && v.sku).map(v => v.v + '|' + v.sku))
  // group every invoice line into purchasable articles (vendor + SKU, or vendor + description)
  const art = {}
  for (const l of data.inv || []) {
    if (!l.desc) continue
    const key = (l.v || '?') + '|' + (l.sku ? 'sku:' + l.sku : 'd:' + tokens(l.desc).join(' '))
    const a = art[key] || (art[key] = { key, vendor_raw: l.v, sku: l.sku || null, description: l.desc, lines: [], ings: {} })
    a.lines.push(l); if (l.ing) a.ings[l.ing] = (a.ings[l.ing] || 0) + 1
  }
  const dec = {}; decisions.forEach(d => { dec[d.key] = d })
  const out = []; let rejected = 0
  for (const a of Object.values(art)) {
    const linked = Object.entries(a.ings).sort((x, y) => y[1] - x[1])[0], target = linked ? linked[0] : null
    if (target === ingId) continue                                                   // already this ingredient's purchase
    a.lines.sort((x, y) => String(y.d).localeCompare(String(x.d)))
    const last = a.lines[0], first = a.lines[a.lines.length - 1]
    const descTok = tokens(a.description), targetTok = target && I[target] ? tokens(I[target].name) : []
    const nm = nameScore(meTok, [...new Set([...descTok, ...targetTok])])
    const sameSku = a.sku && [...mySkus].some(k => k === a.vendor_raw + '|' + a.sku)
    const aliasHit = (data.alias || []).some(x => x.ing === ingId && x.v === a.vendor_raw && ((x.sku && x.sku === a.sku) || tokens(x.desc).join(' ') === descTok.join(' ')))
    const pk = parsePack(last.pack), packDim = pk.status === 'verified' ? dimName(pk.dim) : null
    const unitOk = !useDims.length || !packDim ? null : useDims.includes(packDim) ? true : false
    const otherKind = descTok.filter(t => KIND.has(t) && !meTok.includes(t))
    let score = nm.s + (unitOk === true ? 0.15 : unitOk === false ? -0.2 : 0) + (a.lines.length >= 3 ? 0.05 : 0) - (otherKind.length ? 0.5 : 0)
    if (sameSku || aliasHit) score = Math.max(score, 1.2)
    const d = dec[a.key]
    if (d && d.decision === 'non_corrisponde') { rejected++; continue }
    // strong only with: name covering the whole ingredient (≥ 0.75) AND compatible unit — or same SKU / confirmed alias
    const level = d && d.decision === 'collega' ? 'collegato' : sameSku || aliasHit ? 'forte' : nm.s >= 0.75 && unitOk !== false && !otherKind.length ? (unitOk === true ? 'forte' : 'possibile') : nm.s >= 0.5 && opt.more ? 'debole' : null
    if (!level) continue
    const why = []
    if (sameSku) why.push({ k: 'sku', v: a.sku })
    if (aliasHit) why.push({ k: 'alias' })
    if (nm.hit.length) why.push({ k: 'name', v: nm.hit.join(', ') })
    if (unitOk === true) why.push({ k: 'unit_ok', v: packDim })
    if (unitOk === false) why.push({ k: 'unit_diff', v: packDim })
    if (otherKind.length) why.push({ k: 'other_kind', v: otherKind.join(', ') })
    why.push({ k: 'invoices', v: a.lines.length, from: first.d, to: last.d })
    if (target && I[target]) why.push({ k: 'canonical', v: I[target].name })
    out.push({ key: a.key, level, score: Math.round(score * 100) / 100, vendor: vendorName(a.vendor_raw), vendor_raw: a.vendor_raw, sku: a.sku, description: a.description,
      target: target && I[target] ? { id: target, name: I[target].name, base_unit: I[target].base } : null,
      invoices: a.lines.length, first: first.d, last: { date: last.d, number: last.num || null, qty: num(last.qty), unit: last.pu || null, pack: last.pack || null, unit_price: num(last.up), total: num(last.tot) },
      price: unitPrice(last), why })
  }
  out.sort((x, y) => (y.level === 'collegato') - (x.level === 'collegato') || y.score - x.score || String(y.last.date).localeCompare(String(x.last.date)))
  // ambiguous: two different articles with almost the same evidence → both marked, the Chef chooses
  const top = out.filter(c => c.level === 'forte' || c.level === 'possibile')
  if (top.length > 1 && Math.abs(top[0].score - top[1].score) < 0.1 && (top[0].target || {}).id !== (top[1].target || {}).id) { top[0].ambiguous = true; top[1].ambiguous = true }
  return { candidates: out.slice(0, opt.more ? 10 : 3), rejected, use: useDims }
}
