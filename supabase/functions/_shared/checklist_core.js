// Smart Station Checklists (B-51). R1.11 Progressive Trust, Chef Max GO 16/10/2026 — SIMULATION, read only.
// Pilot: Pasta Station. POS-first: real sales (menu items + add-on modifiers) × recipes, through sub-recipes, with the
// SAME walk the Knowledge Engine uses (knowledge_core.dishesUsing). Nothing here writes; a ticked task is not a sale and
// never moves stock. Theoretical stock is never used as a count, leftovers are never assumed.
// Pure functions: the server runs them on live data, the tests on read-only dumps.
//
// Progressive Trust — ONE system, three levels on the same cards (My Shift, stations, existing users):
//   Step 1  Checklist            one question, one tick ("Do we have 18 lobsters ready for today?")      ACTIVE (simulation)
//   Step 2  Confirm quantities   "How many lobsters are ready?" → enough / N more                          BUILT, switched off
//   Step 3  Stock & production   real counts, productions, yields/lots, stock moves                         DESIGN ONLY, no writes
import { dishesUsing, posNames } from './knowledge_core.js'

const num = x => { const n = Number(x); return x == null || x === '' || !isFinite(n) ? null : n }
const r1 = x => Math.round(x * 10) / 10
export const SAMPLES = 4            // last 4 same weekdays

/* Switches. They live in the code on purpose: turning one on is a new release (tag + rollback), never a tap or a setting
   a cook can reach. staffVisible: cooks see the checklist · step2: confirm quantities exists for cooks the Chef enabled ·
   step3: stock & production writes (not implemented: stays false until the Chef approves it, with permissions and
   deduction tests). */
export const GATES = Object.freeze({ staffVisible: false, step2: false, step3: false, reassign: false })   // reassign: design only (docs/PROGRESSIVE_TRUST.md)
export const STEPS = Object.freeze({
  1: { name: 'Checklist', active: true },
  2: { name: 'Confirm quantities', active: false, built: true },
  3: { name: 'Stock & production', active: false, built: false, records: ['ready_count', 'production', 'yield_lot', 'stock_move'] },
})

/* Margins per item and weekday (R1.11 study on POS 9/6 → 15/10/2026, 13–15 samples per weekday; ~/brigade-audit-work/b51/r111).
   lobster: thawed the same morning in ~15 min, more can be thawed during service → prudent. Friday a bit more: the
   leftovers can serve Saturday. Saturday prudent (+5%). shrimp: for today (Chef 16/10, fish prepared in the morning).
   arrabbiata: cannot be made in the middle of service → more cover. gnocco: the 2 kg batch decides, the margin barely matters.
   calamari / salmon / branzino whole: R1.11b study (~/brigade-audit-work/b51/r111/fish_eval.mjs). */
export const MARGINS = Object.freeze({
  lobster:    { weekday: 0.10, 5: 0.25, 6: 0.05 },
  shrimp:     { weekday: 0.15, 5: 0.25, 6: 0.15 },
  gnocco:     { weekday: 0.25, 5: 0.25, 6: 0.25 },
  arrabbiata: { weekday: 0.25, 5: 0.30, 6: 0.20 },
  calamari:   { weekday: 0.15, 5: 0.15, 6: 0.10 },
  salmon:     { weekday: 0, 5: 0.25, 6: 0 },               // small numbers (2–4 a day): rounding up to whole filets already covers
  branzino_filet: { weekday: 0.25, 5: 0.30, 6: 0.30 },     // R1.11.3: Siciliana × 1 filet (Chef). Backtest 9/6→15/10 (~/brigade-audit-work/b51/r112/filet_margin.mjs):
                                                            // short Mon–Thu 10/58, Fri 3/14, Sat 1/13; a filet thaws in ~10 min, so a short day is fixed in service
  branzino_whole: { weekday: 0, 5: 0, 6: 0 },              // 0–3 a day: rounding up to a whole fish already covers
})
export const DEFAULT_MARGIN = 0.15
export function marginFor(key, iso) { const m = MARGINS[key]; if (!m) return DEFAULT_MARGIN; const w = dow(iso); return m[w] != null ? m[w] : m.weekday }

/* Checklist items per station. Station = where the prep is used for TODAY's service (Chef 16/10, R1.11.2):
   Thaw Lobster #296 + Shrimp #470 → Pasta · Calamari #266 + Thaw Salmon #413 + branzino filets for the Siciliana → Oven ·
   whole branzino, gutted and cleaned for Branzino Chef Style → Table Side. Each need lives in ONE station only.
   Branzino arrives whole; Table Side processes it: part gutted and left whole (Table Side card), part filleted, wrapped and
   frozen (that stock is not a daily need: no card until Step 3 counts it and the Chef gives the filets per fish).
   Salmon arrives as large whole filets, portioned to 200 g: one Amalfi Salmon = one filet; Salmon Pistachio is off the menu.
   thaw_min: the Chef's current practice (lobster ~15, branzino filet ~10, salmon ~20) — shown as said, it is NOT an HACCP
   validation of the method. No time where the Chef gave none.
   ref: the Chef's operational reference, shown as "about N" when POS + recipes cannot give a reliable number; never a fixed
   amount, never multiplied into a forecast. ask: 'ready'. target: ingredient (item) or sub-recipe (recipe). as_modifier:
   recipes sold as POS modifiers although their recipe is not in the Add-ons group (Salmon Whole = "Add salmon whole").
   step: rounding of the question amount. */
export const PASTA = [
  { key: 'lobster', station: 'pasta', ask: 'ready', what: 'lobsters', unit: 'pz', target: { item: '2e9405f8-7ff2-4bf2-a572-5b343c52c9d0' }, name: 'Lobster Tail', step: 1, lead: 0, lead_ok: true,
    how: 'thaw_morning', thaw_min: 15, leftovers: true, review: /lobster/i },      // Chef 16/10: thawed the same morning, about 15 minutes
  { key: 'shrimp', station: 'pasta', ask: 'ready', what: 'shrimp', unit: 'g', target: { item: '4edc611c-e281-4c6a-85e9-f57fb27d1b61' }, name: 'Shrimp', step: 50, step_label: 'whole shrimp (50 g each)', lead: 0, lead_ok: true, review: /shrimp|prawn/i,
    notes: ['1 shrimp = 50 g (weighed by the Chef 15/10): Add shrimp = 5 shrimp = 250 g; Fettuccine Allo Scoglio = 2 shrimp = 100 g'],
    // Chef 16/10. The forecast reads the OFFICIAL recipes; until they say the same, the Chef sees it as pending (never patched here)
    expect: [{ dish: 'ADD SHRIMP', per_portion: 250, label: 'Add shrimp = 5 shrimp = 250 g' }, { dish: 'Fettuccine Allo Scoglio', per_portion: 100, label: 'Fettuccine Allo Scoglio = 2 shrimp = 100 g' }] },
  { key: 'gnocco', station: 'pasta', ask: 'ready', what: 'Gnocco dough', unit: 'g', target: { recipe: 'e4804f67-5220-4bc8-abd0-aa925ecfa06f' }, name: 'GNOCCO FRITTO DOUGH', step: 100, lead: 0, lead_ok: true, batch: true },
  { key: 'arrabbiata', station: 'pasta', ask: 'ready', what: 'Arrabbiata', unit: 'g', target: { recipe: '3252e642-e3c5-4c9b-9bba-9603cc086f92' }, name: 'ARRABBIATA', step: 500, lead: 0, lead_ok: true, batch: true },
]
export const OVEN = [
  { key: 'calamari', station: 'oven', ask: 'ready', what: 'calamari', unit: 'g', target: { item: 'f1224e5b-8bc4-43c2-9d32-02a851a8e363' }, name: 'Calamari', step: 500, lead: 0, lead_ok: true, review: /calamar|squid/i },
  { key: 'salmon', station: 'oven', ask: 'ready', what: 'salmon filets (190 g)', unit: 'pz', target: { recipe: 'c2fe373a-e589-4208-82ff-8277578e7343' }, name: 'Thaw Salmon', step: 1, lead: 0, lead_ok: true,
    thaw_min: 20, as_modifier: ['78d90bc9-574f-4dd7-9493-2b56b9682336'], review: /salmon/i, review_skip: /salmon cake|salmon sauce|salmon aioli/i,
    not_counted: ['Salmon Pistachio: off the menu (last POS sale 26/06/2026)'],
    notes: ['1 Amalfi Salmon = 1 filet of 190 g (Chef 16/10, as the official "Salmon Filets" recipe)'] },
  { key: 'branzino_filet', station: 'oven', ask: 'ready', what: 'branzino filets for the Siciliana', unit: 'pz', target: { recipe: 'f7f46c56-a865-4ea3-9514-869e7a3a1226' }, name: 'Filet Branzino (frozen)', step: 1, lead: 0, lead_ok: true,
    thaw_min: 10, ref: { weekday: [5, 7], 5: [10, 10], 6: [10, 10] },   // Chef 16/10: about 5–7 on quiet days, about 10 at the weekend (comparison only now)
    // Chef 16/10: ONE filet per Siciliana. Brigade's "Siciliana cartoccio" has 1 filet but no yield, so the walk gives no amount;
    // this fills that one gap for the forecast only (the official recipe is not changed).
    chef_per_portion: { '445b2309-6da9-4b77-8163-d1c875ec53f0': { qty: 1, why: 'Chef 16/10: 1 filet per Siciliana' } },
    fillet: { per_fish: 2 },                                              // Chef 16/10: one whole fish gives TWO filets
    notes: ['Filets come from Table Side already cleaned, wrapped and frozen', 'Purchase weight per filet: 1.1 lb in theory (a 2.2 lb fish gives 2 filets) — never used as a filet weight'] },
]
export const TABLESIDE = [
  { key: 'branzino_whole', station: 'tableside', ask: 'ready', what: 'whole branzino (gutted and cleaned)', unit: 'pz', target: { recipe: '5b06254f-7679-4686-96fc-9fe993c923d2' }, name: 'Branzino Tableside', step: 1, lead: 0, lead_ok: true, review: /branzino|sea ?bass/i,
    notes: ['Purchased whole by weight, about 2.2 lb per fish on average (Chef 16/10): a purchasing figure, not a filet weight. One Branzino Chef Style = one whole fish'] },
]
export const STATIONS = Object.freeze({
  pasta: { name: 'Pasta Station', items: PASTA },
  oven: { name: 'Oven Station', items: OVEN },
  tableside: { name: 'Table Side', items: TABLESIDE, note: 'Table Side processes the whole branzino. Filleting and freezing for the Siciliana is not a daily card: the filets are asked once, in Oven.' },
})
export function refFor(it, iso) { const r = it.ref; if (!r) return null; const w = dow(iso), x = r[w] || r.weekday; return x ? { lo: x[0], hi: x[1], weekend: w === 5 || w === 6 } : null }

/* Sold POS names the forecast does NOT count, for the Chef: nothing sold is dropped silently.
   kind: adds (adds the product, no quantity mapped yet) · sub (substitution) · removal · note (instruction / allergy, no product). */
export function modKind(name) {
  const n = String(name || '').toLowerCase()
  if (/allerg/.test(n)) return 'note'
  if (/instead of|^sub (?!no )|\bswitch\b/.test(n)) return 'sub'
  if (/^(no |sub no )|\bno (shrimp|lobster|salmon|calamari|branzino|mussel|clams)|do not make|^86 /.test(n)) return 'removal'
  if (/on (the )?side|\bots\b|rare|medium|well done|well\b|firm|de-? ?shell|remove .*shell|tail cut|sauce|crispy|chopped|cooked|sliced|parchment|meant to ring|wouldn|for mike|already in/.test(n)) return 'note'
  return 'adds'
}
export function reviewFor(it, sales, recipes, countedNames) {
  if (!it.review) return null
  const owned = new Set(); for (const r of recipes || []) posNames(r).forEach(n => owned.add(n.toLowerCase()))
  const g = {}
  for (const s of sales || []) {
    const n = String(s.name || '').trim(), k = n.toLowerCase()
    if (!it.review.test(n) || (it.review_skip && it.review_skip.test(n))) continue
    if (s.kind === 'modifier' ? countedNames.modifier.has(k) : (countedNames.item.has(k) || owned.has(k))) continue
    const key = s.kind + '|' + k, o = g[key] || (g[key] = { spell: new Set(), source: s.kind === 'modifier' ? 'POS modifier' : 'POS menu item', kind: s.kind === 'modifier' ? modKind(n) : 'no_recipe', qty: 0, days: new Set(), last: '' })
    o.spell.add(n); o.qty += num(s.qty) || 0; o.days.add(s.date); if (s.date > o.last) o.last = s.date
  }
  const rank = { no_recipe: 0, adds: 1, sub: 2, removal: 3, note: 4 }
  return Object.values(g).map(o => ({ name: [...o.spell].sort().join(' / '), source: o.source, kind: o.kind, qty: o.qty, days: o.days.size, last: o.last }))
    .sort((a, b) => rank[a.kind] - rank[b.kind] || b.qty - a.qty || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))   // fixed order, whatever the row order
}

/** Amount per portion of each dish that uses a target (ingredient or sub-recipe), via the Knowledge walk. */
export function dishesFor(target, bom, recipes, yields) {
  if (target.item) return dishesUsing(target.item, bom, recipes, yields)
  // a sub-recipe: treat its parent lines as if they used a pseudo-ingredient, then walk up the same way
  const PSEUDO = '__target__'
  const b2 = bom.map(b => b.component_type === 'RECIPE' && b.sub_recipe_id === target.recipe ? Object.assign({}, b, { component_type: 'ITEM', item_id: PSEUDO, sub_recipe_id: null }) : b)
  return dishesUsing(PSEUDO, b2, recipes, yields)
}

/** Sales per day per dish name. sales: [{ date, kind:'item'|'modifier', name, qty }] */
function dailyByDish(dishes, sales) {
  const idx = { item: {}, modifier: {} }
  for (const s of sales) { const m = idx[s.kind === 'modifier' ? 'modifier' : 'item'], k = String(s.name || '').trim().toLowerCase(); (m[k] = m[k] || {})[s.date] = (m[k][s.date] || 0) + (num(s.qty) || 0) }
  return dishes.map(d => { const src = d.addon ? idx.modifier : idx.item, per = {}
    // one POS name counted once: recipes list the same name in several spellings ("Add salmon whole|add salmon whole")
    ;[...new Set(d.pos_names.map(n => n.trim().toLowerCase()))].forEach(n => { const m = src[n] || {}; Object.entries(m).forEach(([dt, q]) => { per[dt] = (per[dt] || 0) + q }) })
    return { d, per } })
}
function dow(iso) { return new Date(iso + 'T12:00:00Z').getUTCDay() }
const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const addDays = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10)

/** Service days: a weekday counts as open only if the POS has sales on that weekday in the history (Sundays have none). */
export function serviceDays(from, count, openDates) {
  const openDow = new Set([...openDates].map(dow)), out = []
  for (let i = 0, d = from; out.length < count && i < 14; i++, d = addDays(d, 1)) if (openDow.has(dow(d))) out.push(d)
  return out
}

/** The previous service day by the weekly pattern (the POS import lags a day, so its last date is not used). */
export function prevServiceDay(day, openDates) {
  const openDow = new Set([...openDates].map(dow))
  for (let i = 1, d = addDays(day, -1); i <= 7; i++, d = addDays(d, -1)) if (openDow.has(dow(d))) return d
  return null
}

/** Forecast of the amount of a target needed on one day: mean of the last SAMPLES same weekdays with POS data, + margin. */
export function forecastDay(rows, day, openDates, margin = DEFAULT_MARGIN) {
  const dates = [...openDates].filter(x => x < day && dow(x) === dow(day)).sort().slice(-SAMPLES)
  const per = dates.map(dt => ({ date: dt, amount: rows.reduce((a, r) => a + (r.d.per_portion != null ? (r.per[dt] || 0) * r.d.per_portion : 0), 0), portions: rows.reduce((a, r) => a + (r.per[dt] || 0), 0) }))
  const mean = per.length ? per.reduce((a, x) => a + x.amount, 0) / per.length : null
  const recent = per.slice(-2), recentMean = recent.length ? recent.reduce((a, x) => a + x.amount, 0) / recent.length : null
  return { day, weekday: DOW[dow(day)], samples: per, mean, margin, forecast: mean == null ? null : mean * (1 + margin), trend: mean && recentMean != null ? recentMean / mean - 1 : null }
}

/**
 * Build the station checklist (Chef view: with Why?). forCook() strips it to what a cook needs.
 * data: { today (ISO, America/Chicago), bom, recipes, yields, sales [{date,kind,name,qty}], openDates (dates with POS sales),
 *         events [{name, date, guests, status, menu_linked}], items (PASTA), salesAll (past-day simulation) }
 */
export function stationPriorities(data) {
  const items = data.items || (STATIONS[data.station || 'pasta'] || STATIONS.pasta).items, open = new Set(data.openDates || [])
  const days = serviceDays(data.today, 2, open)
  const Y = {}; (data.yields || []).forEach(y => { Y[y.id] = y })
  const out = []
  for (const it of items) {
    const dishes = dishesFor(it.target, data.bom || [], data.recipes || [], data.yields || [])
      .map(d => (it.as_modifier || []).includes(d.recipe_id) ? Object.assign({}, d, { addon: true }) : d)
      .map(d => { const c = (it.chef_per_portion || {})[d.recipe_id]; return c && d.per_portion == null ? Object.assign({}, d, { per_portion: c.qty, chef: c.why }) : d })
    const rows = dailyByDish(dishes, data.sales || [])
    const rowsAll = data.salesAll ? dailyByDish(dishes, data.salesAll) : null   // past-day simulation: what was really sold, to compare
    const missing = dishes.filter(d => d.per_portion == null)
    const counted = rows.filter(r => r.d.per_portion != null && Object.keys(r.per).length)
    const day = days[it.lead || 0]
    const f = day ? forecastDay(rows, day, open, marginFor(it.key, day)) : null
    // never a number when a dish that SELLS has no reliable amount per portion: it would be too low (Chef 16/10: don't invent)
    const soldMissing = rows.filter(r => r.d.per_portion == null && Object.keys(r.per).length)
    const need = f && f.forecast != null && !soldMissing.length ? f.forecast : null
    const qty = need == null ? null : need > 0 ? Math.max(it.step, Math.ceil(need / it.step) * it.step) : 0
    const card = { key: it.key, ask: it.ask, what: it.what, unit: it.unit, how: it.how || null, thaw_min: it.thaw_min || null,
      ref: need == null && day ? refFor(it, day) : null,
      for_day: day ? { day, weekday: DOW[dow(day)], today: day === data.today } : null, need: need == null ? null : r1(need), qty,
      status: need == null ? 'missing' : missing.length ? 'partial' : 'estimated', level: 1,
      // Step 2 (built, switched off): the question it would ask instead of the tick
      confirm: { question: 'how_many_ready', unit: it.unit === 'pz' ? 'pz' : 'kg' },
      why: { method: `mean of the last ${SAMPLES} same weekdays (POS) × recipe amount per portion, + ${Math.round((f ? f.margin : DEFAULT_MARGIN) * 100)}% margin (${f ? f.weekday : '—'})`,
        margin: f ? Math.round(f.margin * 100) : null,
        day: f ? { day: f.day, weekday: f.weekday, mean: f.mean == null ? null : r1(f.mean), forecast: f.forecast == null ? null : r1(f.forecast), trend: f.trend == null ? null : Math.round(f.trend * 100), samples: f.samples.map(s => ({ date: s.date, amount: r1(s.amount), portions: s.portions })) } : null,
        dishes: counted.map(r => ({ title: r.d.title, per_portion: r1(r.d.per_portion), unit: r.d.unit, path: r.d.paths[0], source: (r.d.addon ? 'POS modifiers' : 'POS menu items') + (r.d.chef ? ' · ' + r.d.chef : '') })),
        chef_ref: day && it.ref ? refFor(it, day) : null,
        not_counted: missing.map(d => `${d.title}: ${d.why[0] || 'amount per portion missing'}`).concat(it.not_counted || []),
        notes: (it.notes || []).concat(it.thaw_min ? [`thaw ~${it.thaw_min} min: the Chef's current practice, not an HACCP validation of the method`] : []),
        round: it.step > 1 ? `rounded up to ${it.step_label || (it.unit === 'g' ? it.step + ' g' : it.step)}` : null,
        lead_note: it.lead_ok === false ? `timing to confirm by the Chef: shown as ${it.lead === 1 ? 'one day ahead' : it.lead ? it.lead + ' days ahead' : 'the same day'}` : null } }
    if (it.fillet && qty != null) card.why.notes.unshift(`${qty} filets = ${Math.ceil(qty / it.fillet.per_fish)} whole fish if filleted today (${it.fillet.per_fish} filets per fish, Chef). Frozen filets already in stock are not counted.`)
    const cn = { item: new Set(), modifier: new Set() }; dishes.forEach(d => d.pos_names.forEach(n => cn[d.addon ? 'modifier' : 'item'].add(n.trim().toLowerCase())))
    card.why.review = reviewFor(it, data.sales, data.recipes, cn)
    for (const e of it.expect || []) { const d = dishes.find(x => x.title === e.dish)
      if (!d || d.per_portion == null || Math.abs(d.per_portion - e.per_portion) > 0.01) card.why.notes.push(`Pending in the official recipe: ${e.label} (Brigade says ${d && d.per_portion != null ? r1(d.per_portion) + ' ' + d.unit : 'nothing'}) — the forecast uses the official recipe`) }
    if (it.batch) {
      const y = Y[it.target.recipe], g = y && y.yield_dim === 'mass' ? num(y.yield_qty) : null
      card.why.batch = g ? `recipe yield (${it.name}): ${g} g per batch` : 'batch size missing in the recipe yield'
    }
    // leftovers are never assumed: after a closed day (Monday after Saturday) the cook may use them only if checked
    if (it.leftovers && day && day === data.today) { const prev = prevServiceDay(day, open)
      if (prev && prev !== addDays(day, -1)) card.leftovers_from = { day: prev, weekday: DOW[dow(prev)] } }
    if (rowsAll && day) card.actual = r1(rowsAll.reduce((a, r) => a + (r.d.per_portion != null ? (r.per[day] || 0) * r.d.per_portion : 0), 0))
    out.push(card)
  }
  // events: they add demand only when the menu, quantities and recipe links are verified (catering module 5). Today: none are.
  const evs = (data.events || []).filter(e => days.includes(e.date) && e.status !== 'cancelled' && e.status !== 'prospect')
  const st = STATIONS[data.station || 'pasta'] || STATIONS.pasta
  return { station: st.name, station_key: data.station || 'pasta', station_note: st.note || null, stations: Object.entries(STATIONS).map(([k, v]) => ({ key: k, name: v.name })), today: data.today, service_days: days.map(d => ({ day: d, weekday: DOW[dow(d)] })), closed_today: !days.includes(data.today),
    samples: SAMPLES, level: 1, items: out,
    events: evs.map(e => ({ name: e.name, date: e.date, guests: e.guests ?? null, included: !!e.menu_linked, why: e.menu_linked ? null : 'not included: menu, quantities and recipe links are not verified yet' })) }
}

/** What a cook sees: the question and the tick. No Why?, no margins, no events, no technical fields. */
export function forCook(res, level = 1) {
  return { station: res.station, station_key: res.station_key, today: res.today, service_days: res.service_days, closed_today: res.closed_today, level,
    items: res.items.map(c => ({ key: c.key, ask: c.ask, what: c.what, unit: c.unit, how: c.how, thaw_min: c.thaw_min, ref: c.ref, for_day: c.for_day, qty: c.qty, leftovers_from: c.leftovers_from || null, level,
      ...(level >= 2 ? { confirm: c.confirm } : {}) })) }
}

/**
 * Level of one cook. Always 1 unless BOTH the release switch is on AND the Chef enabled that cook (grant not revoked).
 * Step 3 is never returned: it is not implemented. grants: [{ user_id, step, granted_by_role, revoked_at }]
 */
export function levelFor(user, grants = [], gates = GATES) {
  if (!user) return 1
  if (!gates.step2) return 1
  const g = (grants || []).find(x => x && x.user_id === user.id && x.step === 2 && x.granted_by_role === 'chef' && !x.revoked_at)
  return g ? 2 : 1
}

/** Step 2 result once the cook has COUNTED what is ready (never a theoretical stock, never a write). */
export function confirmResult(card, readyCounted) {
  const ready = num(readyCounted)
  if (card.qty == null || ready == null || ready < 0) return null
  const short = Math.max(0, card.qty - ready)
  return { ready, short: card.unit === 'pz' ? Math.ceil(short) : r1(short), enough: short <= 0 }
}

/**
 * Progression advice (Step 1 → Step 2), for the Chef only, never automatic.
 * It looks at REGULARITY on the shifts the cook really worked at that station — not calendar days, not the number of ticks.
 * A tick is not proof of accuracy: the advice only says "regular", the Chef decides.
 * shifts:  [{ date, station, worked: true|false, source }]  worked shifts come from a real source (schedule + clock-in);
 *          ticks are never used as proof of presence.
 * answers: [{ date, key }]   assigned: { [date]: number of checks assigned on that shift }
 */
export const PROGRESSION = Object.freeze({ minShifts: 5, windowDays: 14, minAnsweredShare: 0.9 })
export function progressionAdvice({ today, station, shifts = [], answers = [], assigned = {}, level = 1 }, rule = PROGRESSION) {
  if (level >= 2) return { suggest: false, reason: 'already at step 2' }
  const from = addDays(today, -rule.windowDays)
  const worked = shifts.filter(s => s && s.worked === true && s.station === station && s.date >= from && s.date < today && s.source && s.source !== 'ticks')
    .map(s => s.date).filter((d, i, a) => a.indexOf(d) === i).sort()
  if (!worked.length) return { suggest: false, reason: 'no worked shifts on record for this station', shifts: 0 }
  const per = worked.map(d => { const n = assigned[d] || 0, a = new Set(answers.filter(x => x.date === d).map(x => x.key)).size
    return { date: d, assigned: n, answered: n ? Math.min(a, n) : 0, ok: n > 0 && a / n >= rule.minAnsweredShare } })
  // regularity: the last worked shifts in a row must all be complete; a worked shift with missing checks resets the run
  let run = 0; for (let i = per.length - 1; i >= 0 && per[i].ok; i--) run++
  const suggest = run >= rule.minShifts
  return { suggest, shifts: per.length, run, need: rule.minShifts, detail: per,
    reason: suggest ? `${run} worked shifts in a row with the checks answered: regular. The Chef decides; a tick is not a proof of accuracy.`
      : `${run} of ${rule.minShifts} worked shifts in a row with the checks answered` }
}
export { posNames }
