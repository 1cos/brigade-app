// Smart Station Checklists, phase 1 (B-51, Chef Max GO 16/10/2026) — SIMULATION, read only.
// Pilot: Pasta Station. POS-first: real sales (menu items + add-on modifiers) × recipes, through sub-recipes, with the
// SAME walk the Knowledge Engine uses (knowledge_core.dishesUsing). Nothing here writes; a ticked task is not a sale and
// never moves stock. Theoretical stock is never used as a count: only what a cook enters as "ready now" counts.
// Pure functions: the server runs them on live data, the tests on read-only dumps.
import { dishesUsing, posNames } from './knowledge_core.js'

const num = x => { const n = Number(x); return x == null || x === '' || !isFinite(n) ? null : n }
const r1 = x => Math.round(x * 10) / 10
export const MARGIN = 0.15          // safety margin on the forecast (B-51 backtest: +15%)
export const SAMPLES = 4            // last 4 same weekdays

/* Pasta Station pilot. kind: check (A) · smart (B, a quantity, never a deduction) · production (C, real batch).
   target: ingredient (item) or sub-recipe (recipe) — the demand is computed from the dishes that use it.
   lead: days ahead the task serves (1 = for tomorrow). lead_ok false = timing not confirmed by the Chef yet: shown, never hidden. */
export const PASTA = [
  { key: 'lobster', kind: 'smart', verb: 'Thaw', what: 'Lobsters', unit: 'pz', target: { item: '2e9405f8-7ff2-4bf2-a572-5b343c52c9d0' }, name: 'Lobster Tail', round: { step: 1, label: 'tails' }, lead: 1, lead_ok: false, by: '3 PM' },
  { key: 'shrimp', kind: 'smart', verb: 'Pull', what: 'Shrimp', unit: 'g', target: { item: '4edc611c-e281-4c6a-85e9-f57fb27d1b61' }, name: 'Shrimp', round: { step: 150, label: 'portions of 150 g (Pull Shrimp recipe: 1000 g = 6.67 portions)' }, lead: 1, lead_ok: false, by: '3 PM' },
  { key: 'gnocco', kind: 'check', verb: 'Check', what: 'Gnocco dough', unit: 'g', target: { recipe: 'e4804f67-5220-4bc8-abd0-aa925ecfa06f' }, name: 'GNOCCO FRITTO DOUGH', batch: true, days: 2, by: '4 PM' },
  { key: 'arrabbiata', kind: 'production', verb: 'Make', what: 'Arrabbiata', unit: 'g', target: { recipe: '3252e642-e3c5-4c9b-9bba-9603cc086f92' }, name: 'ARRABBIATA', batch: true, days: 2, by: '4 PM' },
]

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
    d.pos_names.forEach(n => { const m = src[n.toLowerCase()] || {}; Object.entries(m).forEach(([dt, q]) => { per[dt] = (per[dt] || 0) + q }) })
    return { d, per } })
}
const dow = iso => new Date(iso + 'T12:00:00Z').getUTCDay()
const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const addDays = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10)

/** Service days: a weekday counts as open only if the POS has sales on that weekday in the history (Sundays have none). */
export function serviceDays(from, count, openDates) {
  const openDow = new Set([...openDates].map(dow)), out = []
  for (let i = 0, d = from; out.length < count && i < 14; i++, d = addDays(d, 1)) if (openDow.has(dow(d))) out.push(d)
  return out
}

/** Forecast of the amount of a target needed on one day: mean of the last SAMPLES same weekdays with POS data, + MARGIN. */
export function forecastDay(rows, day, openDates) {
  const dates = [...openDates].filter(x => x < day && dow(x) === dow(day)).sort().slice(-SAMPLES)
  const per = dates.map(dt => ({ date: dt, amount: rows.reduce((a, r) => a + (r.d.per_portion != null ? (r.per[dt] || 0) * r.d.per_portion : 0), 0), portions: rows.reduce((a, r) => a + (r.per[dt] || 0), 0) }))
  const mean = per.length ? per.reduce((a, x) => a + x.amount, 0) / per.length : null
  const recent = per.slice(-2), recentMean = recent.length ? recent.reduce((a, x) => a + x.amount, 0) / recent.length : null
  return { day, weekday: DOW[dow(day)], samples: per, mean, forecast: mean == null ? null : mean * (1 + MARGIN), trend: mean && recentMean != null ? recentMean / mean - 1 : null }
}

/**
 * Build the station priorities.
 * data: { today (ISO, America/Chicago), bom, recipes, yields, sales [{date,kind,name,qty}], openDates (dates with POS sales),
 *         events [{name, date, guests, status, menu_linked}], items (PASTA) }
 */
export function stationPriorities(data) {
  const items = data.items || PASTA, open = new Set(data.openDates || [])
  const days = serviceDays(data.today, 2, open)
  const Y = {}; (data.yields || []).forEach(y => { Y[y.id] = y })
  const out = []
  for (const it of items) {
    const dishes = dishesFor(it.target, data.bom || [], data.recipes || [], data.yields || [])
    const rows = dailyByDish(dishes, data.sales || [])
    const rowsAll = data.salesAll ? dailyByDish(dishes, data.salesAll) : null   // past-day simulation: what was really sold, to compare
    const missing = dishes.filter(d => d.per_portion == null)
    const counted = rows.filter(r => r.d.per_portion != null && Object.keys(r.per).length)
    const f = days.map(d => forecastDay(rows, d, open))
    const forDays = it.lead ? f.slice(it.lead, it.lead + 1) : f.slice(0, it.days || 1)
    const need = forDays.length && forDays.every(x => x.forecast != null) ? forDays.reduce((a, x) => a + x.forecast, 0) : null
    const card = { key: it.key, kind: it.kind, verb: it.verb, what: it.what, unit: it.unit, by: it.by, lead_ok: it.lead_ok !== false,
      for_days: forDays.map(x => ({ day: x.day, weekday: x.weekday })), need: need == null ? null : r1(need),
      status: need == null ? 'missing' : missing.length ? 'partial' : 'estimated',
      why: { method: `mean of the last ${SAMPLES} same weekdays (POS) × recipe amount per portion, + ${Math.round(MARGIN * 100)}% margin`,
        days: forDays.map(x => ({ day: x.day, weekday: x.weekday, mean: x.mean == null ? null : r1(x.mean), forecast: x.forecast == null ? null : r1(x.forecast), trend: x.trend == null ? null : Math.round(x.trend * 100), samples: x.samples.map(s => ({ date: s.date, amount: r1(s.amount), portions: s.portions })) })),
        dishes: counted.map(r => ({ title: r.d.title, per_portion: r1(r.d.per_portion), unit: r.d.unit, path: r.d.paths[0], source: r.d.addon ? 'POS modifiers' : 'POS menu items' })),
        not_counted: missing.map(d => `${d.title}: ${d.why[0] || 'amount per portion missing'}`) } }
    if (it.round && need != null) { const n = Math.ceil(need / it.round.step) * it.round.step; card.qty = n; card.round = `rounded up to whole ${it.round.label}` }
    if (it.batch) {
      const y = Y[it.target.recipe], g = y && y.yield_dim === 'mass' ? num(y.yield_qty) : null
      card.batch_g = g; card.batch_src = g ? `recipe yield (${it.name}): ${g} g per batch` : null
      if (g == null) { card.status = 'missing'; card.why.not_counted.push('batch size missing in the recipe yield') }
      else if (need != null) card.batches_if_none_ready = Math.ceil(need / g)
    }
    if (rowsAll) card.actual = forDays.map(x => ({ day: x.day, amount: r1(rowsAll.reduce((a, r) => a + (r.d.per_portion != null ? (r.per[x.day] || 0) * r.d.per_portion : 0), 0)) }))
    if (it.lead && f[0] && f[0].forecast != null) card.tonight = { day: f[0].day, weekday: f[0].weekday, need: r1(f[0].forecast), qty: it.round ? Math.ceil(f[0].forecast / it.round.step) * it.round.step : null }   // should already be ready: check it
    if (!it.lead_ok) card.lead_note = `timing to confirm by the Chef: shown as ${it.lead === 1 ? 'one day ahead' : it.lead + ' days ahead'}`
    out.push(card)
  }
  // events: they add demand only when the menu, quantities and recipe links are verified (catering module 5). Today: none are.
  const evs = (data.events || []).filter(e => days.includes(e.date) && e.status !== 'cancelled' && e.status !== 'prospect')
  return { station: 'Pasta Station', today: data.today, service_days: days.map(d => ({ day: d, weekday: DOW[dow(d)] })), closed_today: !days.includes(data.today),
    margin: MARGIN, samples: SAMPLES, items: out,
    events: evs.map(e => ({ name: e.name, date: e.date, guests: e.guests ?? null, included: !!e.menu_linked, why: e.menu_linked ? null : 'not included: menu, quantities and recipe links are not verified yet' })) }
}

/** What to make once the cook has COUNTED what is ready (never a theoretical stock). */
export function toMake(card, readyCounted) {
  const ready = num(readyCounted)
  if (card.need == null || ready == null || !card.batch_g) return null
  const short = Math.max(0, card.need - ready)
  return { ready, short: r1(short), batches: short > 0 ? Math.ceil(short / card.batch_g) : 0 }
}
export { posNames }
