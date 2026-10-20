// STEP A (Chef GO 20/10): run by tests/stepA/bench.mjs (throwaway Postgres). The official Brigade tables are a mock that
// answers SELECTs from the read-only snapshot and FAILS the test on any write. The lab is the real migration.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import * as M from '../../supabase/functions/brigade-app-api/mre.ts'
import * as E from '../../supabase/functions/_shared/mre_engine.js'
import postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js'

const S = JSON.parse(Deno.readTextFileSync(Deno.env.get('SNAP')!))
const db = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 1 })
const writes: string[] = []
const TABLES: Record<string, any[]> = {
  recipes: S.recipes, recipe_bom: S.bom, recipe_steps: S.steps, prep_tasks: S.prep, recipe_yield: S.yield,
  users: [{ id: 1, name: 'Max' }, { id: 38, name: 'Pablo' }],
}
const ingName = Object.fromEntries(Object.values(S.facts).map((f: any) => [f.id, { name: f.name, base_unit: f.base_unit }]))
function from(t: string) {
  let rows = (TABLES[t] || []).slice(), join = false
  const q: any = {
    select(cols: string) { join = /ingredients\(/.test(cols); return q },
    in(c: string, v: any[]) { const s = new Set(v); rows = rows.filter(r => s.has(r[c])); return q },
    not(c: string, op: string, v: any) { rows = rows.filter(r => !(op === 'is' && r[c] === v)); return q },
    ilike(c: string, pat: string) { const re = new RegExp('^' + pat.replace(/%/g, '.*') + '$', 'i'); rows = rows.filter(r => re.test(String(r[c] || ''))); return q },
    order(c: string) { rows.sort((a, b) => (a[c] ?? 0) > (b[c] ?? 0) ? 1 : -1); return q },
    limit(n: number) { rows = rows.slice(0, n); return q },
    then(res: any, rej: any) { const data = join ? rows.map(r => Object.assign({}, r, { ingredients: r.item_id ? ingName[r.item_id] || null : null })) : rows; return Promise.resolve({ data: structuredClone(data), error: null }).then(res, rej) },
  }
  for (const w of ['insert', 'update', 'upsert', 'delete']) q[w] = () => { writes.push(t + '.' + w); throw new Error('WRITE ON OFFICIAL TABLE ' + t) }
  return q
}
const svc = { from, rpc: (n: string) => { writes.push('rpc.' + n); throw new Error('RPC ' + n) } }
const CHEF = { id: 1, name: 'Max', role: 'chef' as const }, STAFF = { id: 38, name: 'Pablo', role: 'staff' as const }
const SPIN = '9cec677b-55d6-4329-9dae-5dd4d489e147', PARM = '6357c9f1-f944-4153-8d7f-afb11336d91a', WHEEL = '5479387e-e4ad-4401-92ce-9cb785ef4a0d'
const TEST = '00000000-b490-4000-8000-000000000001', POS = 'b0490000-0000-4000-8000-0000000000a1'
const official0 = JSON.stringify(TABLES)
const err = async (p: Promise<any>) => { try { await p; return null } catch (e: any) { return e.code || e.message } }
const ctxOf = (o: any, drafts: boolean) => ({ doc: (x: string) => x === o.recipe.id ? (drafts && o.draft ? o.draft : o.doc) : ((drafts && o.draft_docs[x]) || o.docs[x]), facts: (x: string) => o.facts[x], measures: o.measures })

Deno.test('A1 la lista: ricette ufficiali con titolo da Brigade, Publish bloccato', async () => {
  const L = await M.mreList(CHEF, svc)
  const w = L.recipes.find((r: any) => r.id === WHEEL)
  assertEquals(w.title, 'Wheel Pasta'); assertEquals(w.state, 'ufficiale'); assertEquals(L.publish_locked, true)
})

Deno.test('A2 ricetta = ufficiale letta adesso (non la copia vecchia del laboratorio)', async () => {
  const o = await M.mreRecipe(CHEF, WHEEL, svc)
  assertEquals(o.source, 'official'); assertEquals(o.doc.title, 'Wheel Pasta'); assert(o.doc.lines.length === 5, 'distinta ufficiale (5 righe)')
  assert(o.versions.some((v: any) => v.state === 'importata'), 'la copia del 15/10 resta solo come storico')
  assertEquals(o.publish_locked, true)
})

Deno.test('A3 Butter Spinach: ufficiale (15 porzioni, 75 g parmigiano), food cost = FC05', async () => {
  const o = await M.mreRecipe(CHEF, SPIN, svc)
  assertEquals(o.source, 'official'); assertEquals(o.doc.yield.portions, 15)
  assert(o.doc.lines.some((l: any) => l.id === 'b1757' && l.qty === 75))
  assert(Math.abs(o.cost.food - S.fc[SPIN].totals.known) < 0.005, `costo ${o.cost.food}`)
  assertEquals(o.recipe.linked, false)
})

Deno.test('A4 "Modifica" collega soltanto (nessuna copia), poi bozza Spinach Cup', async () => {
  const r = await M.mrePrepareEdit(CHEF, { id: SPIN }, svc)
  assertEquals(r.imported, 0)
  const [{ n }] = await db`select count(*)::int n from mre.versions where recipe_id = ${SPIN}`
  assertEquals(n, 0, 'nessuna versione copiata')
  const off = (await M.mreRecipe(CHEF, SPIN, svc)).doc
  const draft = Object.assign({}, off, { title: 'Spinach Cup', yield: Object.assign({}, off.yield, { portions: 22, label: '22 contenitori = 22 porzioni (CD-067)' }), lines: off.lines.filter((l: any) => l.id !== 'b1757') })
  const s = await M.mreSaveDraft(CHEF, { id: SPIN, doc: draft, base: 0 }, svc)
  assertEquals(s.draft_version, 1)
  const o = await M.mreRecipe(CHEF, SPIN, svc)
  assertEquals(o.doc.yield.portions, 15, 'la ricetta mostrata resta quella ufficiale')
  assertEquals(o.draft.yield.portions, 22); assert(!o.draft.lines.some((l: any) => l.id === 'b1757'))
})

Deno.test('A5 POS ITEM proposta (solo laboratorio) collegata per ID alla bozza Spinach Cup', async () => {
  await db.begin(async (tx: any) => {
    await tx`set local role mre_app`
    await tx`insert into mre.recipes (id, pilot, current_version, source) values (${POS}, true, 0, ${tx.json({ lab_only: true, proposal: 'CD-067' })})`
  })
  const doc = { schema: 1, id: POS, title: 'Butter Spinach / Sautéed Spinach', category: 'Contorni', yield: { g: null, portions: 1, label: '1 porzione' }, has_stock: false, stock: [],
    lines: [{ id: 'p1', kind: 'recipe', ref: SPIN, qty: 1, unit: 'portion', role: 'produzione', note: '1 Spinach Cup', group: null },
      { id: 'p2', kind: 'recipe', ref: PARM, qty: 5, unit: 'g', role: 'al_piatto', note: 'al servizio — 5 g da verificare', group: null }], steps: [], notes: null }
  await M.mreSaveDraft(CHEF, { id: POS, doc, base: 0 }, svc)
  const o = await M.mreRecipe(CHEF, POS, svc)
  assertEquals(o.source, 'lab'); assertEquals(o.draft_docs[SPIN].yield.portions, 22)
  const ctx = ctxOf(o, true), c = E.cost(POS, 1, ctx)
  assert(Math.abs(c.food - 0.789) < 0.001, `costo POS ITEM ${c.food}`)
  const sale = E.sumMovements([E.movements({ kind: 'vendita', recipe: POS, portions: 1 }, ctx)])
  assertEquals(Math.round(-sale['prep:' + SPIN].portions * 1000) / 1000, 1); assertEquals(Math.round(-sale['prep:' + PARM].g * 1000) / 1000, 5)
  const L = await M.mreList(CHEF, svc)
  assert(L.recipes.some((r: any) => r.id === POS && r.lab_only), 'la proposta è nella lista dello Chef')
  assert(!(await M.mreList(STAFF, svc)).recipes.some((r: any) => r.id === POS), 'il cuoco non vede la proposta')
})

Deno.test('A6 Publish BLOCCATO sulle ricette ufficiali e sulle proposte; il tentativo resta nel registro', async () => {
  assertEquals(await err(M.mrePublish(CHEF, { id: SPIN, base: 0 })), 'pubblicazione_bloccata')
  assertEquals(await err(M.mrePublish(CHEF, { id: POS, base: 0 })), 'pubblicazione_bloccata')
  const [{ n }] = await db`select count(*)::int n from mre.audit where op = 'publish_refused'`
  assertEquals(n, 2)
  const [{ d }] = await db`select count(*)::int d from mre.versions where state = 'bozza' and recipe_id = ${SPIN}`
  assertEquals(d, 1, 'la bozza resta bozza')
})

Deno.test('A7 la prova tecnica (non ufficiale) si pubblica ancora nel laboratorio', async () => {
  await M.mreSaveDraft(CHEF, { id: TEST, doc: { schema: 1, id: TEST, title: 'Esempio — Pan di Spagna (7 uova)', yield: { g: 820, portions: 12 }, has_stock: false, lines: [], steps: [] }, base: 1 }, svc)
  const r = await M.mrePublish(CHEF, { id: TEST, base: 1 }); assertEquals(r.version, 2)
})

Deno.test('A8 Ripristina dallo storico = nuova BOZZA (mai una ricetta in uso)', async () => {
  const r = await M.mreRestore(CHEF, { id: WHEEL, version: 1 }); assertEquals(r.draft, true)
  const o = await M.mreRecipe(CHEF, WHEEL, svc)
  assertEquals(o.doc.title, 'Wheel Pasta', 'in uso resta l\'ufficiale'); assertEquals(o.draft.title, 'Wheel Pasta (copia vecchia 15/10)')
  await M.mreDiscard(CHEF, { id: WHEEL })
})

Deno.test('A9 cuoco: niente prezzi, niente bozze, niente proposte', async () => {
  const o = await M.mreRecipe(STAFF, SPIN, svc)
  assert(!Object.values(o.facts).some((f: any) => 'price' in f)); assertEquals(o.draft, undefined); assertEquals(Object.keys(o.draft_docs).length, 0)
  assertEquals(await err(M.mreRecipe(STAFF, POS, svc)), 'not_found')
  assertEquals(await err(M.mreSaveDraft(STAFF as any, { id: SPIN, doc: {} }, svc)), 'forbidden')
})

Deno.test('A10 produzione: solo simulata se non c\'è una versione del laboratorio', async () => {
  assertEquals(await err(M.mreProduction(CHEF, { id: SPIN, factor: 1 })), 'produzione_solo_simulata')
})

Deno.test('A11 nessuna scrittura sulle tabelle ufficiali', () => {
  assertEquals(writes, []); assertEquals(JSON.stringify(TABLES), official0)
})

Deno.test({ name: 'chiusura', sanitizeResources: false, sanitizeOps: false, fn: async () => { await db.end() } })
