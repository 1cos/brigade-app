// MRE — Master Recipe Engine lab (B-49, Chef Max GO 15/10/2026) inside brigade-app-api.
// ISOLATION: every statement runs in a transaction under role mre_app (SET LOCAL ROLE), which has rights ONLY on schema mre.
// Main Brigade tables (recipes, recipe_bom, prep, stock, POS, food_cost) are read only through the read-only helper
// functions (prices, conversions) — this module cannot write them even by mistake: Postgres refuses.
// Calculations use the SAME engine file as the app (../_shared/mre_engine.js).
// STEP A (Chef Max GO 20/10/2026, CD-066): ONE source. A recipe is always READ FRESH from Brigade's official tables
// (recipes, recipe_bom, recipe_steps, prep_tasks, recipe_yield) and converted in memory by the shared converter — the lab keeps
// ONLY drafts and the history of versions. Publishing to the official recipes is LOCKED (needs tests, F6/C-5, backup, new GO).
import postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js'
import * as E from '../_shared/mre_engine.js'
import { buildLabDoc } from '../_shared/mre_import.js'
import * as PM from '../_shared/purchase_match.js'
import * as P from '../_shared/mre_publish.js'

const sql = postgres(Deno.env.get('SUPABASE_DB_URL') ?? '', { prepare: false, max: 3, idle_timeout: 20, connect_timeout: 10 })
type U = { id: number; name: string; role: 'chef' | 'staff' }  // B-63: 'assistente' arriva solo sulle operazioni tec_*
export class MreError extends Error { constructor(public status: number, public code: string) { super(code) } }
const bad = (c: string) => new MreError(400, c)
const forbid = () => new MreError(403, 'forbidden')
const isUuid = (s: unknown) => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s)
const chef = (u: U) => { if (u.role !== 'chef') throw forbid() }

/** Every lab statement: one transaction, role mre_app. */
function lab<T>(fn: (tx: any) => Promise<T>): Promise<T> {
  return sql.begin(async (tx: any) => { await tx`set local role mre_app`; return await fn(tx) }) as Promise<T>
}
const audit = (tx: any, u: U, op: string, recipe: string | null, detail: unknown) =>
  tx`insert into mre.audit (user_id, op, recipe_id, detail) values (${u.id}, ${op}, ${recipe}, ${sql.json(detail as any)})`

const must = (r: any) => { if (r.error) throw r.error; return r.data || [] }
/** Official recipes (and every sub-recipe below them), read fresh from Brigade with selects only, converted by the shared
 *  converter. Nothing is stored: this is the same number the bots, the food cost and Brigade 1 read. */
// C-62: lettura unica (una sola richiesta) se il database ha mre.official_bundle; altrimenti la strada di prima (REST, più richieste)
// Prima di usarla si controlla che esista (una volta ogni 5 minuti): un errore dentro la transazione la bloccherebbe tutta.
let bundleOk: boolean | null = null, bundleCheckedAt = 0
async function readBundle(tx: any, rootIds: string[]) {
  if (!tx) return null
  if (bundleOk === null || Date.now() - bundleCheckedAt > 300_000) {
    const [{ ok }] = await tx`select (to_regprocedure('mre.official_bundle(uuid[])') is not null and has_function_privilege(current_user, 'mre.official_bundle(uuid[])', 'execute')) as ok`
    bundleOk = !!ok; bundleCheckedAt = Date.now()
  }
  if (!bundleOk) return null
  const [{ b }] = await tx`select mre.official_bundle(string_to_array(${rootIds.join(',')}, ',')::uuid[]) as b`
  return b
}
async function readOfficial(svc: any, rootIds: string[], tx0?: any, unica = false) {   // unica: solo per T.E.C. (C-62); Editor invariato
  const recipes: Record<string, any> = {}, bom: Record<string, any[]> = {}
  const roots = [...new Set(rootIds)].filter(isUuid)
  const B = unica && roots.length ? await readBundle(tx0, roots) : null
  if (B) {
    for (const r of B.recipes || []) { recipes[r.id] = r; bom[r.id] = [] }
    const facts = B.facts || {}
    ;(B.bom || []).slice().sort((a: any, b: any) => (a.sort_order ?? 1e9) - (b.sort_order ?? 1e9) || a.bom_id - b.bom_id)
      .forEach((b: any) => { if (bom[b.parent_recipe_id]) bom[b.parent_recipe_id].push(Object.assign({}, b, { policy: b.item_id && facts[b.item_id] ? facts[b.item_id].policy ?? null : null })) })
    const ids = Object.keys(recipes), at = new Date().toISOString(), docs: Record<string, any> = {}, diffs: Record<string, any[]> = {}
    for (const rid of ids) {
      const out = buildLabDoc({ id: rid, r: recipes[rid], rows: bom[rid], stepRows: (B.steps || []).filter((x: any) => x.recipe_id === rid), prepRows: (B.preps || []).filter((x: any) => x.recipe_id === rid),
                                y: (B.yields || []).find((x: any) => x.id === rid), byId: recipes, importedAt: at })
      docs[rid] = Object.assign(out.doc, { id: rid, _source: 'official' }); diffs[rid] = out.diffs
    }
    return { docs, diffs, read_at: at, facts, measures: B.measures || {}, unica: true }
  }
  let frontier = [...new Set(rootIds)].filter(isUuid)
  for (let depth = 0; depth < 8 && frontier.length; depth++) {
    const todo = frontier.filter(x => !(x in bom))
    if (!todo.length) break
    const rs = must(await svc.from('recipes').select('*').in('id', todo)) as any[]
    rs.forEach(r => { recipes[r.id] = r; bom[r.id] = [] })
    if (!rs.length) break
    const bs = must(await svc.from('recipe_bom').select('*, ingredients(name, base_unit)').in('parent_recipe_id', rs.map(r => r.id)).limit(5000)) as any[]
    bs.sort((a, b) => (a.sort_order ?? 1e9) - (b.sort_order ?? 1e9) || a.bom_id - b.bom_id)
      .forEach(b => { const { ingredients: ing, ...row } = b; bom[b.parent_recipe_id].push(Object.assign(row, { ing_name: ing?.name ?? null, ing_base: ing?.base_unit ?? null })) })
    frontier = [...new Set(bs.filter(b => b.component_type === 'RECIPE' && b.sub_recipe_id).map(b => b.sub_recipe_id))] as string[]
  }
  const ids = Object.keys(recipes)
  if (!ids.length) return { docs: {} as Record<string, any>, diffs: {} as Record<string, any[]>, read_at: new Date().toISOString(), raw: {} as Record<string, any>, byId: {} as Record<string, any> }
  const itemIds = [...new Set(Object.values(bom).flat().filter((b: any) => b.item_id).map((b: any) => b.item_id))] as string[]
  const factsQ = async (tx: any) => { const [{ f }] = await tx`select mre.ingredient_facts(string_to_array(${itemIds.join(',')}, ',')::uuid[]) as f`; return f || {} }
  const facts = itemIds.length ? (tx0 ? await factsQ(tx0) : await lab<any>(factsQ)) : {}
  Object.values(bom).flat().forEach((b: any) => { b.policy = b.item_id && facts[b.item_id] ? facts[b.item_id].policy ?? null : null })
  const [steps, preps, yields] = await Promise.all([
    svc.from('recipe_steps').select('*').in('recipe_id', ids).order('step_number').then(must),
    svc.from('prep_tasks').select('id,name,unit,recipe_id,prep_type,stock_role,archived').in('recipe_id', ids).not('archived', 'is', true).then(must),
    svc.from('recipe_yield').select('*').in('id', ids).then(must),
  ]) as any[][]
  const at = new Date().toISOString(), docs: Record<string, any> = {}, diffs: Record<string, any[]> = {}, raw: Record<string, any> = {}
  for (const rid of ids) {
    raw[rid] = { r: recipes[rid], rows: bom[rid], stepRows: steps.filter(x => x.recipe_id === rid), prepRows: preps.filter(x => x.recipe_id === rid), y: yields.find(x => x.id === rid) || {} }
    const out = buildLabDoc({ id: rid, ...raw[rid], byId: recipes, importedAt: at })
    docs[rid] = Object.assign(out.doc, { id: rid, _source: 'official' }); diffs[rid] = out.diffs
  }
  return { docs, diffs, read_at: at, raw, byId: recipes }
}
/** Lab-only recipes (never in Brigade: the Chef's test example, proposals like a new POS ITEM): their latest draft or version. */
async function labOnlyDocs(tx: any, ids: string[]) {
  if (!ids.length) return {} as Record<string, any>
  const rows = await tx`select r.id, v.version, v.state, v.doc from mre.recipes r
    join lateral (select * from mre.versions x where x.recipe_id = r.id order by (x.state = 'bozza') desc, x.version desc limit 1) v on true
    where r.id = any(string_to_array(${ids.join(',')}, ',')::uuid[]) and (r.is_test or coalesce((r.source->>'lab_only')::boolean, false))`
  const out: Record<string, any> = {}
  rows.forEach((r: any) => { out[r.recipe_id || r.id] = Object.assign({}, r.doc, { id: r.id, _source: 'lab', _version: r.version, _state: r.state }) })
  return out
}
async function draftsOf(tx: any, ids: string[]) {
  if (!ids.length) return {} as Record<string, any>
  const rows = await tx`select recipe_id, version, doc from mre.versions where state = 'bozza' and recipe_id = any(string_to_array(${ids.join(',')}, ',')::uuid[])`
  const out: Record<string, any> = {}
  rows.forEach((r: any) => { out[r.recipe_id] = Object.assign({}, r.doc, { id: r.recipe_id, _source: 'draft', _version: r.version }) })
  return out
}
/** Every recipe below a root: official first, lab-only where Brigade has none. Drafts kept apart (Chef preview only).
 *  Plus the live facts of every ingredient. */
async function tree(tx: any, svc: any, rootDoc: any, withDrafts: boolean, pre?: { docs: Record<string, any>; facts?: any; measures?: any; drafts?: Record<string, any> }) {
  const docs: Record<string, any> = { [rootDoc.id]: rootDoc }, draftDocs: Record<string, any> = {}
  let frontier = [rootDoc]
  // C-62: bozze delle sottoricette già lette, prese tutte insieme (una richiesta invece di una per livello)
  const preIds = pre ? Object.keys(pre.docs).filter(id => id !== rootDoc.id) : []
  const draftCache: Record<string, any> | null = pre && withDrafts ? (pre.drafts ?? await draftsOf(tx, preIds)) : null
  for (let d = 0; d < 8 && frontier.length; d++) {
    const want = [...new Set(frontier.flatMap((x: any) => (x.lines || []).filter((l: any) => l.kind === 'recipe').map((l: any) => l.ref)))].filter(id => !docs[id]) as string[]
    if (!want.length) break
    const known = pre ? want.filter(id => pre.docs[id]) : [], other = want.filter(id => !known.includes(id))
    const off = Object.assign(Object.fromEntries(known.map(id => [id, pre!.docs[id]])), other.length ? (await readOfficial(svc, other, tx)).docs : {})
    const missing = want.filter(x => !off[x]), lo = await labOnlyDocs(tx, missing)
    const got: Record<string, any> = Object.assign({}, off, lo)
    Object.assign(docs, got)
    if (withDrafts) {
      const ks = Object.keys(got), inCache = draftCache ? ks.filter(k => preIds.includes(k)) : [], fuori = ks.filter(k => !inCache.includes(k))
      for (const k of inCache) if (draftCache![k]) draftDocs[k] = draftCache![k]
      if (fuori.length) Object.assign(draftDocs, await draftsOf(tx, fuori))
    }
    frontier = [...Object.values(got), ...Object.values(draftDocs).filter((x: any) => !frontier.includes(x))]
  }
  const all = [...Object.values(docs), ...Object.values(draftDocs)]
  const ing = [...new Set(all.flatMap((x: any) => (x.lines || []).filter((l: any) => l.kind === 'ingredient').map((l: any) => l.ref)))]
  if (pre && pre.facts && pre.measures) {   // C-62: fatti e misure già letti; si chiedono solo gli ingredienti nuovi (righe aggiunte)
    const manca = (ing as string[]).filter(id => !(id in pre.facts))
    const extra = manca.length ? ((await tx`select mre.ingredient_facts(string_to_array(${manca.join(',')}, ',')::uuid[]) as f`)[0].f || {}) : {}
    return { docs, draftDocs, facts: Object.assign({}, pre.facts, extra), measures: pre.measures }
  }
  const [{ f }] = await tx`select mre.ingredient_facts(string_to_array(${(ing as string[]).join(',')}, ',')::uuid[]) as f`
  const [{ m }] = await tx`select mre.kitchen_measures() as m`
  return { docs, draftDocs, facts: f || {}, measures: m || {} }
}
const ctxOf = (t: any, drafts = false) => ({ doc: (id: string) => (drafts && t.draftDocs && t.draftDocs[id]) || t.docs[id], facts: (id: string) => t.facts[id], measures: t.measures })
const LOCK = 'pubblicazione_bloccata'   // step A: nothing is ever published to the official recipes from here
// MR-04: «Pubblica» exists only when the switch is on (set at installation, Chef's GO). Off = everything exactly as before.
const publishOn = () => Deno.env.get('MRE_PUBLISH') === 'on'
function stripPrices(facts: any) { const o: any = {}; for (const k of Object.keys(facts)) { const { price, ...rest } = facts[k]; o[k] = rest } return o }
const stripEst = (doc: any) => doc && Array.isArray(doc.lines) && doc.lines.some((l: any) => l.est) ? Object.assign({}, doc, { lines: doc.lines.map((l: any) => { const { est, ...rest } = l; return rest }) }) : doc
function stripEstDocs(docs: any) { const o: any = {}; for (const k of Object.keys(docs || {})) o[k] = stripEst(docs[k]); return o }

/* ---------------- reads ---------------- */
/** R1.13 (Chef 20/10 "una sola lista"): EVERY recipe once. Official recipes from Brigade (read only) + lab-only proposals.
 *  Old lab copies, drafts and history are attached to their recipe, never listed as other recipes.
 *  Kind, read from Brigade: MENU ITEM = has a POS name (all 62 recipes sold in the last 120 days have one, verified 20/10);
 *  PREP = has an active prep task or is used as a sub-recipe. A lab proposal that takes over the POS names of a recipe
 *  (CD-067: Butter Spinach POS ITEM over the Spinach Cup draft) moves the MENU ITEM kind to itself in the Chef's list. */
export async function mreList(u: U, svc: any) {
  const chefU = u.role === 'chef'
  const [recs, preps, subs] = await Promise.all([
    svc.from('recipes').select('id,title,category,pos_name').order('title').limit(3000).then(must),
    svc.from('prep_tasks').select('recipe_id,archived').not('recipe_id', 'is', null).limit(5000).then(must),
    svc.from('recipe_bom').select('sub_recipe_id').eq('component_type', 'RECIPE').not('sub_recipe_id', 'is', null).limit(5000).then(must),
  ]) as any[][]
  const prepSet = new Set(preps.filter((p: any) => p.archived !== true).map((p: any) => p.recipe_id)), subSet = new Set(subs.map((b: any) => b.sub_recipe_id))
  const labRows: any[] = await lab<any[]>(tx => tx`
    select r.id, r.pilot, r.is_test, r.current_version, r.source, d.version as draft_version, d.doc->>'title' as draft_title, d.doc->>'category' as draft_category, d.reason as draft_reason,
           (select count(*)::int from mre.suggestions s where s.recipe_id = r.id and s.status = 'in attesa') as pending,
           coalesce((r.source->>'lab_only')::boolean, false) as lab_only, coalesce((r.source->>'on_demand')::boolean, false) as on_demand
    from mre.recipes r left join mre.versions d on d.recipe_id = r.id and d.state = 'bozza'`)
  const L: Record<string, any> = Object.fromEntries(labRows.map((r: any) => [r.id, r]))
  const takenPos = new Set(labRows.filter((r: any) => r.lab_only && r.draft_version != null && r.source && r.source.takes_pos_from).map((r: any) => r.source.takes_pos_from))
  const review = (r: any) => r && r.source && r.source.review ? r.source.review : null
  // MR-14: a draft T.E.C. wrote (or touched last) — its note stays while the Chef corrects it, until it is published or discarded
  const daTec = (l: any) => !!(l && ((l.draft_version != null && /^(T\.E\.C\.|Proposta nuova di T\.E\.C\.)/.test(l.draft_reason || '')) || (l.lab_only && l.source && l.source.proposta_da === 'T.E.C.' && l.draft_version != null)))
  const out: any[] = []
  for (const r of recs) {
    const l = L[r.id], archived = /archiv/i.test(r.category || '')
    const menu = !!String(r.pos_name || '').trim(), prep = prepSet.has(r.id) || subSet.has(r.id)
    const pos = [...new Set(String(r.pos_name || '').split('|').map((x: string) => x.trim()).filter(Boolean))]   // R1.18: searchable by every POS name
    const row: any = { id: r.id, title: r.title, category: r.category, menu, prep, archived, ...(pos.length ? { pos_names: pos } : {}),
      mre: !!(l && !l.is_test && !l.lab_only && (chefU || !l.on_demand)) }       // staff: the recipes they already open in this card
    if (chefU) {
      if (l && l.draft_version != null) { row.draft = true; row.draft_version = l.draft_version; if (l.draft_title && l.draft_title !== r.title) row.draft_title = l.draft_title }
      if (takenPos.has(r.id) && row.draft) row.menu = false                     // its POS names go to the proposal (CD-067)
      row.review = review(l); row.pending = l ? l.pending : 0
      if (daTec(l)) row.da_tec = true
    }
    out.push(row)
  }
  // proposals: not in Brigade yet, Chef only (MR-14: also one withdrawn from Brigade, which has no open draft)
  const withdrawn = labRows.filter((l: any) => l.lab_only && !l.is_test && l.draft_version == null && l.source && l.source.ritirata)
  const wTitle: Record<string, any> = withdrawn.length ? Object.fromEntries((await lab<any[]>(tx => tx`select distinct on (recipe_id) recipe_id, doc->>'title' as t, doc->>'category' as c from mre.versions where recipe_id = any(string_to_array(${withdrawn.map((l: any) => l.id).join(',')}, ',')::uuid[]) order by recipe_id, version desc`)).map((x: any) => [x.recipe_id, x])) : {}
  if (chefU) for (const l of labRows) if (l.lab_only && !l.is_test && (l.draft_version != null || wTitle[l.id]))
    out.push({ id: l.id, title: l.draft_title || (wTitle[l.id] || {}).t, category: l.draft_category || (wTitle[l.id] || {}).c, menu: l.source.kind !== 'prep', prep: l.source.kind === 'prep', archived: false, mre: true, lab_only: true, draft: l.draft_version != null, draft_version: l.draft_version, review: review(l), pending: l.pending, pos_names: l.source.pos_names || null, ...(daTec(l) ? { da_tec: true } : {}) })
  out.sort((a, b) => String(a.draft_title || a.title || '').localeCompare(String(b.draft_title || b.title || ''), 'en', { sensitivity: 'base' }))
  return { engine: E.MRE_ENGINE_VERSION, source: 'official', publish_locked: !publishOn(), recipes: out, pending: chefU ? labRows.reduce((a: number, r: any) => a + r.pending, 0) : 0 }
}

/** Chef's review mark (R1.13): "verified by the Chef" — kept in the lab next to the recipe. It is NOT a publication and
 *  changes nothing in the recipe, in Brigade or in the bots. */
export async function mreReview(u: U, b: any, svc: any) {
  chef(u)
  const id = String(b?.id || ''); if (!isUuid(id)) throw bad('bad_id')
  const on = b?.verified !== false
  const off = await readOfficial(svc, [id])
  return await lab(async tx => {
    const [r] = await tx`select source, is_test from mre.recipes where id = ${id} for update`
    if (!r && !off.docs[id]) throw new MreError(404, 'not_found')
    // R1.14 (Chef 21/10): the review mark keeps the problems still open on what the Chef reviewed (his draft if any, else the
    // official recipe) — a reviewed recipe is NOT a complete or published one, and its open problems stay visible
    let open: any[] = []
    if (on) {
      const [dr] = await tx`select doc from mre.versions where recipe_id = ${id} and state = 'bozza'`
      const root = dr ? Object.assign({}, dr.doc, { id }) : (off.docs[id] || (await labOnlyDocs(tx, [id]))[id])
      if (root) { const t = await tree(tx, svc, root, true); open = E.issues(id, ctxOf(t, true)).map((x: any) => ({ code: x.code, status: x.status || null, ref: x.ref || null })) }
    }
    const mark = on ? { by: u.name, by_id: u.id, at: new Date().toISOString(), open: open.length, issues: open } : null
    if (!r) await tx`insert into mre.recipes (id, pilot, current_version, source, diffs) values (${id}, false, 0, ${sql.json({ link: 'official', on_demand: true, requested_by: u.id, at: off.read_at, review: mark } as any)}, ${sql.json(off.diffs[id] || [])})`
    else if (mark) await tx`update mre.recipes set source = jsonb_set(coalesce(source, '{}'::jsonb), '{review}', ${sql.json(mark as any)}::jsonb) where id = ${id}`
    else await tx`update mre.recipes set source = coalesce(source, '{}'::jsonb) - 'review' where id = ${id}`
    await audit(tx, u, on ? 'review_verified' : 'review_cleared', id, {})
    return { ok: true, review: mark }   // never touches the recipe, the BOM, the bots or the stock
  })
}

export async function mreRecipe(u: U, id: string, svc: any) {
  if (!isUuid(id)) throw bad('bad_id')
  const off = await readOfficial(svc, [id])
  return await lab(async tx => {
    const [r] = await tx`select id, pilot, is_test, current_version, diffs, diffs_checked_at, diffs_checked_by, imported_at, source from mre.recipes where id = ${id}`
    let cur = off.docs[id], source = 'official'
    if (!cur) { cur = (await labOnlyDocs(tx, [id]))[id]; source = 'lab' }
    if (!cur) throw new MreError(404, 'not_found')
    const isChef = u.role === 'chef'
    if (source === 'lab' && !isChef && !(r && r.is_test)) throw new MreError(404, 'not_found')     // proposals are Chef work in progress
    const t = await tree(tx, svc, cur, isChef)
    const out: any = { engine: E.MRE_ENGINE_VERSION, source, read_at: off.read_at, publish_locked: !(r && r.is_test) && !(publishOn() && (source === 'official' || !!(r && r.source && r.source.lab_only))),
      recipe: { id, pilot: r ? r.pilot : false, current_version: r ? r.current_version : 0, linked: !!r, lab_only: !!(r && !r.is_test && r.source && r.source.lab_only), review: isChef && r && r.source && r.source.review ? r.source.review : null },
      doc: isChef ? cur : stripEst(cur), docs: isChef ? t.docs : stripEstDocs(t.docs), draft_docs: isChef ? t.draftDocs : {}, facts: isChef ? t.facts : stripPrices(t.facts), measures: t.measures }
    const vers = r ? await tx`select version, state, reason, created_by, created_at, published_by, published_at from mre.versions where recipe_id = ${id} order by version desc` : []
    const prods = r ? await tx`select id, version, factor, reference, yield_planned_g, yield_real_g, changed, note, user_id, created_at from mre.productions where recipe_id = ${id} ${isChef ? tx`` : tx`and user_id = ${u.id}`} order by created_at desc limit 20` : []
    const sugs = r ? await tx`select id, version, user_id, text, status, created_at, decided_by, decided_at, chef_note from mre.suggestions where recipe_id = ${id} ${isChef ? tx`` : tx`and user_id = ${u.id}`} order by created_at desc limit 50` : []
    const ids = [...new Set([...vers.flatMap((v: any) => [v.created_by, v.published_by]), ...prods.map((p: any) => p.user_id), ...sugs.flatMap((s: any) => [s.user_id, s.decided_by])].filter((x: any) => x != null))]
    const names: Record<number, string> = {}
    if (ids.length) { const { data } = await svc.from('users').select('id,name').in('id', ids); (data || []).forEach((x: any) => { names[x.id] = x.name }) }
    const nm = (x: any) => x == null ? null : names[x] || ('#' + x)
    // lab versions are HISTORY only (the 15/10 copies, drafts): the recipe in use is the official one
    out.versions = vers.map((v: any) => ({ version: v.version, state: v.state, reason: v.reason, by: nm(v.published_by ?? v.created_by), at: v.published_at ?? v.created_at }))
    out.productions = prods.map((p: any) => ({ ...p, by: nm(p.user_id) }))
    out.suggestions = sugs.map((s: any) => ({ id: s.id, version: s.version, text: s.text, status: s.status, at: s.created_at, by: nm(s.user_id), decided_by: nm(s.decided_by), decided_at: s.decided_at, chef_note: s.chef_note }))
    if (isChef) {
      const [dr] = r ? await tx`select version, doc, created_at from mre.versions where recipe_id = ${id} and state = 'bozza'` : []
      out.draft = dr ? Object.assign({}, dr.doc, { id, _version: dr.version, _state: 'bozza' }) : null
      if (out.draft && source === 'official') {            // what the draft links to (new ingredients, other sub-recipes) must be readable too
        const td = await tree(tx, svc, out.draft, true)
        for (const [k, v] of Object.entries(td.docs)) if (k !== id && !out.docs[k]) out.docs[k] = v
        Object.assign(out.draft_docs, td.draftDocs); Object.assign(out.facts, td.facts)
      }
      out.diffs = source === 'official' ? off.diffs[id] || [] : []                               // text vs BOM, read fresh
      out.diffs_checked = r && r.diffs_checked_at ? { at: r.diffs_checked_at, by: nm(r.diffs_checked_by) } : null
      out.cost = E.cost(id, 1, ctxOf(t, source === 'lab'))                     // computed on the SERVER with the shared engine (official numbers; a lab proposal with its drafts)
    }
    return out
  })
}

export async function mreIngredients(u: U, q: string, svc: any) {
  chef(u)
  const s = String(q || '').trim().slice(0, 60)
  const recs = s.length >= 2 ? must(await svc.from('recipes').select('id,title').ilike('title', '%' + s.replace(/[%_]/g, '') + '%').order('title').limit(15)) : []
  return await lab(async tx => { const [{ r }] = await tx`select mre.ingredient_search(${s}) as r`; return { ingredients: r, recipes: recs } })
}

/* ---------------- Chef: "Edit" on ANY recipe (B-25 16/10; step A 20/10) ----------------
   No copy any more: the recipe stays the official one, read fresh every time. "Edit" only registers the recipe in the lab
   (one row, no version) so that a draft and its history can be attached to it. Brigade is only READ here. */
export async function mrePrepareEdit(u: U, body: any, svc: any) {
  chef(u)
  const id = String(body?.id || ''); if (!isUuid(id)) throw bad('bad_id')
  const off = await readOfficial(svc, [id])
  if (!off.docs[id]) throw new MreError(404, 'not_found')
  return await lab(async tx => {
    const ins = await tx`insert into mre.recipes (id, pilot, current_version, source, diffs) values (${id}, false, 0,
      ${sql.json({ link: 'official', on_demand: true, requested_by: u.id, at: off.read_at } as any)}, ${sql.json(off.diffs[id] || [])}) on conflict (id) do nothing returning id`
    if (ins.length) await audit(tx, u, 'link_official', id, { at: off.read_at })
    return { ok: true, id, linked: true, imported: 0 }
  })
}

/* ---------------- Chef: draft, publish, restore ---------------- */
// R1.19 (Chef 22/10): "prezzo di fiducia" on a recipe line — { usd, qty, unit, at } = usd for qty unit. Anything else is dropped.
function estOf(e: any) {
  if (!e || typeof e !== 'object' || !(Number(e.usd) > 0) || !(Number(e.qty) > 0) || !e.unit) return null
  return { usd: Math.round(Number(e.usd) * 100) / 100, qty: Number(e.qty), unit: String(e.unit).slice(0, 20), at: e.at ? String(e.at).slice(0, 40) : null }
}
function cleanDoc(id: string, d: any) {
  if (!d || typeof d !== 'object') throw bad('bad_doc')
  const str = (x: any, n: number) => x == null ? null : String(x).slice(0, n)
  const num = (x: any) => x == null || x === '' ? null : (isFinite(Number(x)) && Number(x) >= 0 ? Number(x) : (() => { throw bad('bad_number') })())
  const lines = (Array.isArray(d.lines) ? d.lines : []).slice(0, 200).map((l: any) => ({
    id: str(l.id, 40), kind: l.kind === 'recipe' ? 'recipe' : 'ingredient', ref: isUuid(l.ref) ? l.ref : (() => { throw bad('bad_ref') })(),
    qty: num(l.qty), unit: str(l.unit, 20), role: ['produzione', 'al_piatto', 'imballo'].includes(l.role) ? l.role : 'produzione',
    note: str(l.note, 300), group: str(l.group, 60), src: l.src && typeof l.src === 'object' ? l.src : null,
    ...(l.per === 'portion' ? { per: 'portion' } : {}),       // R1.17: quantity per portion (1 container per cup)
    ...(estOf(l.est) ? { est: estOf(l.est) } : {}) }))           // R1.19: the Chef's estimated price ("prezzo di fiducia"), a stima, never an invoice
  const LG = ['it', 'en', 'es'], TRS = ['auto', 'chef', 'stale', 'check', 'imported']
  const steps = (Array.isArray(d.steps) ? d.steps : []).slice(0, 60).map((s: any) => {
    const o: any = { it: str(s.it, 4000) || '', en: str(s.en, 4000) || '', es: str(s.es, 4000) || '', title_it: str(s.title_it, 200), title_en: str(s.title_en, 200), title_es: str(s.title_es, 200) }
    if (LG.includes(s.src)) o.src = s.src                                        // R1.17: the language the Chef actually wrote in
    if (s.tr && typeof s.tr === 'object') { o.tr = {}; for (const k of LG) if (TRS.includes(s.tr[k])) o.tr[k] = s.tr[k] }
    if (s.h != null) o.h = str(s.h, 40)
    return o })
  const y = d.yield || {}
  const hist = (Array.isArray(y.label_hist) ? y.label_hist : []).slice(0, 10).map((x: any) => str(x, 200)).filter(Boolean)
  return { schema: 1, id, title: str(d.title, 200) || '', category: str(d.category, 100), yield: { g: num(y.g), portions: num(y.portions), label: str(y.label, 120), count: num(y.count), count_unit: str(y.count_unit, 20),
      ...(num(y.portion_g) ? { portion_g: num(y.portion_g) } : {}), ...(y.portion_unit ? { portion_unit: str(y.portion_unit, 20) } : {}), ...(hist.length ? { label_hist: hist } : {}) },
    has_stock: !!d.has_stock, stock: Array.isArray(d.stock) ? d.stock.slice(0, 10) : [], lines, steps, notes: str(d.notes, 4000) }
}

export async function mreSaveDraft(u: U, b: any, svc: any) {
  chef(u)
  const id = String(b?.id || ''); if (!isUuid(id)) throw bad('bad_id')
  const doc = cleanDoc(id, b?.doc)
  return await lab(async tx => {
    let [r] = await tx`select current_version from mre.recipes where id = ${id} for update`
    if (!r) {                                  // R1.13: the first draft of an official recipe links it (same row as "Edit" made before)
      const off = await readOfficial(svc, [id], tx)
      if (!off.docs[id]) throw new MreError(404, 'not_found')
      await tx`insert into mre.recipes (id, pilot, current_version, source, diffs) values (${id}, false, 0, ${sql.json({ link: 'official', on_demand: true, requested_by: u.id, at: off.read_at } as any)}, ${sql.json(off.diffs[id] || [])})`
      await audit(tx, u, 'link_official', id, { at: off.read_at });
      [r] = await tx`select current_version from mre.recipes where id = ${id} for update`
    }
    if (b?.base != null && Number(b.base) !== r.current_version) throw new MreError(409, 'versione_cambiata')
    // every link must point to an existing ingredient (public.ingredients, via the read-only helper) or an existing recipe
    const ingIds: string[] = doc.lines.filter((l: any) => l.kind === 'ingredient').map((l: any) => l.ref), recIds: string[] = doc.lines.filter((l: any) => l.kind === 'recipe').map((l: any) => l.ref)
    const [{ f }] = await tx`select mre.ingredient_facts(string_to_array(${(ingIds as string[]).join(',')}, ',')::uuid[]) as f`
    if (ingIds.some((x: string) => !(f || {})[x])) throw bad('ingrediente_sconosciuto')
    for (const l of doc.lines) l.unit = E.standardUnit(l.unit)   // MR-05: spoken units (once, chili, cucchiaio…) → standard; nothing else changes
    const t = await tree(tx, svc, doc, true)
    if (recIds.some((x: string) => !t.docs[x])) throw bad('sotto_ricetta_sconosciuta')
    const errs = E.validate(doc, ctxOf(t, true), false)
    if (errs.length) throw bad('non_valida:' + errs.join(','))
    const [dr] = await tx`select version from mre.versions where recipe_id = ${id} and state = 'bozza'`
    const [mx] = await tx`select coalesce(max(version), 0)::int as v from mre.versions where recipe_id = ${id}`
    if (dr) await tx`update mre.versions set doc = ${sql.json(doc as any)}, created_at = now(), created_by = ${u.id} where recipe_id = ${id} and version = ${dr.version}`
    else await tx`insert into mre.versions (recipe_id, version, state, doc, created_by) values (${id}, ${mx.v + 1}, 'bozza', ${sql.json(doc as any)}, ${u.id})`
    await audit(tx, u, 'save_draft', id, { lines: doc.lines.length })
    return { ok: true, draft_version: dr ? dr.version : mx.v + 1, cost: E.cost(id, 1, ctxOf(t, true)) }
  })
}

export async function mreDiscard(u: U, b: any) {
  chef(u)
  const id = String(b?.id || ''); if (!isUuid(id)) throw bad('bad_id')
  return await lab(async tx => { await tx`delete from mre.versions where recipe_id = ${id} and state = 'bozza'`; await audit(tx, u, 'discard_draft', id, {}); return { ok: true } })
}

/* ---------------- MR-04 «Pubblica ricetta per ricetta» (Chef GO 22/10/2026: built in the LAB; installation = separate GO) ----------------
   Preview (writes nothing): what would change in Brigade, food cost before/after (engine + FC05), what 1 portion sold and 1 lot
   produced would deduct before/after, refusals and warnings. Publish: the Chef confirms THAT preview (fingerprint of the official
   rows + fingerprint of the plan); one database step writes it with a backup; the rows are read back and must say what was approved,
   and FC05 must move like the engine — otherwise everything is undone in the same transaction. Restore: one step back, exact. */
const hex = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))).map(x => x.toString(16).padStart(2, '0')).join('').slice(0, 16)
/** MR-12: the official rows of a recipe that does not exist yet (what Brigade holds right after publish_create inserts the title). */
function emptyOfficial(id: string, title: string) {
  return { r: { id, title: String(title || '').trim(), category: null, yield_text: null, base_weight: null, weight_unit: 'kg', base_servings: null, base_weight_g: null,
    serving_weight_g: null, serving_qty: null, serving_unit: null, procedure: null, procedure_en: null, procedure_es: null, ingredients: [] }, rows: [], stepRows: [], prepRows: [], y: {} }
}
/** MR-12: is this name already a recipe in Brigade (same letters, any case)? */
async function titleTaken(svc: any, title: string) {
  const t = String(title || '').trim(); if (!t) return false
  const rs = must(await svc.from('recipes').select('id,title').ilike('title', '%' + t.replace(/[\\%_]/g, m => '\\' + m) + '%')) as any[]
  return rs.some(r => String(r.title || '').trim().toLowerCase() === t.toLowerCase())
}
const fcLot = (bd: any) => bd && bd.semaforo && bd.semaforo.costo_noto != null ? Number(bd.semaforo.costo_noto) : null
async function publishContext(id: string, svc: any) {
  const st = await lab(async tx => {
    const [r] = await tx`select source, is_test from mre.recipes where id = ${id}`
    const [dr] = await tx`select version, doc, created_at from mre.versions where recipe_id = ${id} and state = 'bozza'`
    return { r, dr }
  })
  if (!st.r || !st.dr) throw bad('nessuna_bozza')
  if (st.r.is_test) throw bad('solo_laboratorio')
  const isNew = !!(st.r.source && st.r.source.lab_only)                  // MR-12: a lab proposal → a NEW recipe in Brigade
  const review = st.r.source && st.r.source.review
  if (!review || new Date(review.at).getTime() < new Date(st.dr.created_at).getTime()) throw new MreError(409, 'serve_verificata')
  const doc = Object.assign({}, st.dr.doc, { id })
  const off: any = isNew ? { raw: { [id]: emptyOfficial(id, doc.title) }, byId: {}, docs: {} } : await readOfficial(svc, [id])
  const raw = off.raw[id]; if (!raw) throw new MreError(404, 'not_found')
  if (isNew) off.docs[id] = Object.assign(buildLabDoc({ id, ...raw, byId: {} }).doc, { id, _source: 'official' })
  const subIds = [...new Set((doc.lines || []).filter((l: any) => l.kind === 'recipe' && !off.byId[l.ref]).map((l: any) => l.ref))] as string[]
  const more = subIds.length ? await readOfficial(svc, subIds) : { byId: {} }
  const byId = Object.assign({}, more.byId, off.byId)
  return await lab(async tx => {
    const tBefore = await tree(tx, svc, off.docs[id], false), tAfter = await tree(tx, svc, doc, false)
    const facts = Object.assign({}, tBefore.facts, tAfter.facts)
    const plan = P.planPublish({ id, doc, off: raw, facts, byId })
    // a sub-recipe that is not in Brigade (a lab proposal) cannot be written as a BOM row
    for (const l of doc.lines || []) if (l.kind === 'recipe' && !byId[l.ref]) (plan.refusals as any[]).push({ code: 'sottoricetta_non_in_brigade', line: l.id, msg: `${(tAfter.docs[l.ref] || {}).title || l.ref}: questa sottoricetta non è ancora in Brigade (pubblicala prima)` })
    if (isNew) {
      plan.summary.unshift(`Ricetta NUOVA in Brigade: «${String(doc.title || '').trim()}»`)
      if (String(doc.title || '').trim().length < 2) plan.refusals.push({ code: 'titolo_mancante', msg: 'Manca il nome della ricetta' })
      if (!(doc.lines || []).length) plan.refusals.push({ code: 'nessuna_riga', msg: 'La ricetta non ha ingredienti' })
      if (await titleTaken(svc, doc.title)) plan.refusals.push({ code: 'titolo_esistente', msg: `In Brigade c'è già una ricetta che si chiama «${String(doc.title).trim()}»` })
      plan.warnings.push({ code: 'campi_ufficio_dopo', msg: 'Gruppo menu, nome POS, prezzo di vendita, durata e foto si mettono dopo in Brigade 1 (campi ufficio)' })
      if (st.r.source.kind === 'prep') plan.warnings.push({ code: 'prep_da_collegare', msg: 'È una preparazione: per vederla fra le prep, collegala a una prep in Brigade 1 (Ufficio)' })
      plan.ok = plan.refusals.length === 0; plan.empty = false
    } else plan.ok = plan.ok && plan.refusals.length === 0
    const [{ fp }] = isNew ? [{ fp: 'nuova:' + id }] : await tx`select mre.official_fp(${id}) as fp`
    const [{ fc }] = isNew ? [{ fc: null }] : await tx`select mre.official_fc05(${id}) as fc`
    const cb = E.cost(id, 1, ctxOf(tBefore)), ca = E.cost(id, 1, ctxOf(tAfter))
    // MR-05: FC05 does not know «1 ml = 1 g» yet: the check after writing compares FC05 with the engine's STRICT reading
    // CD-078: and FC05 counts only invoice prices — the Chef's trust price never enters the check (a missing price never blocks)
    const strict = (t: any) => Object.assign(ctxOf(t), { strictDensity: true, invoiceOnly: true })
    const sb = E.cost(id, 1, strict(tBefore)), sa = E.cost(id, 1, strict(tAfter))
    const conseq = E.consequences(id, ctxOf(tBefore), ctxOf(tAfter))
    // CD-078 (Chef 22/10): a missing price NEVER blocks the publication — it is only flagged, and completed later (invoice or trust price)
    if (ca.missing > 0) plan.warnings.push({ code: 'food_cost_parziale', msg: `Food cost parziale: ${ca.missing} ${ca.missing === 1 ? 'riga' : 'righe'} senza prezzo. Si pubblica lo stesso; il prezzo si completa dopo, con una fattura o con il prezzo di fiducia` })
    return { isNew, doc, raw, byId, facts, plan, fp, fc05: fc, cost: { before: cb, after: ca }, strictCost: { before: sb, after: sa }, conseq, draftVersion: st.dr.version, planHash: await hex(JSON.stringify(plan.changes)) }
  })
}
export async function mrePublishPreview(u: U, b: any, svc: any) {
  chef(u)
  const id = String(b?.id || ''); if (!isUuid(id)) throw bad('bad_id')
  if (!publishOn()) throw new MreError(423, LOCK)
  const c = await publishContext(id, svc)
  const cs = (x: any) => ({ food: x.food, pack: x.pack, per_portion: x.per_portion, state: x.state, missing: x.missing })
  return { ok: c.plan.ok, empty: c.plan.empty, refusals: c.plan.refusals, warnings: c.plan.warnings, summary: c.plan.summary,
    cost: { before: cs(c.cost.before), after: cs(c.cost.after) }, fc05_before: fcLot(c.fc05), consequences: c.conseq,
    impronta: c.fp, piano: c.planHash, draft_version: c.draftVersion }
}
export async function mrePublish(u: U, b: any, svc?: any) {
  chef(u)
  const id = String(b?.id || ''); if (!isUuid(id)) throw bad('bad_id')
  const reason = String(b?.reason || '').trim().slice(0, 500) || null
  if (publishOn() && svc) {
    const isTest = await lab(async tx => { const [r] = await tx`select is_test from mre.recipes where id = ${id}`; return !!(r && r.is_test) })
    if (!isTest) return await publishOfficial(u, id, b, reason, svc)
  }
  // STEP A: the official recipes are the only source and are NOT written from here. Only the lab test example can be "published".
  // The refusal is written to the lab register in its own transaction (it must survive the refusal).
  const locked = await lab(async tx => { const [r] = await tx`select is_test from mre.recipes where id = ${id}`; if (!r) throw new MreError(404, 'not_found'); if (r.is_test) return false; await audit(tx, u, 'publish_refused', id, { reason: LOCK }); return true })
  if (locked) throw new MreError(423, LOCK)
  return await lab(async tx => {
    const [r] = await tx`select current_version, is_test, jsonb_array_length(diffs) as nd, diffs_checked_at from mre.recipes where id = ${id} for update`
    if (!r || !r.is_test) throw new MreError(423, LOCK)
    if (b?.base != null && Number(b.base) !== r.current_version) throw new MreError(409, 'versione_cambiata')
    const [dr] = await tx`select version, doc from mre.versions where recipe_id = ${id} and state = 'bozza'`
    if (!dr) throw bad('nessuna_bozza')
    await tx`update mre.versions set state = 'pubblicata', published_by = ${u.id}, published_at = now(), reason = ${reason} where recipe_id = ${id} and version = ${dr.version} and state = 'bozza'`
    await tx`update mre.recipes set current_version = ${dr.version} where id = ${id}`
    await audit(tx, u, 'publish', id, { version: dr.version, reason })
    return { ok: true, version: dr.version }
  })
}

async function publishOfficial(u: U, id: string, b: any, reason: string | null, svc: any) {
  const c = await publishContext(id, svc)
  if (c.plan.empty) throw bad('niente_da_pubblicare')
  if (!c.plan.ok) throw new MreError(409, 'non_pubblicabile')
  if (String(b?.impronta || '') !== c.fp) throw new MreError(409, 'ricetta_cambiata')          // Brigade changed after the preview
  if (String(b?.piano || '') !== c.planHash) throw new MreError(409, 'piano_cambiato')         // the draft changed after the preview
  try {
    return await lab(async tx => {
      const [{ w }] = c.isNew
        ? await tx`select mre.publish_create(${id}, ${String(c.doc.title || '').trim()}, ${sql.json(c.plan as any)}, ${u.id}, ${c.draftVersion}) as w`
        : await tx`select mre.publish_write(${id}, ${c.fp}, ${sql.json(c.plan as any)}, ${u.id}, ${c.draftVersion}) as w`
      // read back what Brigade now holds and check it says what the Chef approved (same converter the app, bots' rules, FC05)
      const f = (x: string) => c.facts[x] || {}
      const rows = (w.after.bom as any[]).map(x => Object.assign({}, x, { ing_name: x.item_id ? f(x.item_id).name ?? null : null, policy: x.item_id ? f(x.item_id).policy ?? null : null }))
        .sort((a, b) => (a.sort_order ?? 1e9) - (b.sort_order ?? 1e9) || a.bom_id - b.bom_id)
      const diff = P.verifyPublished({ id, doc: c.doc, offAfter: { r: w.after.r, rows, stepRows: w.after.steps, prepRows: c.raw.prepRows, y: w.yield || {} }, facts: c.facts, byId: c.byId })
      const fb = c.isNew ? 0 : fcLot(c.fc05), fa = fcLot(w.fc05)          // a new recipe: FC05 had nothing before
      const eb = c.strictCost.before.food + c.strictCost.before.pack, ea = c.strictCost.after.food + c.strictCost.after.pack
      const fcOk = fb == null || fa == null ? fb == null && fa == null : Math.abs((fa - fb) - (ea - eb)) <= Math.max(0.01, 0.005 * Math.max(Math.abs(fa), 1))
      const checks = { rilettura: diff, fc05: { before: fb, after: fa }, motore: { before: eb, after: ea }, fc05_ok: fcOk }
      if (diff.length) throw new MreError(500, 'rilettura_diversa')          // same transaction: nothing stays written
      if (!fcOk) throw new MreError(500, 'controllo_fc05')
      await tx`update mre.publications set checks = ${sql.json(checks as any)} where id = ${w.publication}`
      const v = await tx`update mre.versions set state = 'pubblicata', published_by = ${u.id}, published_at = now(), reason = ${reason} where recipe_id = ${id} and version = ${c.draftVersion} and state = 'bozza' returning version`
      if (v.length !== 1) throw new MreError(409, 'bozza_cambiata')
      await tx`update mre.recipes set current_version = ${c.draftVersion} where id = ${id}`
      if (c.isNew) await tx`update mre.recipes set source = (source - 'lab_only') || ${sql.json({ link: 'official', creata_da_pubblica: w.publication } as any)} where id = ${id}`
      await audit(tx, u, c.isNew ? 'publish_created' : 'publish_official', id, { publication: w.publication, version: c.draftVersion, summary: c.plan.summary, warnings: c.plan.warnings, checks })
      return { ok: true, publication: w.publication, version: c.draftVersion, summary: c.plan.summary, checks }
    })
  } catch (e: any) {
    await lab(async tx => audit(tx, u, 'publish_failed', id, { code: e.code || String(e.message || e).slice(0, 200) })).catch(() => {})
    const m = String(e.message || ''), k = /mr(?:04|12):([a-z_]+)/.exec(m)
    if (k) throw new MreError(409, k[1])
    throw e
  }
}
/** MR-12: the Chef starts a NEW recipe in Recipe Master: an empty lab draft (not in Brigade until «Pubblica in Brigade come ricetta nuova»). */
export async function mreNew(u: U, b: any, svc: any) {
  chef(u)
  const title = String(b?.title || '').trim().slice(0, 200); if (title.length < 2) throw bad('titolo_mancante')
  if (await titleTaken(svc, title)) throw new MreError(409, 'titolo_esistente')
  const id = crypto.randomUUID(), kind = b?.prep ? 'prep' : 'menu'
  const doc = { schema: 1, id, title, category: null, yield: {}, has_stock: false, stock: [], lines: [], steps: [], notes: '' }
  return await lab(async tx => {
    await tx`insert into mre.recipes (id, pilot, current_version, source, diffs) values (${id}, false, 0, ${sql.json({ lab_only: true, kind, proposta_da: 'Chef', per: 'Max' } as any)}, ${sql.json([])})`
    await tx`insert into mre.versions (recipe_id, version, state, doc, reason, created_by) values (${id}, 1, 'bozza', ${sql.json(cleanDoc(id, doc) as any)}, ${'Ricetta nuova dello Chef'}, ${u.id})`
    await audit(tx, u, 'new_recipe', id, { title, kind })
    return { ok: true, id, title }
  })
}
export async function mrePublications(u: U, b: any) {
  chef(u)
  const id = String(b?.id || ''); if (!isUuid(id)) throw bad('bad_id')
  if (!publishOn()) return { items: [] }
  return await lab(async tx => ({ items: await tx`select id, at, by_user, draft_version, restored_at, restored_by, created, plan->'summary' as summary, checks from mre.publications where recipe_id = ${id} order by at desc limit 20` }))
}
export async function mreRestoreOfficial(u: U, b: any) {
  chef(u)
  if (!publishOn()) throw new MreError(423, LOCK)
  const pub = Number(b?.publication); if (!Number.isInteger(pub) || pub <= 0) throw bad('bad_args')
  try {
    return await lab(async tx => {
      const [pr] = await tx`select created from mre.publications where id = ${pub}`
      if (pr && pr.created) {                                              // MR-12: a recipe created by «Pubblica» is WITHDRAWN (only if nothing uses it)
        const [{ r }] = await tx`select mre.publish_withdraw(${pub}, ${u.id}) as r`
        await tx`update mre.recipes set source = (source - 'link' - 'creata_da_pubblica') || ${sql.json({ lab_only: true, ritirata: pub } as any)}, current_version = 0 where id = ${r.recipe}`
        await audit(tx, u, 'withdraw_created', r.recipe, { publication: pub })
        return { ok: true, recipe: r.recipe, publication: pub, withdrawn: true }
      }
      const [{ r }] = await tx`select mre.publish_restore(${pub}, ${u.id}) as r`
      const [p] = await tx`select coalesce(max(draft_version), 0)::int as v from mre.publications where recipe_id = ${r.recipe} and restored_at is null`
      await tx`update mre.recipes set current_version = ${p.v} where id = ${r.recipe}`
      await audit(tx, u, 'restore_official', r.recipe, { publication: pub })
      return { ok: true, recipe: r.recipe, publication: pub }
    })
  } catch (e: any) { const k = /mr(?:04|12):([a-z_]+)/.exec(String(e.message || '')); if (k) throw new MreError(409, k[1]); throw e }
}

/** An old version from the history becomes the DRAFT again (step A: never a recipe in use). The test example keeps the old restore. */
export async function mreRestore(u: U, b: any) {
  chef(u)
  const id = String(b?.id || ''); const v = Number(b?.version); if (!isUuid(id) || !Number.isInteger(v)) throw bad('bad_args')
  return await lab(async tx => {
    const [r] = await tx`select current_version, is_test from mre.recipes where id = ${id} for update`
    if (!r) throw new MreError(404, 'not_found')
    if ((await tx`select 1 from mre.versions where recipe_id = ${id} and state = 'bozza'`).length) throw bad('bozza_aperta')
    const [old] = await tx`select doc from mre.versions where recipe_id = ${id} and version = ${v} and state <> 'bozza'`
    if (!old) throw bad('versione_sconosciuta')
    const [mx] = await tx`select coalesce(max(version), 0)::int as v from mre.versions where recipe_id = ${id}`, nv = mx.v + 1
    if (!r.is_test) {
      await tx`insert into mre.versions (recipe_id, version, state, doc, reason, created_by) values (${id}, ${nv}, 'bozza', ${sql.json(old.doc)}, ${'Bozza ripresa dalla v' + v}, ${u.id})`
      await audit(tx, u, 'restore_as_draft', id, { from: v, to: nv })
      return { ok: true, version: nv, draft: true }
    }
    await tx`insert into mre.versions (recipe_id, version, state, doc, reason, created_by, published_by, published_at) values (${id}, ${nv}, 'pubblicata', ${sql.json(old.doc)}, ${'Ripristino della v' + v}, ${u.id}, ${u.id}, now())`
    await tx`update mre.recipes set current_version = ${nv} where id = ${id}`
    await audit(tx, u, 'restore', id, { from: v, to: nv })
    return { ok: true, version: nv }
  })
}

export async function mreCheckDiffs(u: U, b: any) {
  chef(u)
  const id = String(b?.id || ''); if (!isUuid(id)) throw bad('bad_id')
  return await lab(async tx => { await tx`update mre.recipes set diffs_checked_by = ${u.id}, diffs_checked_at = now() where id = ${id}`; await audit(tx, u, 'diffs_checked', id, {}); return { ok: true } })
}

/* ---------------- everyone: production, suggestions ---------------- */
export async function mreProduction(u: U, b: any) {
  const id = String(b?.id || ''); if (!isUuid(id)) throw bad('bad_id')
  const f = Number(b?.factor); if (!(f > 0 && f < 1000)) throw bad('bad_factor')
  const n = (x: any) => x == null || x === '' ? null : (isFinite(Number(x)) && Number(x) >= 0 && Number(x) < 1e7 ? Math.round(Number(x) * 1000) / 1000 : (() => { throw bad('bad_number') })())
  const changed = (Array.isArray(b?.changed) ? b.changed : []).slice(0, 100).map((c: any) => ({ line: String(c.line || '').slice(0, 40), name: String(c.name || '').slice(0, 120), planned: n(c.planned), real: n(c.real), unit: String(c.unit || '').slice(0, 12) }))
  const key = isUuid(b?.client_key) ? b.client_key : null
  return await lab(async tx => {
    const [r] = await tx`select current_version from mre.recipes where id = ${id}`
    if (!r) throw new MreError(404, 'not_found')
    const v = Number.isInteger(Number(b?.version)) ? Number(b.version) : r.current_version
    if (!(await tx`select 1 from mre.versions where recipe_id = ${id} and version = ${v}`).length) throw new MreError(409, 'produzione_solo_simulata')   // step A: no stock, no lab copy to attach it to
    const ins = await tx`insert into mre.productions (client_key, recipe_id, version, factor, reference, yield_planned_g, yield_real_g, changed, note, user_id)
      values (${key}, ${id}, ${v}, ${f}, ${String(b?.reference || '').slice(0, 120) || null}, ${n(b?.yield_planned_g)}, ${n(b?.yield_real_g)}, ${sql.json(changed)}, ${String(b?.note || '').slice(0, 1000) || null}, ${u.id})
      on conflict (client_key) do nothing returning id, created_at`
    if (!ins.length && key) { const [x] = await tx`select id, created_at from mre.productions where client_key = ${key}`; return { ok: true, production: x, repeated: true } }
    await audit(tx, u, 'production', id, { version: v, factor: f, changed: changed.length })
    return { ok: true, production: ins[0] }
  })
}

export async function mreSuggest(u: U, b: any) {
  const id = String(b?.id || ''); if (!isUuid(id)) throw bad('bad_id')
  const text = String(b?.text || '').trim(); if (text.length < 2 || text.length > 2000) throw bad('bad_text')
  const key = isUuid(b?.client_key) ? b.client_key : null
  return await lab(async tx => {
    const [r] = await tx`select current_version from mre.recipes where id = ${id}`
    if (!r) throw new MreError(404, 'not_found')
    const ins = await tx`insert into mre.suggestions (client_key, recipe_id, version, user_id, text) values (${key}, ${id}, ${Number.isInteger(Number(b?.version)) ? Number(b.version) : r.current_version}, ${u.id}, ${text}) on conflict (client_key) do nothing returning id, created_at`
    if (ins.length) await audit(tx, u, 'suggest', id, { len: text.length })
    return { ok: true, suggestion: ins[0] || null, repeated: !ins.length }
  })
}

export async function mreDecide(u: U, b: any) {
  chef(u)
  const sid = String(b?.suggestion_id || ''); if (!isUuid(sid)) throw bad('bad_id')
  const st = String(b?.status || ''); if (!['approvato', 'rifiutato', 'in sospeso', 'in attesa'].includes(st)) throw bad('bad_status')
  return await lab(async tx => {
    const up = await tx`update mre.suggestions set status = ${st}, decided_by = ${u.id}, decided_at = now(), chef_note = ${String(b?.note || '').slice(0, 500) || null} where id = ${sid} returning recipe_id`
    if (!up.length) throw new MreError(404, 'not_found')
    await audit(tx, u, 'decide', up[0].recipe_id, { suggestion: sid, status: st })   // approving NEVER changes the recipe
    return { ok: true }
  })
}

/** Knowledge Engine (B-51): live facts (FC05 price, approved conversions, policy) of some ingredients — read only,
 *  same helper the lab already uses, under role mre_app (no right on any Brigade table). */
export async function ingredientFacts(ids: string[]) {
  const ok = ids.filter(isUuid)
  if (!ok.length) return {}
  return lab(async (tx: any) => { const [{ f }] = await tx`select mre.ingredient_facts(string_to_array(${ok.join(',')}, ',')::uuid[]) as f`; return f || {} })
}

/* ---------------- R1.15 (Chef GO 21/10): suggested purchase match ----------------
   Read only on Brigade (every invoice line, vendor sheets, aliases, ingredient names); the Chef's decisions are kept in the lab
   (mre.match_decisions). "Link to the draft" changes ONLY the lab draft of the recipe it was opened from. */
let PMC: { at: number; data: any } | null = null
async function pageAllRows(q: () => any, size = 1000) { const out: any[] = []; for (let from = 0; ; from += size) { const r = must(await q().range(from, from + size - 1)); out.push(...r); if (r.length < size) break } return out }
async function matchData(svc: any) {
  if (PMC && Date.now() - PMC.at < 10 * 60000) return PMC.data
  const [inv, ing, vend, alias, bom] = await Promise.all([
    pageAllRows(() => svc.from('invoice_lines').select('id,invoice_date,vendor,raw_description,vendor_sku,ingredient_id,qty,purchase_unit,pack_description,unit_price,line_total,invoice_number').order('id')),
    pageAllRows(() => svc.from('ingredients').select('id,name,name_it,base_unit,category,active').order('id')),
    pageAllRows(() => svc.from('ingredient_vendors').select('ingredient_id,vendor,vendor_sku,pack_description,purchase_unit,unit_price,last_invoice_date,active').order('id')),
    pageAllRows(() => svc.from('vendor_item_aliases').select('ingredient_id,vendor,vendor_sku,vendor_description,confirmed_by,active').order('ingredient_id')),
    pageAllRows(() => svc.from('recipe_bom').select('item_id,unit,parent_recipe_id').not('item_id', 'is', null).order('bom_id')),
  ]) as any[][]
  const data = {
    inv: inv.map(l => ({ id: l.id, d: l.invoice_date, v: l.vendor, desc: l.raw_description, sku: l.vendor_sku, ing: l.ingredient_id, qty: l.qty, pu: l.purchase_unit, pack: l.pack_description, up: l.unit_price, tot: l.line_total, num: l.invoice_number })),
    ing: ing.map(i => ({ id: i.id, name: i.name, name_it: i.name_it, base: i.base_unit, cat: i.category, active: i.active })),
    vend: vend.filter(v => v.active !== false).map(v => ({ ing: v.ingredient_id, v: v.vendor, sku: v.vendor_sku, pack: v.pack_description, pu: v.purchase_unit, up: v.unit_price, last: v.last_invoice_date })),
    alias: alias.filter(a => a.active !== false).map(a => ({ ing: a.ingredient_id, v: a.vendor, sku: a.vendor_sku, desc: a.vendor_description, by: a.confirmed_by })),
    bomu: bom.map(b => ({ ing: b.item_id, u: b.unit, r: b.parent_recipe_id })),
  }
  PMC = { at: Date.now(), data }; return data
}
async function decisionsOf(tx: any, id: string) {
  return await tx`select candidate_key as key, decision, target_ingredient_id as target, candidate, recipe_id, line_id, source, decided_by, decided_at from mre.match_decisions where ingredient_id = ${id}`
}
export async function mrePurchaseMatch(u: U, b: any, svc: any) {
  chef(u)
  const id = String(b?.id || ''); if (!isUuid(id)) throw bad('bad_id')
  const data = await matchData(svc)
  return await lab(async tx => {
    const [{ f }] = await tx`select mre.ingredient_facts(array[${id}]::uuid[]) as f`
    const need = PM.needsMatch(id, data, (f || {})[id], new Date().toISOString())
    const dec = await decisionsOf(tx, id)
    const r = PM.matchCandidates(id, data, dec, { more: !!b?.more })
    return { need: need.need, why: need.why, candidates: r.candidates, rejected: r.rejected, use: r.use, decisions: dec.map((x: any) => ({ key: x.key, decision: x.decision, target: x.target, source: x.source, at: x.decided_at, recipe_id: x.recipe_id })) }
  })
}
export async function mreMatchDecide(u: U, b: any, svc: any) {
  chef(u)
  const id = String(b?.id || ''), key = String(b?.key || '').slice(0, 400), decision = String(b?.decision || '')
  if (!isUuid(id) || !key) throw bad('bad_args')
  if (!['collega', 'non_corrisponde'].includes(decision)) throw bad('bad_decision')
  const data = await matchData(svc)
  const r = PM.matchCandidates(id, data, [], { more: true }), c = r.candidates.find((x: any) => x.key === key)
  if (!c) throw new MreError(404, 'candidato_sconosciuto')
  let saved: any = null
  if (decision === 'collega') {
    // only into the lab draft of the recipe it was opened from, on the line that uses this ingredient
    const rid = String(b?.recipe_id || ''), lid = String(b?.line_id || '')
    if (!isUuid(rid) || !lid) throw bad('serve_ricetta')
    if (!c.target) throw bad('articolo_senza_ingrediente')              // a purchase not yet in Brigade: creating the article needs a GO
    const o = await mreRecipe(u, rid, svc)
    const base = JSON.parse(JSON.stringify(o.draft || o.doc)), ln = (base.lines || []).find((l: any) => l.id === lid)
    if (!ln || ln.kind !== 'ingredient' || ln.ref !== id) throw bad('riga_non_trovata')
    // the same cost rule as before: what Brigade treats as packaging (non-food) stays packaging, outside the food cost
    const pol = await lab<any>(async tx => { const [{ f }] = await tx`select mre.ingredient_facts(array[${id}]::uuid[]) as f`; return ((f || {})[id] || {}).policy || null })
    if (pol === 'non_food') ln.role = 'imballo'
    ln.ref = c.target.id
    ln.note = [ln.note && !/·\s*(Ben E\. Keith|Chef's Warehouse)/.test(ln.note) ? ln.note : null, `${c.vendor}${c.sku ? ' ' + c.sku : ''} · ${c.description}`].filter(Boolean).join(' · ').slice(0, 300)
    saved = await mreSaveDraft(u, { id: rid, doc: base, base: o.recipe.current_version }, svc)
  }
  await lab(async tx => {
    await tx`insert into mre.match_decisions (ingredient_id, candidate_key, decision, target_ingredient_id, candidate, recipe_id, line_id, source, decided_by)
      values (${id}, ${key}, ${decision}, ${c.target ? c.target.id : null}, ${sql.json(c as any)}, ${decision === 'collega' ? b.recipe_id : null}, ${decision === 'collega' ? b.line_id : null}, 'chef_app', ${u.id})
      on conflict (ingredient_id, candidate_key) do update set decision = excluded.decision, target_ingredient_id = excluded.target_ingredient_id, candidate = excluded.candidate,
        recipe_id = excluded.recipe_id, line_id = excluded.line_id, source = excluded.source, decided_by = excluded.decided_by, decided_at = now()`
    await audit(tx, u, 'match_' + decision, decision === 'collega' ? b.recipe_id : null, { ingredient: id, key, target: c.target ? c.target.id : null })
  })
  return { ok: true, decision, draft_version: saved ? saved.draft_version : null, target: c.target }
}

/* ---------------- R1.17 (Chef 21/10 "UNA RICETTA, UN NUMERO, TRE LINGUE"): translations of the steps ----------------
   The Chef writes a step once, in any language. The app asks for the missing languages in the background; the server translates
   through Brigade's existing translation service (ai-translate: Google Translate, model fallback). Structured numbers ({{line}},
   {{y:portion_g}}) are protected before translating and checked after: a translation that loses or changes a number is returned
   marked 'check', never silently. Nothing is saved here: the app stores the result in the draft (same background save). */
const TR_URL = () => Deno.env.get('MRE_TRANSLATE_URL') ?? ((Deno.env.get('SUPABASE_URL') ?? '') + '/functions/v1/ai-translate')
const TR_BEARER = () => Deno.env.get('MRE_TRANSLATE_BEARER') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
async function trCall(body: any) {
  if (Deno.env.get('MRE_TRANSLATE_STUB') === '1') {             // bench only: a deterministic fake translator ("[en] text"), never used in production
    if (body.targetLang === '__detect__') return { detected: E.langOf(body.text).lang }
    return { translated: `[${body.targetLang}] ${body.text}` }
  }
  const r = await fetch(TR_URL(), { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + TR_BEARER() }, body: JSON.stringify(body) })
  if (!r.ok) throw new MreError(502, 'traduzione_non_disponibile')
  return await r.json()
}
export async function mreTranslate(u: U, b: any) {
  chef(u)
  const items = (Array.isArray(b?.items) ? b.items : []).slice(0, 20)
  const out = []
  for (const it of items) {
    const text = String(it?.text || '').slice(0, 4000); if (!text.trim()) continue
    let from = ['it', 'en', 'es'].includes(it.from) ? it.from : null, sure = !!from
    if (!from) { const g = E.langOf(text); from = g.lang; sure = g.sure
      if (!sure) { try { const d = await trCall({ text: text.replace(/\{\{[^}]*\}\}/g, ''), targetLang: '__detect__' }); if (['it', 'en', 'es'].includes(d?.detected)) { from = d.detected; sure = true } } catch (_) { /* keep the local guess */ } } }
    const res: any = {}
    for (const to of (Array.isArray(it.to) ? it.to : ['it', 'en', 'es']).filter((x: string) => ['it', 'en', 'es'].includes(x) && x !== from)) {
      const p = E.protectTokens(text)
      try { const j = await trCall({ text: p.text, targetLang: to, literal: true }); res[to] = E.restoreTokens(j?.translated, p.map, p.text) }
      catch (_) { res[to] = { text: null, ok: false, why: 'traduzione_non_disponibile' } }
    }
    out.push({ key: String(it.key || '').slice(0, 60), from, sure, out: res })
  }
  return { items: out }
}

/* ---------------- B-63 (Max 22/10/2026): T.E.C. scrive IN BOZZA per Max ----------------
   Ruolo «assistente» (solo queste 4 operazioni, vedi index.ts): legge, prova a secco, salva BOZZE con impronta, propone ricette nuove.
   Mai pubblicare, mai cancellare, mai prezzi. Le bozze sono quelle normali dell'Editor: nello storico risultano dell'utente «T.E.C. per Max».
   Il testo detto a voce è un DATO: diventa solo righe/quantità/passi controllati dal motore. */
import * as TB from './tec_bozza.ts'
const tecOk = (u: U) => { if ((u.role as string) !== 'assistente' && u.role !== 'chef') throw forbid() }
async function tecBase(tx: any, svc: any, id: string) {
  const off: any = await readOfficial(svc, [id], tx, true)
  // C-62: bozza della ricetta, collegamento e bozze delle sottoricette in UNA richiesta
  const subIds = off.unica ? Object.keys(off.docs).filter((k: string) => k !== id) : []
  const [st] = await tx`select (select jsonb_build_object('version', v.version, 'doc', v.doc) from mre.versions v where v.recipe_id = ${id} and v.state = 'bozza') as dr,
                               exists (select 1 from mre.recipes where id = ${id}) as linked,
                               (select coalesce(jsonb_object_agg(v.recipe_id, jsonb_build_object('version', v.version, 'doc', v.doc)), '{}'::jsonb) from mre.versions v
                                 where v.state = 'bozza' and v.recipe_id = any(string_to_array(${subIds.join(',')}, ',')::uuid[])) as sub_drafts`
  const dr = st?.dr
  let base: any = dr ? Object.assign({}, dr.doc) : off.docs[id], fonte = dr ? 'bozza' : 'ufficiale'
  if (!base) { base = (await labOnlyDocs(tx, [id]))[id]; fonte = 'proposta' }
  if (!base) throw new MreError(404, 'not_found')
  base = Object.assign({}, base); for (const k of ['_source', '_version', '_state']) delete base[k]; base.id = id
  const drafts: Record<string, any> = {}
  for (const [k, v] of Object.entries((st?.sub_drafts || {}) as Record<string, any>)) drafts[k] = Object.assign({}, v.doc, { id: k, _source: 'draft', _version: v.version })
  const pre = off.unica ? { docs: off.docs, facts: off.facts, measures: off.measures, drafts } : undefined
  return { base, fonte, linked: !!st?.linked, read_at: off.read_at, pre }
}
async function tecNomi(tx: any, svc: any, doc: any, pre?: any, withDrafts = false) {
  const t = await tree(tx, svc, doc, withDrafts, pre), nomi: Record<string, string> = {}
  for (const l of doc.lines || []) nomi[l.ref] = l.kind === 'recipe' ? (t.docs[l.ref] || {}).title || '' : (t.facts[l.ref] || {}).name || ''
  return { t, nomi }
}
async function tecNomiNuovi(tx: any, svc: any, modifiche: any[], nomi: Record<string, string>) {
  const nuovi = (modifiche || []).filter((m: any) => m && m.tipo === 'aggiungi_riga' && isUuid(m.ref) && !nomi[m.ref])
  const ing = nuovi.filter((m: any) => m.genere !== 'recipe').map((m: any) => m.ref), rec = nuovi.filter((m: any) => m.genere === 'recipe').map((m: any) => m.ref)
  if (ing.length) { const [{ f }] = await tx`select mre.ingredient_facts(string_to_array(${ing.join(',')}, ',')::uuid[]) as f`; for (const k of ing) if (f && f[k]) nomi[k] = f[k].name || k }
  if (rec.length) { const off = (await readOfficial(svc, rec, tx)).docs; for (const k of rec) if (off[k]) nomi[k] = off[k].title || k }
}
const tecVista = (doc: any, nomi: Record<string, string>) => ({
  titolo: doc.title, resa: { grammi: doc.yield?.g ?? null, porzioni: doc.yield?.portions ?? null },
  righe: (doc.lines || []).map((l: any) => ({ riga: l.id, nome: nomi[l.ref] || '', tipo: l.kind, quantita: l.qty, unita: l.unit, nota: l.note || null })),
  passi: (doc.steps || []).map((s: any, i: number) => ({ numero: i + 1, testo: E.stepIn(s, 'it').text })) })

export async function tecLeggi(u: U, b: any, svc: any) {
  tecOk(u); const id = String(b?.id || ''); if (!isUuid(id)) throw bad('bad_id')
  return await lab(async tx => { const { base, fonte, pre } = await tecBase(tx, svc, id); const { nomi } = await tecNomi(tx, svc, base, pre)
    return { ok: true, ricetta_id: id, fonte, impronta: await TB.impronta(base), ...tecVista(base, nomi) } })
}
async function tecApplica(tx: any, svc: any, u: U, b: any) {
  const id = String(b?.id || ''); if (!isUuid(id)) throw bad('bad_id')
  const { base, fonte, pre } = await tecBase(tx, svc, id)
  const imp = await TB.impronta(base)
  // C-62: UN solo albero (con le bozze) per i nomi e per il controllo, costruito da quello che è già stato letto
  const { t, nomi } = await tecNomi(tx, svc, base, pre, true)
  await tecNomiNuovi(tx, svc, b?.modifiche, nomi)
  const mods = TB.risolviNomi(base, b?.modifiche, nomi)          // C-62: «nome» al posto di «riga» (una chiamata sola)
  const r = TB.applica(base, mods.modifiche, nomi)
  r.errori.unshift(...mods.errori)
  // MR-05 (Chef 22/10): «2 once di rum» → 2 oz (the standard unit, a weight); nothing else changes
  for (const l of r.doc.lines || []) { const nu = E.standardUnit(l.unit); if (nu !== l.unit) { r.avvisi.push(`${nomi[l.ref] || ''}: ${l.unit} → ${nu}`); l.unit = nu } }
  if (!r.errori.length) {
    const nuovi = (r.doc.lines || []).some((l: any) => l.kind === 'recipe' && !t.docs[l.ref]) || (r.doc.lines || []).some((l: any) => l.kind !== 'recipe' && !(l.ref in t.facts))
    const t2 = nuovi ? await tree(tx, svc, r.doc, true, pre) : Object.assign({}, t, { docs: Object.assign({}, t.docs, { [r.doc.id]: r.doc }) })
    for (const e of E.validate(r.doc, ctxOf(t2, true), false)) r.errori.push('ricetta_non_valida: ' + e)
  }
  return { id, base, fonte, imp, nomi, r, t }
}
export async function tecProva(u: U, b: any, svc: any) {
  tecOk(u)
  const t0 = performance.now()
  return await lab(async tx => { const x = await tecApplica(tx, svc, u, b)
    return { ok: x.r.errori.length === 0, a_secco: true, ricetta_id: x.id, fonte: x.fonte, impronta: x.imp,
      impronta_cambiata: b?.impronta != null && b.impronta !== x.imp, frasi: x.r.frasi, avvisi: x.r.avvisi, errori: x.r.errori,
      ricetta: tecVista(x.base, x.nomi), ms_server: Math.round(performance.now() - t0) } })
}
export async function tecSalvaBozza(u: U, b: any, svc: any) {
  tecOk(u)
  if (!b?.impronta) throw bad('impronta_mancante')
  // 1) prova e traduzioni FUORI dalla transazione di scrittura (la rete può essere lenta)
  const pre = await lab(async tx => tecApplica(tx, svc, u, b))
  if (pre.imp !== b.impronta) throw new MreError(409, 'impronta_cambiata')
  if (pre.r.errori.length) throw bad('non_valida: ' + pre.r.errori.join(' | '))
  const doc = pre.r.doc, avvisi = [...pre.r.avvisi]
  for (const i of pre.r.passi_da_tradurre) {
    const st = doc.steps[i], from = st.src, text = st[from]
    for (const to of ['it', 'en', 'es'].filter(x => x !== from)) {
      const p = E.protectTokens(text)
      try { const j = await trCall({ text: p.text, targetLang: to, literal: true }); const o = E.restoreTokens(j?.translated, p.map, p.text)
        if (o.ok && o.text) { st[to] = o.text; st.tr[to] = 'auto' } else avvisi.push(`passo ${i + 1}: traduzione ${to} da rifare (${o.why})`) }
      catch (_) { avvisi.push(`passo ${i + 1}: traduzione ${to} non disponibile, da fare nell'Editor`) }
    }
  }
  const clean = cleanDoc(pre.id, doc)
  // 2) scrittura: stessa strada di mre_save_draft (bozza unica, registro), con l'impronta ricontrollata DENTRO la transazione
  return await lab(async tx => {
    const [rr] = await tx`select current_version from mre.recipes where id = ${pre.id} for update`
    const { base } = await tecBase(tx, svc, pre.id)
    if ((await TB.impronta(base)) !== b.impronta) throw new MreError(409, 'impronta_cambiata')
    if (!rr) {
      await tx`insert into mre.recipes (id, pilot, current_version, source, diffs) values (${pre.id}, false, 0, ${sql.json({ link: 'official', on_demand: true, requested_by: u.id } as any)}, ${sql.json([])})`
      await audit(tx, u, 'link_official', pre.id, { da: 'T.E.C.', per: 'Max' })
    }
    const [dr] = await tx`select version from mre.versions where recipe_id = ${pre.id} and state = 'bozza'`
    const [mx] = await tx`select coalesce(max(version), 0)::int as v from mre.versions where recipe_id = ${pre.id}`
    const motivo = 'T.E.C. per Max: ' + pre.r.frasi.join('; ').slice(0, 450)
    if (dr) await tx`update mre.versions set doc = ${sql.json(clean as any)}, created_at = now(), created_by = ${u.id}, reason = ${motivo} where recipe_id = ${pre.id} and version = ${dr.version}`
    else await tx`insert into mre.versions (recipe_id, version, state, doc, reason, created_by) values (${pre.id}, ${mx.v + 1}, 'bozza', ${sql.json(clean as any)}, ${motivo}, ${u.id})`
    await audit(tx, u, 'save_draft', pre.id, { da: 'T.E.C.', per: 'Max', frasi: pre.r.frasi, modifiche: b.modifiche })
    // 3) rilettura dal database: cosa è cambiato DAVVERO
    const [letto] = await tx`select version, doc from mre.versions where recipe_id = ${pre.id} and state = 'bozza'`
    const cambiato = TB.confronta(base, letto.doc, pre.nomi)
    return { ok: true, ricetta_id: pre.id, bozza_versione: letto.version, salvato_da: u.name, impronta_nuova: await TB.impronta(Object.assign({}, letto.doc, { id: pre.id })),
             cambiato_davvero: cambiato, avvisi, nota: 'Bozza salvata: NON pubblicata. Max la trova in Recipe Master → Ricette, segnata «da T.E.C.»: la controlla, la segna «Verificata» e la pubblica lui.' }
  })
}
export async function tecPropostaNuova(u: U, b: any, svc: any) {
  tecOk(u)
  const titolo = String(b?.titolo || '').trim().slice(0, 200); if (titolo.length < 2) throw bad('titolo_mancante')
  const righe = Array.isArray(b?.righe) ? b.righe.slice(0, 60) : [], passi = Array.isArray(b?.passi) ? b.passi.slice(0, 40) : []
  if (!righe.length) throw bad('nessuna_riga')
  const modifiche: any[] = [
    ...righe.map((x: any) => ({ tipo: 'aggiungi_riga', ref: x.ref, genere: x.genere, quantita: x.quantita, unita: x.unita, nota: x.nota })),
    ...passi.map((p: any) => ({ tipo: 'aggiungi_passo', testo: typeof p === 'string' ? p : p?.testo })),
    ...(b?.resa && (b.resa.grammi != null || b.resa.porzioni != null) ? [{ tipo: 'cambia_resa', grammi: b.resa.grammi ?? null, porzioni: b.resa.porzioni ?? null }] : [])]
  const id = crypto.randomUUID()
  const vuoto = { schema: 1, id, title: titolo, category: b?.categoria ? String(b.categoria).slice(0, 100) : null, yield: {}, has_stock: false, stock: [], lines: [], steps: [], notes: 'Proposta di T.E.C. per Max' }
  return await lab(async tx => {
    const nomi: Record<string, string> = {}
    await tecNomiNuovi(tx, svc, modifiche, nomi)
    const r = TB.applica(vuoto, modifiche, nomi)
    if (r.errori.length) throw bad('non_valida: ' + r.errori.join(' | '))
    for (const l of r.doc.lines) l.unit = E.standardUnit(l.unit)          // MR-05: same unit rule
    const t2 = await tree(tx, svc, r.doc, true); const ev = E.validate(r.doc, ctxOf(t2, true), false)
    if (ev.length) throw bad('non_valida: ' + ev.join(','))
    await tx`insert into mre.recipes (id, pilot, current_version, source, diffs) values (${id}, false, 0, ${sql.json({ lab_only: true, kind: b?.prep ? 'prep' : 'menu', proposta_da: 'T.E.C.', per: 'Max' } as any)}, ${sql.json([])})`
    await tx`insert into mre.versions (recipe_id, version, state, doc, reason, created_by) values (${id}, 1, 'bozza', ${sql.json(cleanDoc(id, r.doc) as any)}, ${'Proposta nuova di T.E.C. per Max'}, ${u.id})`
    await audit(tx, u, 'proposal', id, { da: 'T.E.C.', per: 'Max', titolo, frasi: r.frasi })
    return { ok: true, ricetta_id: id, titolo, frasi: r.frasi, avvisi: r.avvisi, passi_da_tradurre: r.passi_da_tradurre.length,
             nota: 'Proposta salvata come BOZZA: non è in Brigade. Max la trova in Recipe Master → Ricette, segnata «da T.E.C.»: la controlla, la segna «Verificata» e la crea lui con «Pubblica in Brigade come ricetta NUOVA».' }
  })
}
