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

const sql = postgres(Deno.env.get('SUPABASE_DB_URL') ?? '', { prepare: false, max: 3, idle_timeout: 20, connect_timeout: 10 })
type U = { id: number; name: string; role: 'chef' | 'staff' }
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
async function readOfficial(svc: any, rootIds: string[], tx0?: any) {
  const recipes: Record<string, any> = {}, bom: Record<string, any[]> = {}
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
  if (!ids.length) return { docs: {} as Record<string, any>, diffs: {} as Record<string, any[]>, read_at: new Date().toISOString() }
  const itemIds = [...new Set(Object.values(bom).flat().filter((b: any) => b.item_id).map((b: any) => b.item_id))] as string[]
  const factsQ = async (tx: any) => { const [{ f }] = await tx`select mre.ingredient_facts(string_to_array(${itemIds.join(',')}, ',')::uuid[]) as f`; return f || {} }
  const facts = itemIds.length ? (tx0 ? await factsQ(tx0) : await lab<any>(factsQ)) : {}
  Object.values(bom).flat().forEach((b: any) => { b.policy = b.item_id && facts[b.item_id] ? facts[b.item_id].policy ?? null : null })
  const [steps, preps, yields] = await Promise.all([
    svc.from('recipe_steps').select('*').in('recipe_id', ids).order('step_number').then(must),
    svc.from('prep_tasks').select('id,name,unit,recipe_id,prep_type,stock_role,archived').in('recipe_id', ids).not('archived', 'is', true).then(must),
    svc.from('recipe_yield').select('*').in('id', ids).then(must),
  ]) as any[][]
  const at = new Date().toISOString(), docs: Record<string, any> = {}, diffs: Record<string, any[]> = {}
  for (const rid of ids) {
    const out = buildLabDoc({ id: rid, r: recipes[rid], rows: bom[rid], stepRows: steps.filter(x => x.recipe_id === rid), prepRows: preps.filter(x => x.recipe_id === rid), y: yields.find(x => x.id === rid), byId: recipes, importedAt: at })
    docs[rid] = Object.assign(out.doc, { id: rid, _source: 'official' }); diffs[rid] = out.diffs
  }
  return { docs, diffs, read_at: at }
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
async function tree(tx: any, svc: any, rootDoc: any, withDrafts: boolean) {
  const docs: Record<string, any> = { [rootDoc.id]: rootDoc }, draftDocs: Record<string, any> = {}
  let frontier = [rootDoc]
  for (let d = 0; d < 8 && frontier.length; d++) {
    const want = [...new Set(frontier.flatMap((x: any) => (x.lines || []).filter((l: any) => l.kind === 'recipe').map((l: any) => l.ref)))].filter(id => !docs[id]) as string[]
    if (!want.length) break
    const off = (await readOfficial(svc, want, tx)).docs
    const missing = want.filter(x => !off[x]), lo = await labOnlyDocs(tx, missing)
    const got: Record<string, any> = Object.assign({}, off, lo)
    Object.assign(docs, got)
    if (withDrafts) Object.assign(draftDocs, await draftsOf(tx, Object.keys(got)))
    frontier = [...Object.values(got), ...Object.values(draftDocs).filter((x: any) => !frontier.includes(x))]
  }
  const all = [...Object.values(docs), ...Object.values(draftDocs)]
  const ing = [...new Set(all.flatMap((x: any) => (x.lines || []).filter((l: any) => l.kind === 'ingredient').map((l: any) => l.ref)))]
  const [{ f }] = await tx`select mre.ingredient_facts(string_to_array(${(ing as string[]).join(',')}, ',')::uuid[]) as f`
  const [{ m }] = await tx`select mre.kitchen_measures() as m`
  return { docs, draftDocs, facts: f || {}, measures: m || {} }
}
const ctxOf = (t: any, drafts = false) => ({ doc: (id: string) => (drafts && t.draftDocs && t.draftDocs[id]) || t.docs[id], facts: (id: string) => t.facts[id], measures: t.measures })
const LOCK = 'pubblicazione_bloccata'   // step A: nothing is ever published to the official recipes from here
function stripPrices(facts: any) { const o: any = {}; for (const k of Object.keys(facts)) { const { price, ...rest } = facts[k]; o[k] = rest } return o }

/* ---------------- reads ---------------- */
export async function mreList(u: U, svc: any) {
  const rows: any[] = await lab<any[]>(tx => tx`
    select r.id, r.pilot, r.is_test, r.current_version, v.state, v.doc->>'title' as title, v.doc->>'category' as category,
           jsonb_array_length(r.diffs) as diffs, r.diffs_checked_at is not null as diffs_checked,
           exists (select 1 from mre.versions d where d.recipe_id = r.id and d.state = 'bozza') as draft,
           (select count(*)::int from mre.suggestions s where s.recipe_id = r.id and s.status = 'in attesa') as pending,
           coalesce((r.source->>'on_demand')::boolean, false) as on_demand, coalesce((r.source->>'lab_only')::boolean, false) as lab_only
    from mre.recipes r left join lateral (select * from mre.versions x where x.recipe_id = r.id order by (x.state = 'bozza') desc, x.version desc limit 1) v on true`)
  // titles and categories of official recipes come from Brigade (one source); lab-only ones from their draft
  const offIds = rows.filter((r: any) => !r.is_test && !r.lab_only).map((r: any) => r.id)
  const off: Record<string, any> = {}
  for (let i = 0; i < offIds.length; i += 200) (must(await svc.from('recipes').select('id,title,category').in('id', offIds.slice(i, i + 200))) as any[]).forEach(r => { off[r.id] = r })
  rows.forEach((r: any) => { if (off[r.id]) { r.title = off[r.id].title; r.category = off[r.id].category; r.state = 'ufficiale' } else if (!r.is_test && !r.lab_only) r.state = 'non_in_brigade' })
  rows.sort((a: any, b: any) => String(a.title || '').localeCompare(String(b.title || '')))
  // copies made by the Chef's "Edit" (B-25) are Chef work in progress: staff keep the official Brigade card for them
  const list = rows.filter((r: any) => r.state !== 'non_in_brigade' && (u.role === 'chef' || (!r.on_demand && !r.lab_only))).map((r: any) => u.role === 'chef' ? r : { id: r.id, pilot: r.pilot, is_test: r.is_test, title: r.title, category: r.category, state: r.state })
  return { engine: E.MRE_ENGINE_VERSION, source: 'official', publish_locked: true, recipes: list, pending: u.role === 'chef' ? rows.reduce((a: number, r: any) => a + r.pending, 0) : 0 }
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
    const out: any = { engine: E.MRE_ENGINE_VERSION, source, read_at: off.read_at, publish_locked: !(r && r.is_test),
      recipe: { id, pilot: r ? r.pilot : false, current_version: r ? r.current_version : 0, linked: !!r },
      doc: cur, docs: t.docs, draft_docs: isChef ? t.draftDocs : {}, facts: isChef ? t.facts : stripPrices(t.facts), measures: t.measures }
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
function cleanDoc(id: string, d: any) {
  if (!d || typeof d !== 'object') throw bad('bad_doc')
  const str = (x: any, n: number) => x == null ? null : String(x).slice(0, n)
  const num = (x: any) => x == null || x === '' ? null : (isFinite(Number(x)) && Number(x) >= 0 ? Number(x) : (() => { throw bad('bad_number') })())
  const lines = (Array.isArray(d.lines) ? d.lines : []).slice(0, 200).map((l: any) => ({
    id: str(l.id, 40), kind: l.kind === 'recipe' ? 'recipe' : 'ingredient', ref: isUuid(l.ref) ? l.ref : (() => { throw bad('bad_ref') })(),
    qty: num(l.qty), unit: str(l.unit, 20), role: ['produzione', 'al_piatto', 'imballo'].includes(l.role) ? l.role : 'produzione',
    note: str(l.note, 300), group: str(l.group, 60), src: l.src && typeof l.src === 'object' ? l.src : null }))
  const steps = (Array.isArray(d.steps) ? d.steps : []).slice(0, 60).map((s: any) => ({ it: str(s.it, 4000) || '', en: str(s.en, 4000) || '', es: str(s.es, 4000) || '', title_it: str(s.title_it, 200), title_en: str(s.title_en, 200), title_es: str(s.title_es, 200) }))
  const y = d.yield || {}
  return { schema: 1, id, title: str(d.title, 200) || '', category: str(d.category, 100), yield: { g: num(y.g), portions: num(y.portions), label: str(y.label, 120), count: num(y.count), count_unit: str(y.count_unit, 20) },
    has_stock: !!d.has_stock, stock: Array.isArray(d.stock) ? d.stock.slice(0, 10) : [], lines, steps, notes: str(d.notes, 4000) }
}

export async function mreSaveDraft(u: U, b: any, svc: any) {
  chef(u)
  const id = String(b?.id || ''); if (!isUuid(id)) throw bad('bad_id')
  const doc = cleanDoc(id, b?.doc)
  return await lab(async tx => {
    const [r] = await tx`select current_version from mre.recipes where id = ${id} for update`
    if (!r) throw new MreError(404, 'not_found')
    if (b?.base != null && Number(b.base) !== r.current_version) throw new MreError(409, 'versione_cambiata')
    // every link must point to an existing ingredient (public.ingredients, via the read-only helper) or an existing recipe
    const ingIds: string[] = doc.lines.filter((l: any) => l.kind === 'ingredient').map((l: any) => l.ref), recIds: string[] = doc.lines.filter((l: any) => l.kind === 'recipe').map((l: any) => l.ref)
    const [{ f }] = await tx`select mre.ingredient_facts(string_to_array(${(ingIds as string[]).join(',')}, ',')::uuid[]) as f`
    if (ingIds.some((x: string) => !(f || {})[x])) throw bad('ingrediente_sconosciuto')
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

export async function mrePublish(u: U, b: any) {
  chef(u)
  const id = String(b?.id || ''); if (!isUuid(id)) throw bad('bad_id')
  const reason = String(b?.reason || '').trim().slice(0, 500) || null
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
