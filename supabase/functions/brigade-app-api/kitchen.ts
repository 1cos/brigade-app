// Recipe completeness + ingredient cards (B-25 module 2, Chef Max 15/10/2026) — READ ONLY.
// 'completeness' = Chef only. 'ingredients' / 'ingredient' = every signed-in user; vendors and prices are added
// server-side ONLY for the Chef (staff never receive them). Selects only: this module has no write path.
import * as K from '../_shared/kitchen_core.js'
import * as KN from '../_shared/knowledge_core.js'
import * as CL from '../_shared/checklist_core.js'
import { ingredientFacts } from './mre.ts'

type U = { id: number; role: 'chef' | 'staff' }
export class KitchenError extends Error { constructor(public status: number, public code: string) { super(code) } }
const must = <T>(r: { data: T | null; error: unknown }) => { if (r.error) throw r.error; return r.data as T }
const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s)
const ING_COLS = 'id,name,name_it,name_es,category,base_unit,notes,active,measure_type,avg_unit_weight_g,yield_factor'
const VEND_COLS = 'ingredient_id,vendor,vendor_sku,purchase_unit,pack_description,unit_price,price_per_100g,price_per_each,last_invoice_date,do_not_order,do_not_order_reason'

export async function completeness(u: U, svc: any) {
  if (u.role !== 'chef') throw new KitchenError(403, 'forbidden')
  const [attention, recipes] = await Promise.all([
    svc.from('attention_items').select('origin,attention,reason,family,recipe_id').eq('origin', 'office').eq('attention', 'backlog').limit(5000).then(must),
    svc.from('recipes').select('id,title,category').limit(5000).then(must),
  ])
  return K.completeness(attention as any[], recipes as any[])
}

export async function ingredients(u: U, svc: any) {
  const chef = u.role === 'chef'
  const [ing, vend] = await Promise.all([
    svc.from('ingredients').select('id,name,name_it,name_es,category,active').order('name').limit(5000).then(must),
    chef ? svc.from('ingredient_vendors').select('ingredient_id,do_not_order').limit(10000).then(must) : Promise.resolve([]),
  ])
  return { ingredients: K.ingredientList(ing as any[], vend as any[], chef) }
}

export async function ingredient(u: U, id: string, svc: any) {
  if (!isUuid(id)) throw new KitchenError(400, 'bad_id')
  const chef = u.role === 'chef'
  const [ing, bom, prep, vend] = await Promise.all([
    svc.from('ingredients').select(ING_COLS).eq('id', id).then(must),
    svc.from('recipe_bom').select('parent_recipe_id,item_id').eq('item_id', id).limit(5000).then(must),
    svc.from('prep_tasks').select('id,name,ingredient_id').eq('ingredient_id', id).not('archived', 'is', true).then(must),
    chef ? svc.from('ingredient_vendors').select(VEND_COLS).eq('ingredient_id', id).then(must) : Promise.resolve([]),
  ]) as any[][]
  if (!ing.length) throw new KitchenError(404, 'not_found')
  const parents = [...new Set(bom.map(b => b.parent_recipe_id))]
  const recipes = parents.length ? must(await svc.from('recipes').select('id,title').in('id', parents)) as any[] : []
  return K.ingredientCard(id, { ingredients: ing, bom, prep, recipes, vendors: vend }, chef)
}

/* ---------- Knowledge Engine, phase 1 (B-51, Chef Max GO 16/10/2026) — READ ONLY, no new catalog ----------
   One ingredient card that joins vendors, invoices, FC05 prices/conversions, recipes (up the sub-recipe chain), POS and counts.
   Every value carries verified / estimated / missing + source (supabase/functions/_shared/knowledge_core.js).
   Staff get the card without vendors, invoices and prices (removed here, server-side). */
const KDAYS = 28
const INV_COLS = 'id,ingredient_id,invoice_date,vendor,invoice_number,import_id,raw_description,vendor_sku,qty,purchase_unit,pack_description,unit_price,line_total'
const dayIso = (d: Date) => d.toISOString().slice(0, 10)
const chunks = <T>(a: T[], n: number) => { const o: T[][] = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o }
async function inChunks(build: (ids: string[]) => Promise<any[]>, ids: string[]) { const out: any[] = []; for (const c of chunks(ids, 150)) out.push(...await build(c)); return out }
/** Every row, page by page: the API returns at most 1000 rows per request, and a cut list would be a silent error. */
async function pageAll(q: () => any, size = 1000) {
  const out: any[] = []
  for (let from = 0; from < 200000; from += size) { const rows = must(await q().range(from, from + size - 1)) as any[]; out.push(...rows); if (rows.length < size) break }
  return out
}

/** POS sold in the window: menu items (Food) + modifiers, summed by name. Kept 10 minutes in this server instance:
 *  the POS is imported once a day, so a card opened twice in a row does not re-read ~2.500 rows. */
const salesCache: Record<string, { at: number; rows: any[] }> = {}
async function salesWindow(svc: any, since: string) {
  const c = salesCache[since]; if (c && Date.now() - c.at < 10 * 60000) return c.rows
  const [items, mods] = await Promise.all([
    pageAll(() => svc.from('pos_sales_by_item').select('menu_item,quantity').gte('sale_date', since).not('is_historical', 'is', true).eq('sales_category', 'Food').order('id')),
    pageAll(() => svc.from('pos_modifiers').select('modifier,quantity_sold').gte('sale_date', since).not('is_historical', 'is', true).order('id')),
  ]) as any[][]
  const m: Record<string, any> = {}
  items.forEach(r => { const k = 'item|' + r.menu_item; (m[k] = m[k] || { kind: 'item', name: r.menu_item, qty: 0 }).qty += Number(r.quantity) || 0 })
  mods.forEach(r => { const k = 'modifier|' + r.modifier; (m[k] = m[k] || { kind: 'modifier', name: r.modifier, qty: 0 }).qty += Number(r.quantity_sold) || 0 })
  const rows = Object.values(m); salesCache[since] = { at: Date.now(), rows }; return rows
}

export async function knowledge(u: U, id: string, svc: any, opt: { facts?: (ids: string[]) => Promise<any>; now?: Date } = {}) {
  if (!isUuid(id)) throw new KitchenError(400, 'bad_id')
  const chef = u.role === 'chef'
  const today = opt.now || new Date(), since = dayIso(new Date(today.getTime() - KDAYS * 86400000))
  // recipe chain: direct lines, then the recipes that use those recipes (up to 6 levels), walked in memory
  const BOMC = 'parent_recipe_id,component_type,item_id,sub_recipe_id,quantity,unit'
  // FC05 facts come through the lab connection (~1 s): started first, so it overlaps every other read
  const factsP = (opt.facts || ingredientFacts)([id])
  const [ing, direct, subLines, salesP] = await Promise.all([
    svc.from('ingredients').select(ING_COLS).eq('id', id).then(must),
    pageAll(() => svc.from('recipe_bom').select(BOMC).eq('item_id', id).order('bom_id')),
    pageAll(() => svc.from('recipe_bom').select(BOMC).eq('component_type', 'RECIPE').order('bom_id')),
    salesWindow(svc, since),
  ]) as any[][]
  if (!ing.length) throw new KitchenError(404, 'not_found')
  const bom: any[] = direct.slice()
  const bySub: Record<string, any[]> = {}; subLines.forEach(b => { (bySub[b.sub_recipe_id] = bySub[b.sub_recipe_id] || []).push(b) })
  let frontier = [...new Set(bom.map(b => b.parent_recipe_id))], seen = new Set(frontier)
  for (let d = 0; d < 6 && frontier.length; d++) {
    const up = frontier.flatMap(x => bySub[x] || [])
    bom.push(...up); frontier = [...new Set(up.map((b: any) => b.parent_recipe_id))].filter(x => !seen.has(x)); frontier.forEach(x => seen.add(x))
  }
  const rids = [...seen]
  const [recipes, yields, prep, each, sales, facts, vend, aliases, inv] = await Promise.all([
    rids.length ? inChunks(c => svc.from('recipes').select('id,title,category,pos_name,menu_group,serving_qty,serving_unit').in('id', c).then(must), rids) : [],
    rids.length ? inChunks(c => svc.from('recipe_yield').select('id,portions,yield_qty,yield_dim').in('id', c).then(must), rids) : [],
    svc.from('prep_tasks').select('id,name,ingredient_id').eq('ingredient_id', id).not('archived', 'is', true).then(must),
    svc.from('unit_each_weights').select('ingredient_id,avg_weight_g,source').eq('ingredient_id', id).then(must),
    Promise.resolve(salesP),
    factsP,
    svc.from('ingredient_vendors').select('id,ingredient_id,vendor,vendor_sku,purchase_unit,pack_description,unit_price,conversion_to_base,price_per_100g,price_per_each,last_invoice_date,do_not_order,do_not_order_reason,active').eq('ingredient_id', id).then(must),
    chef ? svc.from('vendor_item_aliases').select('ingredient_id,vendor,vendor_sku,vendor_description,confirmed_by,active').eq('ingredient_id', id).then(must) : Promise.resolve([]),
    // invoices: every line of the window (for "bought") + the 8 newest (for the list), merged by id
    chef ? Promise.all([
      pageAll(() => svc.from('invoice_lines').select(INV_COLS).eq('ingredient_id', id).gte('invoice_date', since).order('id')),
      svc.from('invoice_lines').select(INV_COLS).eq('ingredient_id', id).order('invoice_date', { ascending: false }).limit(8).then(must),
    ]).then(([a, b]: any[][]) => { const m: Record<string, any> = {}; [...a, ...b].forEach(l => { m[l.id] = l }); return Object.values(m).sort((x: any, y: any) => String(y.invoice_date).localeCompare(String(x.invoice_date))) }) : Promise.resolve([]),
  ]) as any[]
  const prepIds = (prep as any[]).map(p => p.id)
  // invoice number: from the line, else from the original document (vendor_documents) — never invented
  const docIds = [...new Set((inv as any[]).filter(l => !l.invoice_number && l.import_id).map(l => l.import_id))]
  const [counts, docs] = await Promise.all([
    prepIds.length ? svc.from('prep_stock_counts').select('prep_task_id,counted_qty,unit,counted_by,counted_at').in('prep_task_id', prepIds).order('counted_at', { ascending: false }).limit(20).then(must) : Promise.resolve([]),
    docIds.length ? svc.from('vendor_documents').select('id,document_number').in('id', docIds).then(must) : Promise.resolve([]),
  ]) as any[][]
  const dn: Record<string, string> = {}; docs.forEach(d => { dn[d.id] = d.document_number })
  ;(inv as any[]).forEach(l => { l.doc_number = l.import_id ? dn[l.import_id] || null : null })
  return KN.knowledgeCard(id, { ingredients: ing, bom, recipes, yields, prep, vendors: vend, aliases, invoices: inv, facts: (facts as any)[id] || null,
    conv: [], each, sales, counts, days: KDAYS, since, today: dayIso(today) }, chef)
}

/** "To complete" for the Chef: every gap the card can show, as lists. */
export async function knowledgeGaps(u: U, svc: any, opt: { facts?: (ids: string[]) => Promise<any>; now?: Date } = {}) {
  if (u.role !== 'chef') throw new KitchenError(403, 'forbidden')
  const now = (opt.now || new Date()).getTime(), since = dayIso(new Date(now - KDAYS * 86400000)), since60 = dayIso(new Date(now - 60 * 86400000))
  const [ing, bom, vend, recipes, items, unmatched, nonum] = await Promise.all([
    pageAll(() => svc.from('ingredients').select('id,name,base_unit,avg_unit_weight_g').order('id')),
    pageAll(() => svc.from('recipe_bom').select('item_id,unit').not('item_id', 'is', null).order('bom_id')),
    pageAll(() => svc.from('ingredient_vendors').select('ingredient_id,vendor,vendor_sku,purchase_unit,pack_description,unit_price,conversion_to_base,price_per_each,active').order('id')),
    pageAll(() => svc.from('recipes').select('id,pos_name').order('id')),
    pageAll(() => svc.from('pos_sales_by_item').select('menu_item,quantity').gte('sale_date', since).not('is_historical', 'is', true).eq('sales_category', 'Food').order('id')),
    svc.from('invoice_lines').select('invoice_date,vendor,raw_description,vendor_sku').is('ingredient_id', null).gte('invoice_date', since60).order('invoice_date', { ascending: false }).limit(200).then(must),
    svc.from('invoice_lines').select('id', { count: 'exact', head: true }).is('invoice_number', null),
  ]) as any[]
  const ids = [...new Set((bom as any[]).map(b => b.item_id))] as string[]
  const facts: any = {}
  ;(await Promise.all(chunks(ids, 200).map(c => (opt.facts || ingredientFacts)(c)))).forEach(f => Object.assign(facts, f))
  const pos: Record<string, number> = {}; (items as any[]).forEach(r => { pos[r.menu_item] = (pos[r.menu_item] || 0) + (Number(r.quantity) || 0) })
  const g = KN.gaps({ ingredients: ing, bom, vendors: vend, facts, recipes, unmatched, posFood: Object.entries(pos).map(([name, qty]) => ({ name, qty })) })
  return Object.assign(g, { days: KDAYS, invoices_no_number: (nonum as any)?.count ?? null })
}

/* ---------- Smart Station Checklists (B-51; R1.11 Progressive Trust, Chef Max GO 16/10/2026) — SIMULATION, read only, Chef only ----------
   Pasta Station pilot. Real POS sales × recipes (same walk as the Knowledge Engine), read here, computed in
   ../_shared/checklist_core.js. Ticks stay on the phone (simulation): nothing is written, nothing moves stock. */
const ctDay = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
const dailyCache: Record<string, { at: number; rows: any[]; open: string[] }> = {}
async function salesDaily(svc: any, since: string) {
  const c = dailyCache[since]; if (c && Date.now() - c.at < 10 * 60000) return c
  const [items, mods] = await Promise.all([
    pageAll(() => svc.from('pos_sales_by_item').select('sale_date,menu_item,quantity,sales_category').gte('sale_date', since).not('is_historical', 'is', true).order('id')),
    pageAll(() => svc.from('pos_modifiers').select('sale_date,modifier,quantity_sold').gte('sale_date', since).not('is_historical', 'is', true).order('id')),
  ]) as any[][]
  const rows: any[] = [], open = new Set<string>()
  items.forEach(r => { open.add(r.sale_date); if (r.sales_category === 'Food') rows.push({ date: r.sale_date, kind: 'item', name: r.menu_item, qty: Number(r.quantity) || 0 }) })
  mods.forEach(r => rows.push({ date: r.sale_date, kind: 'modifier', name: r.modifier, qty: Number(r.quantity_sold) || 0 }))
  const out = { at: Date.now(), rows, open: [...open].sort() }; dailyCache[since] = out; return out
}
export async function smartChecklist(u: U, body: any, svc: any, opt: { now?: Date } = {}) {
  const chef = u.role === 'chef'
  if (!chef && !CL.GATES.staffVisible) throw new KitchenError(403, 'forbidden')   // simulation: Chef only until a new GO
  const station = body?.station == null ? 'pasta' : String(body.station)
  if (!Object.prototype.hasOwnProperty.call(CL.STATIONS, station)) throw new KitchenError(400, 'bad_station')
  const today = chef && /^\d{4}-\d{2}-\d{2}$/.test(String(body?.day || '')) ? String(body.day) : ctDay(opt.now)   // past days: Chef only
  const since = new Date(Date.parse(today + 'T12:00:00Z') - 42 * 86400000).toISOString().slice(0, 10)
  const until = new Date(Date.parse(today + 'T12:00:00Z') + 7 * 86400000).toISOString().slice(0, 10)
  const [bom, recipes, yields, sd, events] = await Promise.all([
    pageAll(() => svc.from('recipe_bom').select('parent_recipe_id,component_type,item_id,sub_recipe_id,quantity,unit').order('bom_id')),
    pageAll(() => svc.from('recipes').select('id,title,category,pos_name,menu_group,serving_qty,serving_unit').order('id')),
    pageAll(() => svc.from('recipe_yield').select('id,portions,yield_qty,yield_dim').order('id')),
    salesDaily(svc, since),
    svc.from('events').select('name,event_date,guest_count,status').gte('event_date', today).lte('event_date', until).then(must),
  ]) as any[]
  // a past day (simulation of an earlier service): only the history BEFORE that day is used
  const sales = (sd.rows as any[]).filter(r => r.date < today), open = (sd.open as string[]).filter(d => d < today)
  const past = today < ctDay(opt.now)
  const res = CL.stationPriorities({ station, today, bom, recipes, yields, sales, openDates: open, salesAll: past && chef ? sd.rows : null,
    events: (events as any[]).map(e => ({ name: e.name, date: e.event_date, guests: e.guest_count, status: e.status, menu_linked: false })) })
  // Progressive Trust: the level comes only from here (release switches + Chef grants). No grants are stored yet → step 1.
  const level = CL.levelFor(u, [], CL.GATES)
  if (!chef) return CL.forCook(res, level)
  return Object.assign(res, { level, steps: CL.STEPS, gates: CL.GATES, margins: CL.MARGINS })
}
