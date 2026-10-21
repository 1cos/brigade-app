// STEP A (Chef GO 20/10): run by tests/stepA/bench.mjs (throwaway Postgres). The official Brigade tables are a mock that
// answers SELECTs from the read-only snapshot and FAILS the test on any write. The lab is the real migration.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import * as M from '../../supabase/functions/brigade-app-api/mre.ts'
import * as E from '../../supabase/functions/_shared/mre_engine.js'
import postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js'

const S = JSON.parse(Deno.readTextFileSync(Deno.env.get('SNAP')!))
const db = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 1 })
const writes: string[] = []
const FX = Deno.env.get('MATCHFX') ? JSON.parse(Deno.readTextFileSync(Deno.env.get('MATCHFX')!)) : {}
const TABLES: Record<string, any[]> = Object.assign({
  recipes: S.recipes, recipe_bom: S.bom, recipe_steps: S.steps, prep_tasks: S.prep, recipe_yield: S.yield,
  users: [{ id: 1, name: 'Max' }, { id: 38, name: 'Pablo' }],
}, FX)
const ingName = Object.fromEntries(Object.values(S.facts).map((f: any) => [f.id, { name: f.name, base_unit: f.base_unit }]))
function from(t: string) {
  let rows = (TABLES[t] || []).slice(), join = false
  const q: any = {
    select(cols: string) { join = /ingredients\(/.test(cols); return q },
    in(c: string, v: any[]) { const s = new Set(v); rows = rows.filter(r => s.has(r[c])); return q },
    eq(c: string, v: any) { rows = rows.filter(r => r[c] === v); return q },
    not(c: string, op: string, v: any) { rows = rows.filter(r => !(op === 'is' && r[c] === v)); return q },
    ilike(c: string, pat: string) { const re = new RegExp('^' + pat.replace(/%/g, '.*') + '$', 'i'); rows = rows.filter(r => re.test(String(r[c] || ''))); return q },
    order(c: string) { rows.sort((a, b) => (a[c] ?? 0) > (b[c] ?? 0) ? 1 : -1); return q },
    limit(n: number) { rows = rows.slice(0, n); return q },
    range(a: number, b: number) { rows = rows.slice(a, b + 1); return q },
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
  assertEquals(w.title, 'Wheel Pasta'); assertEquals(L.publish_locked, true)
  // R1.13: one row per recipe — every official recipe once, the old 15/10 copy and the test example are not other recipes
  const ids = L.recipes.map((r: any) => r.id)
  assertEquals(new Set(ids).size, ids.length, 'nessun doppione'); assertEquals(ids.length, S.recipes.length, 'tutte le ricette ufficiali, una volta')
  assert(!ids.includes(TEST), 'l\'esempio tecnico non è una ricetta del ricettario')
  const sp = L.recipes.find((r: any) => r.id === SPIN); assert(sp.menu && sp.prep, 'BUTTER SPINACH oggi: piatto POS e prep #318')
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
    await tx`insert into mre.recipes (id, pilot, current_version, source) values (${POS}, true, 0, ${tx.json({ lab_only: true, proposal: 'CD-067', kind: 'menu', takes_pos_from: SPIN, pos_names: ['Butter Spinach', 'Sautéed Spinach'] })})`
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

Deno.test('B1 una sola lista: Spinach Cup — PREP e Butter Spinach — MENU ITEM, ognuna una volta', async () => {
  const L = await M.mreList(CHEF, svc), ids = L.recipes.map((r: any) => r.id)
  assertEquals(new Set(ids).size, ids.length, 'nessun doppione')
  const sp = L.recipes.find((r: any) => r.id === SPIN), pos = L.recipes.find((r: any) => r.id === POS)
  assertEquals(sp.draft_title, 'Spinach Cup'); assert(sp.prep && !sp.menu && sp.draft, 'Spinach Cup = PREP con la sua bozza')
  assert(pos.menu && !pos.prep && pos.lab_only, 'Butter Spinach = MENU ITEM (proposta)'); assertEquals(pos.pos_names, ['Butter Spinach', 'Sautéed Spinach'])
  const st = await M.mreList(STAFF, svc), s2 = st.recipes.find((r: any) => r.id === SPIN)
  assert(!st.recipes.some((r: any) => r.id === POS) && !('draft' in s2) && !('draft_title' in s2) && s2.menu, 'il cuoco vede solo la ricetta in uso')
})

Deno.test('B2 la prima bozza di una ricetta ufficiale la collega da sola (nessuna copia, nessuna scrittura in Brigade)', async () => {
  const [{ n0 }] = await db`select count(*)::int n0 from mre.recipes where id = ${PARM}`; assertEquals(n0, 0)
  const off = (await M.mreRecipe(CHEF, PARM, svc)).doc
  const s = await M.mreSaveDraft(CHEF, { id: PARM, doc: Object.assign({}, off, { notes: 'prova R1.13' }), base: 0 }, svc)
  assertEquals(s.draft_version, 1)
  const [{ n }] = await db`select count(*)::int n from mre.versions where recipe_id = ${PARM}`; assertEquals(n, 1, 'solo la bozza')
  await M.mreDiscard(CHEF, { id: PARM })
})

Deno.test('B3 "verificata dallo Chef": segno di revisione, non pubblicazione', async () => {
  const r = await M.mreReview(CHEF, { id: WHEEL, verified: true }, svc); assertEquals(r.review.by, 'Max')
  assert(r.review.open >= 1 && r.review.issues.some((x: any) => x.code === 'prezzo_mancante'), 'R1.14: la revisione tiene i problemi aperti (rum senza prezzo): ' + JSON.stringify(r.review.issues))
  let w = (await M.mreList(CHEF, svc)).recipes.find((x: any) => x.id === WHEEL); assertEquals(w.review.by, 'Max')
  assertEquals((await M.mreRecipe(CHEF, WHEEL, svc)).recipe.review.by, 'Max')
  const [{ v }] = await db`select count(*)::int v from mre.versions where recipe_id = ${WHEEL} and state = 'pubblicata'`; assertEquals(v, 0, 'nessuna pubblicazione')
  await M.mreReview(CHEF, { id: WHEEL, verified: false }, svc)
  w = (await M.mreList(CHEF, svc)).recipes.find((x: any) => x.id === WHEEL); assertEquals(w.review, null)
  const ok = await M.mreReview(CHEF, { id: SPIN, verified: true }, svc); assert(ok.ok)
  assertEquals(await err(M.mreReview(STAFF as any, { id: SPIN }, svc)), 'forbidden')
  assert(!('review' in (await M.mreList(STAFF, svc)).recipes.find((x: any) => x.id === SPIN)), 'il cuoco non vede la revisione')
})

Deno.test('C1 acquisto suggerito: Alluminium Cups → Cont Alum 4 Oz Utility (Ben E. Keith), con il perché; niente collegato da solo', async () => {
  const CUPS = 'f61ccfe4-2512-4f67-9402-4a00c37efea1', CONT = 'bb09009b-adba-4f20-a4a7-fe5ba4cd4ce7'
  const r = await M.mrePurchaseMatch(CHEF, { id: CUPS }, svc)
  assert(r.need, 'serve: nessun prezzo'); const c = r.candidates[0]
  assertEquals(c.level, 'forte'); assertEquals(c.target.id, CONT); assertEquals(c.vendor, 'Ben E. Keith'); assert(Math.abs(c.price.each - 0.13591) < 1e-9)
  assert(c.why.some((w: any) => w.k === 'unit_ok') && c.why.some((w: any) => w.k === 'invoices'))
  assert(!r.candidates.some((x: any) => /Scoop/.test(x.description)), 'la paletta gelato in alluminio non è proposta')
  const [{ n }] = await db`select count(*)::int n from mre.match_decisions`; assertEquals(n, 0, 'nessuna decisione presa da sola')
  assertEquals(await err(M.mrePurchaseMatch(STAFF as any, { id: CUPS }, svc)), 'forbidden')
})
Deno.test('C2 "Non corrisponde" resta: il candidato non torna', async () => {
  const CUPS = 'f61ccfe4-2512-4f67-9402-4a00c37efea1'
  const more = await M.mrePurchaseMatch(CHEF, { id: CUPS, more: true }, svc), weak = more.candidates.find((x: any) => x.level === 'debole')
  assert(weak, 'c\'è un candidato debole su "Cerca altri"')
  await M.mreMatchDecide(CHEF, { id: CUPS, key: weak.key, decision: 'non_corrisponde' }, svc)
  const again = await M.mrePurchaseMatch(CHEF, { id: CUPS, more: true }, svc)
  assert(!again.candidates.some((x: any) => x.key === weak.key) && again.rejected === 1, 'non riproposto, conteggiato come scartato')
  assertEquals(await err(M.mreMatchDecide(CHEF, { id: CUPS, key: more.candidates[0].key, decision: 'collega' }, svc)), 'serve_ricetta')
})
Deno.test('C3 "Collega alla bozza": solo la bozza Spinach Cup cambia (contenitore = imballo, $0,13591 a pezzo)', async () => {
  const CUPS = 'f61ccfe4-2512-4f67-9402-4a00c37efea1', CONT = 'bb09009b-adba-4f20-a4a7-fe5ba4cd4ce7'
  const c = (await M.mrePurchaseMatch(CHEF, { id: CUPS }, svc)).candidates[0]
  const r = await M.mreMatchDecide(CHEF, { id: CUPS, key: c.key, decision: 'collega', recipe_id: SPIN, line_id: 'b1756' }, svc)
  assertEquals(r.target.id, CONT)
  const o = await M.mreRecipe(CHEF, SPIN, svc), l = o.draft.lines.find((x: any) => x.id === 'b1756')
  assertEquals(l.ref, CONT); assertEquals(l.role, 'imballo'); assertEquals(l.qty, 22)
  assertEquals(o.doc.lines.find((x: any) => x.id === 'b1756').ref, CUPS, 'ufficiale invariata')
  const ctx = { doc: (x: string) => x === SPIN ? o.draft : o.docs[x], facts: (x: string) => o.facts[x], measures: o.measures }, k = E.cost(SPIN, 1, ctx)
  assert(Math.abs(k.pack - 22 * 0.13591) < 1e-9, 'imballo del lotto = 22 × $0,13591')
  const r2 = await M.mrePurchaseMatch(CHEF, { id: CUPS }, svc); assertEquals(r2.candidates[0].level, 'collegato')
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

Deno.test('A8b bozza che collega un ingrediente nuovo: il suo prezzo arriva con la ricetta', async () => {
  const FLAKES = 'bb3717e0-3d2c-43ef-aac4-dc5df13f5d8a'
  await db`insert into bench.facts values (${FLAKES}, ${db.json({ id: FLAKES, name: 'Parmesan Flakes', base_unit: 'g', price: { basis_dim: 'mass', cost_per_base: 0.02987266089349019 } })}) on conflict do nothing`
  const off = (await M.mreRecipe(CHEF, WHEEL, svc)).doc
  await M.mreSaveDraft(CHEF, { id: WHEEL, doc: Object.assign({}, off, { lines: off.lines.map((l: any) => l.id === 'b2176' ? Object.assign({}, l, { ref: FLAKES }) : l) }), base: 1 }, svc)
  const o = await M.mreRecipe(CHEF, WHEEL, svc)
  assert(o.facts[FLAKES] && o.facts[FLAKES].price, 'prezzo del nuovo ingrediente presente')
  const c = E.cost(WHEEL, 1, { doc: (x: string) => x === WHEEL ? o.draft : o.docs[x], facts: (x: string) => o.facts[x], measures: o.measures })
  assert(Math.abs(c.food - 3.376) < 0.01, `costo bozza ${c.food}`)
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
