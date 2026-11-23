// B-99c — FOOD COST CATERING vivo in Brigade 2 (MASTER RECIPE / Max 09/11/2026). Funzioni PURE (server e prove).
// La pagina del browser ha il suo calcolo (identico a B-99); qui si costruiscono i DATI che la pagina legge:
//   ruleTable()   tabelle di quantità per N persone, dalle STESSE regole del preventivo (B-88 = census v1.4) + le regole di Max del 05/11
//   priceBook()   listino dei consuntivi chiusi (+ le voci che Max ha chiesto il 05/11)
//   buildCheck()  per ogni evento: prezzo di Brigade alla DATA dell'evento (ultima fattura ≤ data), contro il listino
//   planFromMenu() menu Tripleseat → piatti (con regola / senza regola)
import * as Q from './catering_quote.js'

export const NMAX = 220

/* ---- listino: come lo usa la pagina (d descrizione, u unità, p prezzo, v fornitore, s fonte, st stato) ---- */
export function priceBook() {
  const out = {}
  for (const [k, [d, u, p, v, s, st]] of Object.entries(Q.P)) out[k] = { d, u, p, v, s, st }
  // salsa pizza: voce composta (stessa formula di quote() nel preventivo B-88)
  const pr = k => (out[k] && out[k].p) || 0
  out.pizza_sauce = { d: 'Salsa pizza (R31)', u: 'g', p: (3000 * pr('pelati_gg') + 50 * pr('evo') + 3 * pr('rosemary') + 15 * pr('basil')) / 3068, v: 'mix', s: 'pelati GG + olio + rosmarino + basilico', st: 'CHEF STANDARD' }
  // Max 05/11: Mini Tiramisù = ricetta di Mamma Monica (Shop'NCook): anche uova, zucchero a velo, cacao, in proporzione al mascarpone
  out.egg_whole = { d: 'Eggs (crema tiramisù)', u: 'pz', p: 0.07772222222222222, v: "Hardie's", s: '19/10 15 DZ', st: 'VERIFIED' }
  out.powdered_sugar = { d: 'Powdered Sugar (crema tiramisù)', u: 'g', p: 0.0031636360429637207, v: 'Walmart Business', s: '29/10 32oz', st: 'VERIFIED' }
  out.cocoa = { d: 'Cocoa Powder (tiramisù)', u: 'g', p: 0.026323215576994304, v: 'Walmart Business', s: '15/09 8oz', st: 'VERIFIED' }
  return out
}

/* ---- tabelle regola: t[N] = [etichetta, [[pid, quantità]], note] ---- */
const r6 = x => Math.round(x * 1e6) / 1e6
export function ruleTable(rule, opts = {}) {
  const t = []
  for (let N = 0; N <= NMAX; N++) {
    if (N === 0) { t.push(['0 persone', [], []]); continue }
    const [q, rows, notes] = Q.ruleRows(rule, N, { ...opts })
    t.push([q, rows.map(([p, v]) => [p, r6(v)]), notes])
  }
  if (rule === 'mini_tiramisu') for (const row of t) {
    const mq = Object.fromEntries(row[1]).mascarpone
    if (mq) { row[1] = [...row[1], ['egg_whole', r6(mq * 13 / 1250)], ['powdered_sugar', r6(mq * 250 / 1250)], ['cocoa', r6(mq * 50 / 1250)]]
      row[2] = [...row[2], "uova, zucchero a velo e cacao in proporzione alla ricetta Tiramisu di Mamma Monica (Shop'NCook)"] }
  }
  return t
}
export const rkeyOf = (rule, opts) => rule + '|' + (opts && Object.keys(opts).length ? JSON.stringify(sortKeys(opts)) : '')
const sortKeys = o => Object.fromEntries(Object.keys(o).sort().map(k => [k, o[k]]))

/* ---- prezzi di Brigade alla data dell'evento (stessa logica di build.py B-99) ---- */
// voce del listino → (nome ingrediente Brigade, grandezza: 'g' prezzo al grammo da cost_per_100g · 'each' prezzo unitario / DIV)
export const MAP = {
  taralli: ['Taralli', 'g'], salame: ['Salame', 'g'], ricotta: ['Ricotta', 'g'], parm_grated: ['Parmesan Cheese', 'g'],
  grape_green: ['Grape', 'g'], cherry_tomato: ['Cherry Tomatoes', 'g'], mozz_slice: ['Sliced Mozzarella', 'g'],
  basil: ['Basil', 'g'], cantaloupe: ['Cantaloupe', 'each'], strawberries: ['Strawberries', 'each'],
  blackberry: ['Blackberry', 'each'], blueberry: ['Blueberry', 'each'], flour00: ['Caputo Flour', 'g'],
  evo: ['Extra Virgin Olive Oil', 'g'], french_bread: ['French Bread', 'each'], mozz_shred: ['Shredded Mozzarella', 'g'],
  arugula: ['Arugula', 'g'], glaze: ['Balsamic Glaze', 'g'], butter: ['Butter', 'g'], romaine: ['Romaine', 'g'],
  spring_mix: ['Spring Mix', 'g'], carrots: ['Carrots', 'g'], caesar_dress: ['Caesar Dressing', 'g'],
  asparagus: ['Asparagus', 'g'], potatoes: ['Potatoes', 'g'], penne: ['Penne', 'g'], mascarpone: ['Mascarpone', 'g'],
  parma: ['Parma Ham', 'g'], watermelon: ['Watermelon', 'each'], beefsteak: ['Beef Steak Tomatoes', 'each'],
  chicken_grill: ['Chicken Breast - Grill', 'lb'], chicken_premium: ['Chicken Breast', 'lb'],
}
export const MAP_NAMES = [...new Set(Object.values(MAP).map(x => x[0]))]
const DIV = { beefsteak: 18, cantaloupe: 3, blackberry: 3, blueberry: 3, strawberries: 1, french_bread: 1, watermelon: 1, evo: 15000 }

/** data della fonte del listino («26/08 2x3kg», «fatt. 20734 16/06»…) → ISO 2026, come pbdate() di build.py */
export function pbdate(src) {
  const m = /(\d{1,2})\/(\d{2})(?!\d)/.exec(src || ''); if (!m) return null
  const dd = +m[1], mm = +m[2]; if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null
  return `2026-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
}
/** ultima fattura (non anomala) dell'ingrediente con data ≤ giorno. lines: righe con name, invoice_date, ... */
function asof(lines, name, date) {
  const ls = lines.filter(x => x.name === name && x.invoice_date <= date && !x.price_anomaly)
  ls.sort((a, b) => (a.invoice_date < b.invoice_date ? -1 : a.invoice_date > b.invoice_date ? 1 : 0))   // stabile: a parità di data vale l'ultima della lista (come Python)
  return ls.length ? ls[ls.length - 1] : null
}
const num = v => (v == null || v === '' ? null : Number(v))
/** pids usati da un evento → { pid: { pb, br, use } }. book = priceBook(). */
export function buildCheck(eventDate, pids, lines, book) {
  const out = {}
  for (const pid of [...pids].sort()) {
    const pb = book[pid]
    const rec = { pb: { p: pb.p, date: pbdate(pb.s), src: pb.s, st: pb.st, v: pb.v, u: pb.u, d: pb.d }, br: null, use: 'pb' }
    if (MAP[pid]) {
      const [nm, kind] = MAP[pid], x = asof(lines, nm, eventDate)
      if (x) {
        const br = { n: nm, date: x.invoice_date, v: x.vendor, pack: x.pack_description, inv: x.invoice_number, p: null, up: num(x.unit_price) }
        if (kind === 'g' && num(x.cost_per_100g)) br.p = num(x.cost_per_100g) / 100
        else if (kind === 'each' && DIV[pid] && num(x.unit_price)) br.p = num(x.unit_price) / DIV[pid]
        rec.br = br
        if (br.p != null) {
          const same = pb.p != null && Math.abs(br.p - pb.p) / pb.p < 0.005
          const newer = rec.pb.date == null || br.date > rec.pb.date
          if (pb.p == null || (newer && !same && ['VERIFIED', 'PROVISIONAL', 'UNKNOWN'].includes(pb.st))) rec.use = 'br'
        }
      }
    }
    out[pid] = rec
  }
  return out
}
/** pid usati da un piatto-regola: tutti quelli di tutte le N della sua tabella (come used_price_ids) */
export const usedPids = (tables, rkeys) => { const s = new Set(); for (const k of rkeys) for (const row of tables[k]) for (const [p] of row[1]) s.add(p); return s }

/* ---- menu Tripleseat → piatti della pagina ---- */
// bevande e bar non sono food cost (Max 05/11): le righe non riconosciute che parlano di bevande si saltano
const DRINK = /\b(beers?|wines?|spritz|mule|cocktails?|drinks?|bar|prosecco|champagne|liquor|bourbon|vodka|whisk(e)?y|margarita|sangria|soda|juice|coffee|tea|water|open bar|consumption)\b/i
const KEEP_OPTS = ['skewer', 'ripiena', 'contorno', 'spiedini', 'cioccolato', 'premium', 'quota']   // opzioni dal MENU; i numeri (pezzi, fette…) si scrivono nella pagina, mai dal menu
const slug = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48)
const STOP = new Set(['with', 'and', 'the', 'for', 'plus', 'buffet', 'family', 'style', 'served', 'from', 'add', 'extra', 'home', 'made', 'fresh', 'chef', 'wheel', 'cheese', 'in', 'of', 'a', 'on', 'or'])
const words = s => [...new Set(String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter(w => w.length > 2 && !STOP.has(w)).map(w => (w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w)))]
/** ricette Brigade più vicine al nome di un piatto (solo suggerimenti da confermare). recipes: [{id,title,pos_name}] */
export function suggestRecipes(label, recipes, max = 2) {
  const w = words(label); if (!w.length) return []
  return recipes.map(r => { const t = new Set([...words(r.title), ...words(r.pos_name)]); const c = w.filter(x => t.has(x)).length; return { r, score: c / w.length, c } })
    .filter(x => x.c >= 1 && x.score >= 0.6).sort((a, b) => b.score - a.score || a.r.title.length - b.r.title.length).slice(0, max).map(x => x.r)
}
const KNOWN = k => Q.hasRule(k) && !Q.NOT_AUTOMATED[k]
/** sels: [{name, qty, price?}] righe cucina del menu; guestCount: campo ospiti di Brigade. */
export function planFromMenu(sels, guestCount, recipes = []) {
  const d = Q.draftFromLines(sels, guestCount)
  const out = { guests: d.guests, billed: d.billed, template: !!d.template, dishes: [], skipped_drinks: 0 }
  if (d.template || !d.menu.length) return out
  const { lines } = Q.itemsFromMenu(d.menu), used = {}
  const uid = base => { used[base] = (used[base] || 0) + 1; return used[base] === 1 ? base : base + '-' + used[base] }
  for (const l of lines) for (const p of l.parts) {
    const label = p.label || p.text
    if (p.kind === 'RECOGNIZED' && p.items.length && p.items.every(([k]) => KNOWN(k))) {
      for (const [key, opt] of p.items) {
        const opts = {}; for (const k of KEEP_OPTS) if (opt && opt[k] != null) opts[k] = opt[k]
        const pick = /\boption\b|\bchoose\b|\bchoice\b|\bpick\b|\bselect/i.test(l.line || '')   // menu a scelta del cliente: le opzioni NON valgono tutte per tutti gli ospiti
        out.dishes.push({ id: uid(slug(key + '-' + (l.line || label))), rule: key, opts: Object.keys(opts).length ? opts : undefined, label, from: l.line, ref: p.ref || null, rkey: rkeyOf(key, opts),
          ...(pick ? { n0: true, conf: 'Menu a scelta del cliente («option…»): inserisci per quante persone vale questa voce.' } : {}) })
      }
    } else {
      if (DRINK.test(l.line || '') || DRINK.test(label)) { out.skipped_drinks++; continue }
      if (/^(extra|extras)$/i.test(String(l.line || '').trim())) continue
      const cands = suggestRecipes(label, recipes)
      out.dishes.push({ id: uid(slug('m-' + (l.line || label))), manual: true, label, from: l.line, why: p.why || null,
        recs: cands.map(r => r.title), recids: cands.map(r => r.id),
        hint: cands.length ? `Nessuna regola catering per «${label}»${p.why ? ' (' + p.why + ')' : ''}. Ricetta Brigade più vicina (da confermare): ${cands.map(r => r.title).join(' · ')}. Inserisci le porzioni.`
          : `Nessuna regola catering e nessuna ricetta collegata per «${label}»${p.why ? ' (' + p.why + ')' : ''}: aggiungi gli ingredienti o una ricetta con «Aggiungi».` })
    }
  }
  return out
}

/** latest documents of an event: { docs:[latest version per document], sels, hash, version, received_at } from event_document_versions rows */
export function latestMenu(versions) {
  const last = {}
  for (const v of versions) if (!last[v.ts_document_id] || v.version_no > last[v.ts_document_id].version_no) last[v.ts_document_id] = v
  const docs = Object.values(last)
  const sels = docs.flatMap(d => (Array.isArray(d.lines) ? d.lines : []).filter(l => l.kitchen !== false).sort((a, b) => (Number(a.position) || 0) - (Number(b.position) || 0))
    .map(l => ({ name: l.name || '', qty: l.quantity, price: l.price })))
  return { docs, sels, hash: docs.map(d => `${d.ts_document_id}v${d.version_no}`).sort().join(','), version: docs.length ? Math.max(...docs.map(d => d.version_no)) : null,
    received_at: docs.map(d => d.received_at).sort().pop() || null }
}
const dmy = iso => iso ? `${String(iso).slice(5, 7)}/${String(iso).slice(8, 10)}` : ''   // date americane: mese/giorno (Max 09/11)
/** L'evento come lo legge la pagina. e = riga events; menu = latestMenu(...) (o null); curated = piano curato a mano (opzionale). */
export function buildEvent(e, menu, recipes, curated = null) {
  const plan = menu && menu.docs.length ? planFromMenu(menu.sels, e.guest_count, recipes) : { guests: e.guest_count || 0, billed: null, template: false, dishes: [] }
  const fonti = [[`Brigade: campo ospiti${e.updated_at ? ' (evento aggiornato il ' + dmy(String(e.updated_at).slice(0, 10)) + ')' : ''}`, e.guest_count || 0]]
  if (plan.billed && plan.billed !== e.guest_count) fonti.push([`Menu fatturato nel documento Tripleseat${menu ? ' (v' + menu.version + ', ' + dmy(String(menu.received_at).slice(0, 10)) + ')' : ''}`, plan.billed])
  const guests = plan.guests || e.guest_count || 0
  const notes = []
  if (!e.tripleseat_id) notes.push('Evento senza collegamento Tripleseat: nessun menu da leggere.')
  else if (!menu || !menu.docs.length) notes.push('Brigade non ha nessun documento/menu di Tripleseat per questo evento.')
  if (plan.template) notes.push('Il menu non è ancora scelto dal cliente («pick…», «to be chosen»): non invento i piatti.')
  if (plan.skipped_drinks) notes.push(`${plan.skipped_drinks} righe di bevande/bar non contate (non sono food cost).`)
  const sync = e.last_synced_at || e.updated_at
  if (sync && Date.now() - Date.parse(sync) > 21 * 86400000 && e.event_date >= new Date().toISOString().slice(0, 10)) notes.push(`Evento fermo in Brigade dal ${dmy(String(sync).slice(0, 10))}: ospiti e menu potrebbero essere vecchi.`)
  const out = { id: e.id, name: e.name, date: e.event_date, time: e.event_time || '—', room: e.room_name || '—', status: e.status, guests, fonti,
    menu_price: 0, menu_qty: plan.billed || guests, revenue: 0, template: plan.template, menu_hash: menu ? menu.hash : null, menu_version: menu ? menu.version : null, menu_at: menu ? menu.received_at : null,
    brigade: [`Evento in Brigade (Tripleseat ${e.tripleseat_id || '—'}, stato ${e.status}).`, ...notes].join(' '), source: 'brigade', dishes: plan.dishes }
  if (curated) { out.curated = true; out.dishes = curated.dishes; out.fonti = [...curated.fonti, ...out.fonti.filter(x => !curated.fonti.some(y => y[1] === x[1] && y[0] === x[0]))]
    out.menu_price = curated.menu_price; out.menu_qty = curated.menu_qty; out.guests = curated.guests; out.revenue = curated.menu_price * curated.menu_qty; out.brigade = curated.brigade + ' ' + notes.join(' ')
    out.curated_hash = curated.menu_hash || null }
  return out
}

/* ---- cataloghi Brigade per «Aggiungi»: ingredienti e ricette con i costi di OGGI ---- */
/** riga di ingredients ⨝ food_cost.v_ingredient_price → voce della pagina (null se non attivo) */
export function ingredientEntry(x) {
  if (!x.active) return null
  const f = v => (v == null || v === '' || Number(v) === 0 ? null : Number(v))
  return { id: x.id, n: x.name, c: x.category, bu: x.base_unit, pg: f(x.cost_per_base), pe: f(x.cost_per_each), pm: f(x.cost_per_ml), v: (x.vendor || '').slice(0, 40), d: x.last_invoice_date || null,
    stima: !!(x.vendor && String(x.vendor).startsWith('STIMA')), pack: (x.pack_description || '').slice(0, 80), w: x.avg_unit_weight_g ?? null }
}
// Decisioni di Max 05/11: ingredienti di poco valore (sali, spezie) non contano, c'è il buffer 10%
export const LOW = new Set(['Poultry Salt', 'Ribeye Salt', 'Cloves', 'Juniper Seeds'])
/** costo di una ricetta come lo legge la pagina. r = riga recipes (id,title,menu_group,category,base_servings), j = food_cost.recipe_breakdown(id). */
export function recipeEntry(r, j) {
  // «distinta vuota» (un componente senza nessuna riga in Brigade, es. Brisket) non ha un nome ingrediente: lo si nomina dal percorso, così non passa per costo zero senza avviso
  const issues = (j.issues || []).map(i => [i.component || (i.code === 'distinta_vuota' && i.path ? String(i.path).split(' > ').pop() + ' (distinta vuota)' : null), i.code]).filter(i => !LOW.has(i[0]))
  let known = j.totals && j.totals.known != null ? Number(j.totals.known) : null, cpp = j.cost_per_portion != null ? Number(j.cost_per_portion) : null
  let ins = issues
  // «Mushrooms» = Shitake (Chef's Warehouse, in Brigade sotto Hardie's): 5 lb = 1 cassa 5#, fattura 28/09 $62,50 — solo finché Brigade ha ancora il segnaposto
  if (r.title === 'SLICED MUSHROOM' && ins.some(i => i[0] === 'Mushrooms')) { ins = ins.filter(i => i[0] !== 'Mushrooms'); known = (known || 0) + 62.5 }
  const port = j.portions && j.portions.n != null ? Number(j.portions.n) : null   // porzioni che il motore dei costi attribuisce alla ricetta (portions.n)
  if (!ins.length && cpp == null && known && port) cpp = known / port
  let part = false
  if (cpp == null && known && port > 0) { cpp = known / port; part = true }
  const y = j.yield || {}
  const cu = j.cost_per_yield_unit != null && (y.dim === 'mass' || y.dim === 'volume') ? (y.dim === 'mass' ? 'g' : 'ml') : null
  return { id: r.id, t: r.title, g: r.menu_group || r.category || '', cpp, part, col: j.semaforo || null, port, cu, cpu: cu ? Number(j.cost_per_yield_unit) : null, miss: [...new Set(ins.map(i => i[0]).filter(Boolean))].sort().slice(0, 8) }
}

/* ---- tutti i dati della pagina ---- */
const SINCE = '2026-09-01'
/** inputs: { events (righe events), versions (event_document_versions), recipes (id,title,category,menu_group,pos_name,base_servings),
 *            curated (righe catering_cost_events), invoiceLines [{name, invoice_date, vendor, pack_description, invoice_number, unit_price, cost_per_100g, price_anomaly}],
 *            ingredientRows (cp_ingredient_costs), recipeRows (cp_recipe_costs per le ricette che servono) } → D */
export function assembleData({ events, versions, recipes, curated = [], invoiceLines = [], ingredientRows = [], recipeRows = [], today = new Date().toISOString().slice(0, 10) }) {
  const byTs = {}; for (const v of versions) (byTs[v.ts_event_id] = byTs[v.ts_event_id] || []).push(v)
  const curBy = new Map(curated.filter(c => c.brigade_event_id).map(c => [c.brigade_event_id, c]))
  const out = []
  for (const e of events) {
    if (e.event_date < SINCE) continue
    const menu = e.tripleseat_id && byTs[e.tripleseat_id] ? latestMenu(byTs[e.tripleseat_id]) : null
    const c = curBy.get(e.id)
    const ev = buildEvent(e, menu, recipes, c ? c.curated : null)
    if (c) { ev.id = c.key; ev.brigade_id = e.id; ev.name = c.name }   // il nome curato da Max è più ricco di quello di Tripleseat
    out.push(ev)
  }
  for (const c of curated) if (!c.brigade_event_id) {      // eventi che Brigade non ha (Janay, Freedom…): restano come li ha curati Max
    const k = c.curated
    out.push({ id: c.key, name: c.name, date: c.event_date, time: k.time || '—', room: k.room || '—', status: 'archivio', guests: k.guests, fonti: k.fonti, menu_price: k.menu_price, menu_qty: k.menu_qty,
      revenue: k.menu_price * k.menu_qty, brigade: k.brigade, source: 'archivio', curated: true, dishes: k.dishes, menu_hash: null })
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.name < b.name ? -1 : 1))
  const book = priceBook(), tables = {}
  for (const e of out) for (const d of e.dishes) if (d.rule) { const k = d.rkey || rkeyOf(d.rule, d.opts); d.rkey = k
    if (!tables[k]) { const i = k.indexOf('|'); tables[k] = ruleTable(k.slice(0, i), k.slice(i + 1) ? JSON.parse(k.slice(i + 1)) : {}) } }
  const check = {}
  for (const e of out) { const keys = [...new Set(e.dishes.filter(d => d.rule).map(d => d.rkey))]; check[e.id] = buildCheck(e.date, usedPids(tables, keys), invoiceLines, book) }
  const ing = ingredientRows.map(ingredientEntry).filter(Boolean)
  const costed = new Map(recipeRows.map(r => [r.id, recipeEntry({ id: r.id, title: r.title, menu_group: r.menu_group, category: r.category, base_servings: r.base_servings }, r.j)]))
  const rec = recipes.map(r => costed.get(r.id) || { id: r.id, t: r.title, g: r.menu_group || r.category || '', lazy: true })
  return { events: out, rules: tables, prices: book, check, ing, rec, built: today }
}
/** ids di ricette che la pagina deve conoscere subito: quelle dei piatti «senza regola» + quelle già aggiunte nelle modifiche salvate */
export function neededRecipeIds(events, states) {
  const s = new Set()
  for (const e of events) for (const d of e.dishes) if (d.manual) for (const id of d.recids || []) s.add(id)
  for (const st of Object.values(states || {})) for (const x of (st && st.extras) || []) if (x.type === 'rec' && x.refId) s.add(x.refId)
  return [...s]
}
