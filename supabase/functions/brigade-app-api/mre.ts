// MRE — Master Recipe Engine lab (B-49, Chef Max GO 15/10/2026) inside brigade-app-api.
// ISOLATION: every statement runs in a transaction under role mre_app (SET LOCAL ROLE), which has rights ONLY on schema mre.
// Main Brigade tables (recipes, recipe_bom, prep, stock, POS, food_cost) are read only through the read-only helper
// functions (prices, conversions) — this module cannot write them even by mistake: Postgres refuses.
// Calculations use the SAME engine file as the app (../_shared/mre_engine.js).
import postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js'
import * as E from '../_shared/mre_engine.js'

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

async function currentDocs(tx: any, ids: string[]) {
  if (!ids.length) return {} as Record<string, any>
  const rows = await tx`select v.recipe_id, v.version, v.state, v.doc from mre.recipes r join mre.versions v on v.recipe_id = r.id and v.version = r.current_version where r.id = any(string_to_array(${(ids as string[]).join(',')}, ',')::uuid[])`
  const out: Record<string, any> = {}
  rows.forEach((r: any) => { out[r.recipe_id] = Object.assign({}, r.doc, { id: r.recipe_id, _version: r.version, _state: r.state }) })
  return out
}
/** The recipe and every sub-recipe below it (current versions), plus the live facts of every ingredient. */
async function tree(tx: any, rootDoc: any) {
  const docs: Record<string, any> = { [rootDoc.id]: rootDoc }
  let frontier = [rootDoc]
  for (let d = 0; d < 8 && frontier.length; d++) {
    const want = [...new Set(frontier.flatMap((x: any) => (x.lines || []).filter((l: any) => l.kind === 'recipe').map((l: any) => l.ref)))].filter(id => !docs[id])
    const got = await currentDocs(tx, want as string[])
    Object.assign(docs, got); frontier = Object.values(got)
  }
  const ing = [...new Set(Object.values(docs).flatMap((x: any) => (x.lines || []).filter((l: any) => l.kind === 'ingredient').map((l: any) => l.ref)))]
  const [{ f }] = await tx`select mre.ingredient_facts(string_to_array(${(ing as string[]).join(',')}, ',')::uuid[]) as f`
  const [{ m }] = await tx`select mre.kitchen_measures() as m`
  return { docs, facts: f || {}, measures: m || {} }
}
const ctxOf = (t: any) => ({ doc: (id: string) => t.docs[id], facts: (id: string) => t.facts[id], measures: t.measures })
function stripPrices(facts: any) { const o: any = {}; for (const k of Object.keys(facts)) { const { price, ...rest } = facts[k]; o[k] = rest } return o }

/* ---------------- reads ---------------- */
export async function mreList(u: U, svc: any) {
  const rows: any[] = await lab<any[]>(tx => tx`
    select r.id, r.pilot, r.is_test, r.current_version, v.state, v.doc->>'title' as title, v.doc->>'category' as category,
           jsonb_array_length(r.diffs) as diffs, r.diffs_checked_at is not null as diffs_checked,
           exists (select 1 from mre.versions d where d.recipe_id = r.id and d.state = 'bozza') as draft,
           (select count(*)::int from mre.suggestions s where s.recipe_id = r.id and s.status = 'in attesa') as pending
    from mre.recipes r join mre.versions v on v.recipe_id = r.id and v.version = r.current_version
    order by v.doc->>'title'`)
  const list = rows.map((r: any) => u.role === 'chef' ? r : { id: r.id, pilot: r.pilot, is_test: r.is_test, title: r.title, category: r.category, state: r.state })
  return { engine: E.MRE_ENGINE_VERSION, recipes: list, pending: u.role === 'chef' ? rows.reduce((a: number, r: any) => a + r.pending, 0) : 0 }
}

export async function mreRecipe(u: U, id: string, svc: any) {
  if (!isUuid(id)) throw bad('bad_id')
  return await lab(async tx => {
    const [r] = await tx`select id, pilot, current_version, diffs, diffs_checked_at, diffs_checked_by, imported_at from mre.recipes where id = ${id}`
    if (!r) throw new MreError(404, 'not_found')
    const cur = (await currentDocs(tx, [id]))[id]
    const t = await tree(tx, cur)
    const out: any = { engine: E.MRE_ENGINE_VERSION, recipe: { id, pilot: r.pilot, current_version: r.current_version }, doc: cur, docs: t.docs, facts: u.role === 'chef' ? t.facts : stripPrices(t.facts), measures: t.measures }
    const vers = await tx`select version, state, reason, created_by, created_at, published_by, published_at from mre.versions where recipe_id = ${id} order by version desc`
    const prods = await tx`select id, version, factor, reference, yield_planned_g, yield_real_g, changed, note, user_id, created_at from mre.productions where recipe_id = ${id} ${u.role === 'chef' ? tx`` : tx`and user_id = ${u.id}`} order by created_at desc limit 20`
    const sugs = await tx`select id, version, user_id, text, status, created_at, decided_by, decided_at, chef_note from mre.suggestions where recipe_id = ${id} ${u.role === 'chef' ? tx`` : tx`and user_id = ${u.id}`} order by created_at desc limit 50`
    const ids = [...new Set([...vers.flatMap((v: any) => [v.created_by, v.published_by]), ...prods.map((p: any) => p.user_id), ...sugs.flatMap((s: any) => [s.user_id, s.decided_by])].filter((x: any) => x != null))]
    const names: Record<number, string> = {}
    if (ids.length) { const { data } = await svc.from('users').select('id,name').in('id', ids); (data || []).forEach((x: any) => { names[x.id] = x.name }) }
    const nm = (x: any) => x == null ? null : names[x] || ('#' + x)
    out.versions = vers.map((v: any) => ({ version: v.version, state: v.state, reason: v.reason, by: nm(v.published_by ?? v.created_by), at: v.published_at ?? v.created_at }))
    out.productions = prods.map((p: any) => ({ ...p, by: nm(p.user_id) }))
    out.suggestions = sugs.map((s: any) => ({ id: s.id, version: s.version, text: s.text, status: s.status, at: s.created_at, by: nm(s.user_id), decided_by: nm(s.decided_by), decided_at: s.decided_at, chef_note: s.chef_note }))
    if (u.role === 'chef') {
      const [dr] = await tx`select version, doc, created_at from mre.versions where recipe_id = ${id} and state = 'bozza'`
      out.draft = dr ? Object.assign({}, dr.doc, { id, _version: dr.version, _state: 'bozza' }) : null
      out.diffs = r.diffs; out.diffs_checked = r.diffs_checked_at ? { at: r.diffs_checked_at, by: nm(r.diffs_checked_by) } : null
      out.cost = E.cost(id, 1, ctxOf(t))                                       // computed on the SERVER with the shared engine
    }
    return out
  })
}

export async function mreIngredients(u: U, q: string) {
  chef(u)
  const s = String(q || '').trim().slice(0, 60)
  return await lab(async tx => { const [{ r }] = await tx`select mre.ingredient_search(${s}) as r`; const recs = s.length >= 2 ? await tx`select r.id, v.doc->>'title' as title from mre.recipes r join mre.versions v on v.recipe_id = r.id and v.version = r.current_version where v.doc->>'title' ilike ${'%' + s + '%'} order by 2 limit 15` : []; return { ingredients: r, recipes: recs } })
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

export async function mreSaveDraft(u: U, b: any) {
  chef(u)
  const id = String(b?.id || ''); if (!isUuid(id)) throw bad('bad_id')
  const doc = cleanDoc(id, b?.doc)
  return await lab(async tx => {
    const [r] = await tx`select current_version from mre.recipes where id = ${id} for update`
    if (!r) throw new MreError(404, 'not_found')
    if (b?.base != null && Number(b.base) !== r.current_version) throw new MreError(409, 'versione_cambiata')
    // every link must point to an existing ingredient (public.ingredients, via the read-only helper) or a lab recipe
    const ingIds: string[] = doc.lines.filter((l: any) => l.kind === 'ingredient').map((l: any) => l.ref), recIds: string[] = doc.lines.filter((l: any) => l.kind === 'recipe').map((l: any) => l.ref)
    const [{ f }] = await tx`select mre.ingredient_facts(string_to_array(${(ingIds as string[]).join(',')}, ',')::uuid[]) as f`
    if (ingIds.some((x: string) => !(f || {})[x])) throw bad('ingrediente_sconosciuto')
    const known = recIds.length ? (await tx`select id from mre.recipes where id = any(string_to_array(${(recIds as string[]).join(',')}, ',')::uuid[])`).map((x: any) => x.id) : []
    if (recIds.some((x: string) => !known.includes(x))) throw bad('sotto_ricetta_sconosciuta')
    const t = await tree(tx, doc), errs = E.validate(doc, ctxOf(t), false)
    if (errs.length) throw bad('non_valida:' + errs.join(','))
    const [dr] = await tx`select version from mre.versions where recipe_id = ${id} and state = 'bozza'`
    if (dr) await tx`update mre.versions set doc = ${sql.json(doc as any)}, created_at = now(), created_by = ${u.id} where recipe_id = ${id} and version = ${dr.version}`
    else await tx`insert into mre.versions (recipe_id, version, state, doc, created_by) values (${id}, ${r.current_version + 1}, 'bozza', ${sql.json(doc as any)}, ${u.id})`
    await audit(tx, u, 'save_draft', id, { lines: doc.lines.length })
    return { ok: true, draft_version: dr ? dr.version : r.current_version + 1, cost: E.cost(id, 1, ctxOf(t)) }
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
  return await lab(async tx => {
    const [r] = await tx`select current_version, jsonb_array_length(diffs) as nd, diffs_checked_at from mre.recipes where id = ${id} for update`
    if (!r) throw new MreError(404, 'not_found')
    if (b?.base != null && Number(b.base) !== r.current_version) throw new MreError(409, 'versione_cambiata')
    if (r.nd > 0 && !r.diffs_checked_at) throw bad('differenze_da_controllare')
    const [dr] = await tx`select version, doc from mre.versions where recipe_id = ${id} and state = 'bozza'`
    if (!dr) throw bad('nessuna_bozza')
    const t = await tree(tx, Object.assign({}, dr.doc, { id })), errs = E.validate(Object.assign({}, dr.doc, { id }), ctxOf(t), true)
    if (errs.length) throw bad('non_valida:' + errs.join(','))
    await tx`update mre.versions set state = 'pubblicata', published_by = ${u.id}, published_at = now(), reason = ${reason} where recipe_id = ${id} and version = ${dr.version} and state = 'bozza'`
    await tx`update mre.recipes set current_version = ${dr.version} where id = ${id}`
    await audit(tx, u, 'publish', id, { version: dr.version, reason })
    return { ok: true, version: dr.version }
  })
}

export async function mreRestore(u: U, b: any) {
  chef(u)
  const id = String(b?.id || ''); const v = Number(b?.version); if (!isUuid(id) || !Number.isInteger(v)) throw bad('bad_args')
  return await lab(async tx => {
    const [r] = await tx`select current_version from mre.recipes where id = ${id} for update`
    if (!r) throw new MreError(404, 'not_found')
    if ((await tx`select 1 from mre.versions where recipe_id = ${id} and state = 'bozza'`).length) throw bad('bozza_aperta')
    const [old] = await tx`select doc from mre.versions where recipe_id = ${id} and version = ${v} and state <> 'bozza'`
    if (!old) throw bad('versione_sconosciuta')
    const nv = r.current_version + 1
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
