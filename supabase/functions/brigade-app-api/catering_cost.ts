// FOOD COST CATERING vivo (B-99c, MASTER RECIPE / Chef Max 09/11/2026) — ops 'cc_*', SOLO Chef (i costi non vanno al personale).
// Eventi e menu: letti da Brigade (events + event_document_versions, sincronizzati da Tripleseat) al momento dell'apertura.
// Costi: ingredienti e ricette di OGGI (cp_ingredient_costs / cp_recipe_costs = stesso motore FC05), prezzi alla DATA dell'evento (fatture ≤ data).
// Le modifiche di Max stanno in public.catering_cost_states, UNA RIGA PER SALVATAGGIO (versioni, mai sovrascritte): vincono SEMPRE sull'aggiornamento automatico.
// Il calcolo dei totali lo fa la pagina (catering_cost.html, identico a B-99); il server fornisce i dati e salva. Letture a pagine con conteggio (lezione B-103).
import * as K from '../_shared/catering_cost_core.js'

type U = { id: number; name: string; role: string }
export class CostError extends Error { constructor(public status: number, public code: string) { super(code) } }
const PAGE = 1000
const chef = (u: U) => { if (u.role !== 'chef') throw new CostError(403, 'forbidden') }
const must = <T>(r: { data: T | null; error: unknown }) => { if (r.error) throw r.error; return r.data as T }
const isKey = (k: unknown) => typeof k === 'string' && /^[A-Za-z0-9_-]{1,60}$/.test(k)

async function fetchAll(build: () => any, label: string): Promise<any[]> {
  const all: any[] = []; let total: number | null = null
  for (let from = 0; ; from += PAGE) {
    const { data, error, count } = await build().range(from, from + PAGE - 1)
    if (error) throw new Error(`${label}: ${error.message}`)
    if (total === null && typeof count === 'number') total = count
    all.push(...(data || []))
    if (!data || data.length < PAGE) break
    if (total !== null && all.length >= total) break
    if (from / PAGE > 200) throw new Error(`${label}: too many pages`)
  }
  if (total !== null && all.length !== total) throw new Error(`${label}: read ${all.length} of ${total} rows`)
  return all
}
const rpc = async (svc: any, fn: string, args?: any) => { const r = await svc.rpc(fn, args); if (r.error) throw new Error(`${fn}: ${r.error.message}`); return r.data }

/** Accepts only what the page can legitimately send: numbers in range, small objects, no code. */
export function cleanState(s: any) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) throw new CostError(400, 'bad_state')
  const num = (v: any, lo: number, hi: number, d: number | null = 0) => { if (v == null || v === '') return d; const n = Number(v); if (!isFinite(n) || n < lo || n > hi) throw new CostError(400, 'bad_number'); return n }
  const out: any = { guests: num(s.guests, 0, K.NMAX), mp: num(s.mp, 0, 100000), mq: num(s.mq, 0, 100000), clone: !!s.clone, dishes: {}, extras: [], ovr: {} }
  if (typeof s.mh === 'string') out.mh = s.mh.slice(0, 300)
  if (typeof s.note === 'string') out.note = s.note.slice(0, 1000)
  if (s.dishes && typeof s.dishes === 'object') {
    const ks = Object.keys(s.dishes); if (ks.length > 200) throw new CostError(400, 'bad_state')
    for (const k of ks) { if (!/^[A-Za-z0-9_|.\-]{1,80}$/.test(k)) throw new CostError(400, 'bad_state'); const d = s.dishes[k] || {}
      const o: any = { N: d.N == null || d.N === '' ? null : num(d.N, 0, K.NMAX), man: {} }
      for (const [rid, v] of Object.entries(d.man || {})) { if (!/^[0-9a-f-]{36}$/i.test(rid)) throw new CostError(400, 'bad_state'); o.man[rid] = num(v, 0, 100000) }
      out.dishes[k] = o }
  }
  if (Array.isArray(s.extras)) {
    if (s.extras.length > 200) throw new CostError(400, 'bad_state')
    out.extras = s.extras.map((x: any) => {
      if (!x || (x.type !== 'ing' && x.type !== 'rec') || !/^[0-9a-f-]{36}$/i.test(String(x.refId || ''))) throw new CostError(400, 'bad_state')
      const o: any = { type: x.type, refId: String(x.refId), name: String(x.name || '').slice(0, 120), qty: num(x.qty, 0, 1e7), unit: String(x.unit || 'g').slice(0, 8) }
      if (x.price != null && x.price !== '') o.price = num(x.price, 0, 1e6)
      return o
    })
  }
  if (s.ovr && typeof s.ovr === 'object') { for (const [k, v] of Object.entries(s.ovr)) { if (!/^[A-Za-z0-9_|.\-]{1,100}$/.test(k)) throw new CostError(400, 'bad_state'); if (v === '' || v == null) continue; out.ovr[k] = String(num(v, 0, 1e6)) } }
  return out
}

async function loadEvents(svc: any) {
  const events = await fetchAll(() => svc.from('events').select('id,name,event_date,event_time,guest_count,status,tripleseat_id,room_name,total_amount,last_synced_at,updated_at', { count: 'exact' }).gte('event_date', '2026-09-01').order('id'), 'events')
  const tsIds = [...new Set(events.map((e: any) => e.tripleseat_id).filter(Boolean).map(Number))]
  const versions: any[] = []
  for (let i = 0; i < tsIds.length; i += 30) versions.push(...await fetchAll(() => svc.from('event_document_versions').select('id,ts_event_id,ts_document_id,version_no,received_at,lines', { count: 'exact' }).in('ts_event_id', tsIds.slice(i, i + 30)).eq('is_test', false).order('id'), 'event_document_versions'))
  return { events, versions }
}

/** Everything the page shows, live: events + menus from Brigade, prices at each event's date, today's catalogs, Max's saved changes. */
export async function load(u: U, svc: any) {
  chef(u)
  const [{ events, versions }, recipes, curated, latest, ingRows] = await Promise.all([
    loadEvents(svc),
    fetchAll(() => svc.from('recipes').select('id,title,category,menu_group,pos_name,base_servings', { count: 'exact' }).order('id'), 'recipes'),
    fetchAll(() => svc.from('catering_cost_events').select('key,brigade_event_id,name,event_date,curated', { count: 'exact' }).order('key'), 'catering_cost_events'),
    rpc(svc, 'cp_latest_states'), rpc(svc, 'cp_ingredient_costs'),
  ])
  const nameById = new Map<string, string>(ingRows.map((i: any) => [i.id, i.name]))
  const ids = ingRows.filter((i: any) => K.MAP_NAMES.includes(i.name)).map((i: any) => i.id)
  const lines: any[] = []
  for (let i = 0; i < ids.length; i += 30) lines.push(...await fetchAll(() => svc.from('invoice_lines').select('id,ingredient_id,invoice_date,vendor,pack_description,invoice_number,unit_price,cost_per_100g,price_anomaly', { count: 'exact' }).in('ingredient_id', ids.slice(i, i + 30)).order('id'), 'invoice_lines'))
  const invoiceLines = lines.map((l: any) => ({ ...l, name: nameById.get(l.ingredient_id) }))
  const states: Record<string, any> = {}; for (const r of latest) states[r.event_key] = { state: r.state, ver: r.ver, saved_by: r.saved_by, saved_at: r.saved_at }
  // first pass without recipe costs to know which recipes the page needs at once, then cost only those (≈30 ms each)
  const inp: any = { events, versions, recipes, curated, invoiceLines, ingredientRows: ingRows }   // (il motore è JavaScript: i tipi dei parametri di default sono troppo stretti)
  let D = K.assembleData(inp)
  const need = K.neededRecipeIds(D.events, Object.fromEntries(Object.entries(states).map(([k, v]: any) => [k, v.state])))
  const recipeRows: any[] = []
  for (let i = 0; i < need.length; i += 40) recipeRows.push(...await rpc(svc, 'cp_recipe_costs', { p_ids: need.slice(i, i + 40) }))
  D = K.assembleData({ ...inp, recipeRows })
  const prefs = states['_prefs'] ? states['_prefs'].state : null; delete states['_prefs']
  return { ok: true, D, states, prefs, prefs_ver: latest.find((r: any) => r.event_key === '_prefs')?.ver ?? 0, user: u.name, loaded_at: new Date().toISOString() }
}

export async function save(u: U, b: any, svc: any) {
  chef(u)
  const key = b?.key; if (!isKey(key)) throw new CostError(400, 'bad_key')
  const state = key === '_prefs' ? { mode: b.state?.mode === 'pb' ? 'pb' : 'br', buffer: b.state?.buffer !== false } : cleanState(b.state)
  const base = Number(b.base_ver ?? 0); if (!Number.isInteger(base) || base < 0) throw new CostError(400, 'bad_base')
  const r = await rpc(svc, 'cp_save_state', { p_key: key, p_state: state, p_base: base, p_by: u.name, p_note: b.note ? String(b.note).slice(0, 200) : null })
  if (!r.ok) return { ok: false, conflict: true, ver: r.ver }
  return { ok: true, ver: r.ver }
}

export async function history(u: U, b: any, svc: any) {
  chef(u)
  const key = b?.key; if (!isKey(key)) throw new CostError(400, 'bad_key')
  const rows = must(await svc.from('catering_cost_states').select('ver,saved_by,saved_at,note,state').eq('event_key', key).order('ver', { ascending: false }).limit(30)) as any[]
  return { ok: true, versions: rows.map((r) => ({ ver: r.ver, saved_by: r.saved_by, saved_at: r.saved_at, note: r.note, state: r.state })) }
}

/** One recipe's cost today (the page asks when Max picks a recipe to add). */
export async function recipe(u: U, b: any, svc: any) {
  chef(u)
  const id = String(b?.id || ''); if (!/^[0-9a-f-]{36}$/i.test(id)) throw new CostError(400, 'bad_id')
  const rows = await rpc(svc, 'cp_recipe_costs', { p_ids: [id] })
  if (!rows.length) throw new CostError(404, 'not_found')
  const r = rows[0]
  return { ok: true, rec: K.recipeEntry({ id: r.id, title: r.title, menu_group: r.menu_group, category: r.category, base_servings: r.base_servings }, r.j) }
}

/** Moves the edits Max made in the old page (this browser's localStorage) to the server, once, without touching what is already saved. */
export async function importLocal(u: U, b: any, svc: any) {
  chef(u)
  const src = b?.data; if (!src || typeof src !== 'object' || typeof src.ev !== 'object') throw new CostError(400, 'bad_state')
  const have = new Set((await rpc(svc, 'cp_latest_states')).map((r: any) => r.event_key))
  const done: string[] = [], skipped: string[] = []
  for (const [key, st] of Object.entries(src.ev as Record<string, any>)) {
    if (!isKey(key)) continue
    if (have.has(key)) { skipped.push(key); continue }
    let clean: any; try { clean = cleanState(st) } catch { skipped.push(key); continue }
    const r = await rpc(svc, 'cp_save_state', { p_key: key, p_state: clean, p_base: 0, p_by: u.name, p_note: 'importato dal browser (pagina B-99 precedente)' })
    if (r.ok) done.push(key); else skipped.push(key)
  }
  if (!have.has('_prefs') && (src.mode === 'br' || src.mode === 'pb')) await rpc(svc, 'cp_save_state', { p_key: '_prefs', p_state: { mode: src.mode, buffer: src.buffer !== false }, p_base: 0, p_by: u.name, p_note: 'importato dal browser' })
  return { ok: true, imported: done, skipped }
}

export async function cc(u: U, b: any, svc: any) {
  switch (b?.op) {
    case 'cc_load': return await load(u, svc)
    case 'cc_save': return await save(u, b, svc)
    case 'cc_history': return await history(u, b, svc)
    case 'cc_recipe': return await recipe(u, b, svc)
    case 'cc_import': return await importLocal(u, b, svc)
  }
  throw new CostError(400, 'bad_op')
}
