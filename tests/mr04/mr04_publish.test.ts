// MR-04 «Pubblica» — run by tests/mr04/bench.mjs (throwaway Postgres with a copy of the official recipe tables).
// The server reads the official tables through a mock of the Supabase client that answers from the SAME database, so what
// «Pubblica» writes is what the next read sees — exactly as in production.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js'
import * as M from '../../supabase/functions/brigade-app-api/mre.ts'

const URL = Deno.env.get('SUPABASE_DB_URL')!
const db = postgres(URL, { prepare: false, max: 2, types: { num: { to: 1700, from: [1700], serialize: (x: any) => String(x), parse: (x: string) => Number(x) } } as any })
const USERS = [{ id: 1, name: 'Max' }, { id: 38, name: 'Pablo' }]
function from(t: string) {
  const w: string[] = [], args: any[] = []; let ord = '', lim = '', join = false
  const q: any = {
    select(c: string) { join = t === 'recipe_bom' && /ingredients\(/.test(c); return q },
    in(c: string, v: any[]) { args.push(v); w.push(`x."${c}" = any($${args.length})`); return q },
    eq(c: string, v: any) { args.push(v); w.push(`x."${c}" = $${args.length}`); return q },
    not(c: string, op: string, v: any) { w.push(`x."${c}" is not ${v === null ? 'null' : v === true ? 'true' : 'false'}`); return q },
    ilike(c: string, p: string) { args.push(p); w.push(`x."${c}" ilike $${args.length}`); return q },
    order(c: string) { ord = ` order by x."${c}"`; return q },
    limit(n: number) { lim = ` limit ${Number(n)}`; return q },
    range(a: number, b: number) { lim = ` limit ${b - a + 1} offset ${a}`; return q },
    then(res: any, rej: any) {
      const run = async () => {
        if (t === 'users') return { data: USERS.filter(u => !args.length || args[0].includes(u.id)), error: null }
        const src = join ? `(select b.*, case when i.id is null then null else json_build_object('name', i.name, 'base_unit', i.base_unit) end as ingredients from public.recipe_bom b left join public.ingredients i on i.id = b.item_id)` : `public.${t}`
        const rows = await db.unsafe(`select x.* from ${src} x${w.length ? ' where ' + w.join(' and ') : ''}${ord}${lim}`, args)
        return { data: rows.map((r: any) => Object.assign({}, r)), error: null }
      }
      return run().then(res, rej)
    },
  }
  for (const k of ['insert', 'update', 'upsert', 'delete']) q[k] = () => { throw new Error('WRITE THROUGH THE CLIENT ON ' + t) }
  return q
}
const svc = { from, rpc: (n: string) => { throw new Error('RPC ' + n) } }
const CHEF = { id: 1, name: 'Max', role: 'chef' as const }, STAFF = { id: 38, name: 'Pablo', role: 'staff' as const }
const WHEEL = '5479387e-e4ad-4401-92ce-9cb785ef4a0d', PARM = 'bb3717e0-3d2c-43ef-aac4-dc5df13f5d8a'
const err = async (p: Promise<any>) => { try { await p; return null } catch (e: any) { return e.code || e.message } }
// the whole official content, to prove what changed and what did not
const snapAll = async () => JSON.stringify(await db`select (select jsonb_agg(to_jsonb(r) - 'food_cost_pct' order by id) from public.recipes r) r,
  (select jsonb_agg(to_jsonb(b) order by bom_id) from public.recipe_bom b) b, (select jsonb_agg(to_jsonb(s) - 'created_at' order by recipe_id, step_number) from public.recipe_steps s) s`)
const rowsOf = async (id: string) => await db`select bom_id, component_type, item_id, sub_recipe_id, quantity, unit, notes, sort_order from public.recipe_bom where parent_recipe_id = ${id} order by bom_id`
const on = () => Deno.env.set('MRE_PUBLISH', 'on'), off = () => Deno.env.delete('MRE_PUBLISH')
let S0 = ''

async function wheelDraft(steps = false) {
  const o = await M.mreRecipe(CHEF, WHEEL, svc)
  const doc = structuredClone(o.doc)
  doc.lines.find((l: any) => l.id === 'b2173').qty = 10                       // burro 10 g (Chef 22/10)
  doc.lines.find((l: any) => l.id === 'b2176').ref = PARM                     // Cheese Wheel → Parmigiano Reggiano 24 mesi (CD-069)
  if (steps) doc.steps = [{ it: 'Cucina (per 2 porzioni) · Sciogli un cubetto di burro con un po\' di acqua di cottura.', en: '', es: '', src: 'it', tr: { it: 'chef' } },
    { it: 'Sala · Raschia il formaggio: {{b2176}} g a porzione.', en: '', es: '', src: 'it', tr: { it: 'chef' } }]
  await M.mreSaveDraft(CHEF, { id: WHEEL, doc }, svc)
}
const review = () => M.mreReview(CHEF, { id: WHEEL }, svc)

Deno.test('P0 interruttore spento: tutto come oggi (Publish bloccato, anteprima rifiutata)', async () => {
  off(); S0 = await snapAll()
  assertEquals((await M.mreList(CHEF, svc)).publish_locked, true)
  assertEquals((await M.mreRecipe(CHEF, WHEEL, svc)).publish_locked, true)
  assertEquals(await err(M.mrePublishPreview(CHEF, { id: WHEEL }, svc)), 'pubblicazione_bloccata')
  await wheelDraft(); await review()
  assertEquals(await err(M.mrePublish(CHEF, { id: WHEEL }, svc)), 'pubblicazione_bloccata')
  assertEquals(await snapAll(), S0, 'niente scritto in Brigade')
})

Deno.test('P1 solo lo Chef; serve la bozza «Verificata» DOPO l\'ultima modifica', async () => {
  on()
  assertEquals(await err(M.mrePublishPreview(STAFF, { id: WHEEL }, svc)), 'forbidden')
  assertEquals(await err(M.mrePublish(STAFF, { id: WHEEL }, svc)), 'forbidden')
  await new Promise(r => setTimeout(r, 20)); await wheelDraft()                 // a change after the review
  assertEquals(await err(M.mrePublishPreview(CHEF, { id: WHEEL }, svc)), 'serve_verificata')
  await review()
})

Deno.test('P2 articolo «non attivo» messo sulla riga → rifiutato, niente scritto', async () => {
  const p = await M.mrePublishPreview(CHEF, { id: WHEEL }, svc)
  assertEquals(p.ok, false); assert(p.refusals.some((x: any) => x.code === 'articolo_non_attivo'))
  assertEquals(await err(M.mrePublish(CHEF, { id: WHEEL, impronta: p.impronta, piano: p.piano }, svc)), 'non_pubblicabile')
  assertEquals(await snapAll(), S0)
  await db`update public.ingredients set active = true where id = ${PARM}`       // = the unification install (MR-03) reactivates it
  S0 = await snapAll()
})

Deno.test('P3 anteprima: cosa cambia, food cost prima/dopo, scarichi prima/dopo — niente scritto', async () => {
  const p = await M.mrePublishPreview(CHEF, { id: WHEEL }, svc)
  assertEquals(p.ok, true, JSON.stringify(p.refusals))
  assert(p.summary.some((s: string) => /Diced Butter: 20 → 10/.test(s)), p.summary.join(' | '))
  assert(p.summary.some((s: string) => /articolo cambiato/.test(s)))
  assert(p.cost.after.food > p.cost.before.food, 'il parmigiano ora ha un prezzo')
  assert(p.consequences && Array.isArray(p.consequences.sale), 'scarico di 1 porzione prima/dopo')
  assert(p.impronta && p.piano)
  assertEquals(await snapAll(), S0, 'l\'anteprima non scrive niente')
})

Deno.test('P4 impronta o piano diversi da quelli visti → rifiutato, niente scritto', async () => {
  const p = await M.mrePublishPreview(CHEF, { id: WHEEL }, svc)
  assertEquals(await err(M.mrePublish(CHEF, { id: WHEEL, impronta: 'x', piano: p.piano }, svc)), 'ricetta_cambiata')
  assertEquals(await err(M.mrePublish(CHEF, { id: WHEEL, impronta: p.impronta, piano: 'x' }, svc)), 'piano_cambiato')
  // Brigade 1 changes the recipe between preview and publish → the old preview is refused
  await db`update public.recipes set yield_text = 'prova B1' where id = ${WHEEL}`
  assertEquals(await err(M.mrePublish(CHEF, { id: WHEEL, impronta: p.impronta, piano: p.piano }, svc)), 'ricetta_cambiata')
  await db`update public.recipes set yield_text = '' where id = ${WHEEL}`
  // but Brigade 1 rewriting food_cost_pct by itself (it does when a recipe is opened) does NOT block
  await db`update public.recipes set food_cost_pct = 12.3 where id = ${WHEEL}`
  const p2 = await M.mrePublishPreview(CHEF, { id: WHEEL }, svc)
  assertEquals(p2.impronta, p.impronta)
  assertEquals(await snapAll(), S0)
})

Deno.test('P5 FC05 non si muove come il motore → tutto annullato, niente scritto', async () => {
  const p = await M.mrePublishPreview(CHEF, { id: WHEEL }, svc)
  const b = p.cost.before.food + p.cost.before.pack, a = p.cost.after.food + p.cost.after.pack
  await db`insert into bench.fc05 values (${WHEEL}, ${b}, ${b + 0.5}) on conflict (recipe_id) do update set before = excluded.before, after = excluded.after`
  assertEquals(await err(M.mrePublish(CHEF, { id: WHEEL, impronta: p.impronta, piano: p.piano }, svc)), 'controllo_fc05')
  assertEquals(await snapAll(), S0, 'niente scritto')
  assertEquals((await db`select count(*)::int n from mre.publications`)[0].n, 0, 'nessuna pubblicazione registrata')
  assert((await db`select 1 from mre.audit where op = 'publish_failed'`).length >= 1, 'il tentativo resta nel registro')
  await db`update bench.fc05 set after = ${a} where recipe_id = ${WHEEL}`
})

Deno.test('P6 la rilettura non torna → tutto annullato (prova con una regola che altera la riga)', async () => {
  const p = await M.mrePublishPreview(CHEF, { id: WHEEL }, svc)
  await db.unsafe(`create function bench.sabota() returns trigger language plpgsql as $$ begin new.quantity := new.quantity + 1; return new; end $$;
    create trigger sabota before update on public.recipe_bom for each row when (new.bom_id = 2173) execute function bench.sabota();`)
  assertEquals(await err(M.mrePublish(CHEF, { id: WHEEL, impronta: p.impronta, piano: p.piano }, svc)), 'rilettura_diversa')
  await db.unsafe(`drop trigger sabota on public.recipe_bom; drop function bench.sabota();`)
  assertEquals(await snapAll(), S0, 'niente scritto')
})

let PUB = 0
Deno.test('P7 PUBBLICA: scrive solo le 2 righe cambiate, copia di sicurezza, versione pubblicata, il resto identico', async () => {
  const before = await rowsOf(WHEEL)
  const p = await M.mrePublishPreview(CHEF, { id: WHEEL }, svc)
  const r = await M.mrePublish(CHEF, { id: WHEEL, impronta: p.impronta, piano: p.piano, reason: 'prova banco' }, svc)
  assertEquals(r.ok, true); PUB = r.publication
  const after = await rowsOf(WHEEL)
  const ch = after.filter((x: any, i: number) => JSON.stringify(x) !== JSON.stringify(before[i]))
  assertEquals(ch.map((x: any) => x.bom_id).sort(), [2173, 2176])
  assertEquals(Number(after.find((x: any) => x.bom_id === 2173).quantity), 10)
  assertEquals(after.find((x: any) => x.bom_id === 2176).item_id, PARM)
  assertEquals(r.checks.rilettura.length, 0); assertEquals(r.checks.fc05_ok, true)
  // every other recipe: identical
  const S1 = JSON.parse(await snapAll())[0], S0p = JSON.parse(S0)[0]
  assertEquals(JSON.stringify(S1.b.filter((x: any) => x.parent_recipe_id !== WHEEL)), JSON.stringify(S0p.b.filter((x: any) => x.parent_recipe_id !== WHEEL)))
  assertEquals(JSON.stringify(S1.r.filter((x: any) => x.id !== WHEEL)), JSON.stringify(S0p.r.filter((x: any) => x.id !== WHEEL)))
  const [pub] = await db`select before, after, fp_before, fp_after from mre.publications where id = ${PUB}`
  assertEquals(pub.before.bom.length, 5); assert(pub.fp_before !== pub.fp_after)
  const o = await M.mreRecipe(CHEF, WHEEL, svc)
  assertEquals(o.draft, null, 'la bozza è diventata la versione pubblicata')
  assert(o.versions.some((v: any) => v.state === 'pubblicata'))
  assertEquals(o.doc.lines.find((l: any) => l.id === 'b2176').ref, PARM, 'la ricetta letta da Brigade è ora quella approvata')
  assert((await db`select 1 from mre.audit where op = 'publish_official'`).length === 1)
  const h = await M.mrePublications(CHEF, { id: WHEEL })                       // RETTIFICA MR-04: the app sees the history and the checks are saved
  assertEquals(h.items.length, 1); assertEquals(Number(h.items[0].id), Number(PUB)); assertEquals(h.items[0].checks.fc05_ok, true)
})

Deno.test('P8 Ripristina: rifiutato se dopo qualcuno ha cambiato la ricetta; poi rimette tutto ESATTAMENTE com\'era', async () => {
  await db`update public.recipe_bom set quantity = 11 where bom_id = 2173`        // Brigade 1 edits after the publication
  assertEquals(await err(M.mreRestoreOfficial(CHEF, { publication: PUB })), 'cambiata_dopo_la_pubblicazione')
  await db`update public.recipe_bom set quantity = 10 where bom_id = 2173`
  assertEquals(await err(M.mreRestoreOfficial(STAFF, { publication: PUB })), 'forbidden')
  const r = await M.mreRestoreOfficial(CHEF, { publication: PUB })
  assertEquals(r.ok, true)
  assertEquals(await snapAll(), S0, 'Brigade identica a prima della pubblicazione')
  assertEquals(await err(M.mreRestoreOfficial(CHEF, { publication: PUB })), 'gia_ripristinata')
})

Deno.test('P9 procedimento: passi scritti in Brigade (numeri per esteso, niente traduzioni inventate) e ripristino esatto', async () => {
  S0 = await snapAll()
  await wheelDraft(true); await review()
  const p = await M.mrePublishPreview(CHEF, { id: WHEEL }, svc)
  assert(p.ok, JSON.stringify(p.refusals)); assert(p.warnings.some((w: any) => w.code === 'passi_senza_traduzione'))
  const r = await M.mrePublish(CHEF, { id: WHEEL, impronta: p.impronta, piano: p.piano }, svc)
  const st = await db`select step_number, instruction_it, instruction_en from public.recipe_steps where recipe_id = ${WHEEL} order by step_number`
  assertEquals(st.length, 2); assertEquals(st[1].instruction_it, 'Sala · Raschia il formaggio: 100 g a porzione.'); assertEquals(st[1].instruction_en, null)
  const [rec] = await db`select procedure, procedure_en, ingredients from public.recipes where id = ${WHEEL}`
  assert(rec.procedure.includes('100 g a porzione')); assertEquals(rec.procedure_en, null)
  assertEquals(rec.ingredients.length, 5, 'scheda di Brigade 1 allineata alla distinta')
  await M.mreRestoreOfficial(CHEF, { publication: r.publication })
  assertEquals(await snapAll(), S0, 'passi, procedimento, scheda e distinta: identici a prima')
})

Deno.test('P11 unità libere dall\'Editor: «once» → oz (peso), «chili» → kg; le unità scritte restano come sono', async () => {
  const o = await M.mreRecipe(CHEF, WHEEL, svc), doc = structuredClone(o.doc)
  doc.lines.find((l: any) => l.id === 'b2175').unit = 'once'; doc.lines.find((l: any) => l.id === 'b2175').qty = 1
  doc.lines.find((l: any) => l.id === 'b2173').unit = 'chili'; doc.lines.find((l: any) => l.id === 'b2173').qty = 0.01
  await M.mreSaveDraft(CHEF, { id: WHEEL, doc }, svc)
  const d = (await M.mreRecipe(CHEF, WHEEL, svc)).draft
  assertEquals(d.lines.find((l: any) => l.id === 'b2175').unit, 'oz', 'rum: once → oz, un peso (Chef 22/10 21:31Z)')
  assertEquals(d.lines.find((l: any) => l.id === 'b2173').unit, 'kg', 'burro: chili → kg')
  assertEquals(d.lines.find((l: any) => l.id === 'b2174').unit, 'nests', 'le altre unità restano come sono')
})

Deno.test('P12 T.E.C.: «2 once di rum» diventa una riga valida (2 oz = 56,7 g) e lo dice', async () => {
  const L = await M.tecLeggi(CHEF, { id: WHEEL }, svc)
  const mods = [{ tipo: 'cambia_quantita', riga: 'b2175', quantita: 2, unita: 'once' }]
  const pr = await M.tecProva(CHEF, { id: WHEEL, modifiche: mods }, svc)
  assertEquals(pr.ok, true, JSON.stringify(pr.errori)); assert(pr.avvisi.some((a: string) => /once → oz/.test(a)), JSON.stringify(pr.avvisi))
  const sv = await M.tecSalvaBozza(CHEF, { id: WHEEL, modifiche: mods, impronta: L.impronta }, svc)
  assertEquals(sv.ok, true)
  const d = (await M.mreRecipe(CHEF, WHEEL, svc)).draft
  const rum = d.lines.find((l: any) => l.id === 'b2175'); assertEquals([rum.qty, rum.unit], [2, 'oz'])
})

Deno.test('P13 prezzo mancante (CD-078): si pubblica con il food cost parziale, anche con il prezzo di fiducia sul rum', async () => {
  S0 = await snapAll()
  // the Wheel Pasta as the Chef wrote it: burro 10 g, parmigiano, rum 30 ml WITHOUT an invoice price
  const o = await M.mreRecipe(CHEF, WHEEL, svc), doc = structuredClone(o.official || o.doc)
  doc.lines.find((l: any) => l.id === 'b2173').qty = 10; doc.lines.find((l: any) => l.id === 'b2176').ref = PARM
  const rum = doc.lines.find((l: any) => l.id === 'b2175'); rum.qty = 30; rum.unit = 'ml'; delete rum.est
  await M.mreSaveDraft(CHEF, { id: WHEEL, doc }, svc); await review()
  const p = await M.mrePublishPreview(CHEF, { id: WHEEL }, svc)
  assertEquals(p.ok, true, JSON.stringify(p.refusals)); assert(p.cost.after.missing > 0 && p.warnings.some((w: any) => w.code === 'food_cost_parziale'), 'food cost parziale: segnalato, non bloccato')
  // FC05 counts only invoice prices: it moves by what the engine moves WITHOUT the Chef's estimate
  const B = 7, dFc = (p.cost.after.food + p.cost.after.pack) - (p.cost.before.food + p.cost.before.pack)
  await db`insert into bench.fc05 values (${WHEEL}, ${B}, ${B + dFc}) on conflict (recipe_id) do update set before = excluded.before, after = excluded.after`
  const r1 = await M.mrePublish(CHEF, { id: WHEEL, impronta: p.impronta, piano: p.piano }, svc)
  assertEquals(r1.ok, true, 'senza prezzo del rum: pubblicata')
  await M.mreRestoreOfficial(CHEF, { publication: r1.publication }); assertEquals(await snapAll(), S0)
  // same recipe + the Chef's trust price on the rum: still published, FC05 still moves only by the invoice prices
  rum.est = { usd: 25, qty: 750, unit: 'ml' }
  await new Promise(r => setTimeout(r, 20)); await M.mreSaveDraft(CHEF, { id: WHEEL, doc }, svc); await review()
  const p2 = await M.mrePublishPreview(CHEF, { id: WHEEL }, svc)
  assertEquals(p2.ok, true); assert(p2.warnings.some((w: any) => w.code === 'prezzo_di_fiducia_solo_lab'))
  const r2 = await M.mrePublish(CHEF, { id: WHEEL, impronta: p2.impronta, piano: p2.piano }, svc).catch((e: any) => ({ ok: false, code: e.code }))
  assertEquals(r2.ok, true, 'con il prezzo di fiducia: pubblicata (era: ' + (r2 as any).code + ')')
  await M.mreRestoreOfficial(CHEF, { publication: (r2 as any).publication }); assertEquals(await snapAll(), S0)
  await db`delete from bench.fc05 where recipe_id = ${WHEEL}`
})

let NEW_A = '', NEW_B = '', PUB_A = 0
const newDoc = async (id: string) => structuredClone((await M.mreRecipe(CHEF, id, svc)).draft)
Deno.test('P14 «Nuova ricetta»: solo lo Chef; un nome che c\'è già in Brigade è rifiutato; poi una bozza vuota di laboratorio', async () => {
  S0 = await snapAll()
  assertEquals(await err(M.mreNew(STAFF, { title: 'Prova Nuova' }, svc)), 'forbidden')
  assertEquals(await err(M.mreNew(CHEF, { title: '  wheel PASTA ' }, svc)), 'titolo_esistente')
  assertEquals(await err(M.mreNew(CHEF, { title: 'x' }, svc)), 'titolo_mancante')
  const r = await M.mreNew(CHEF, { title: 'Pasta Nuova del Banco' }, svc); NEW_A = r.id
  const o = await M.mreRecipe(CHEF, NEW_A, svc)
  assertEquals(o.source, 'lab'); assertEquals(o.publish_locked, false); assertEquals(o.draft.lines.length, 0)
  assertEquals(await snapAll(), S0, 'niente scritto in Brigade')
  assertEquals(await err(M.mrePublishPreview(CHEF, { id: NEW_A }, svc)), 'serve_verificata')
  await M.mreReview(CHEF, { id: NEW_A }, svc)
  const p = await M.mrePublishPreview(CHEF, { id: NEW_A }, svc)
  assertEquals(p.ok, false); assert(p.refusals.some((x: any) => x.code === 'nessuna_riga'))
})

Deno.test('P15 ricetta nuova con ingredienti, sottoricetta, passo e porzioni: anteprima giusta, niente scritto', async () => {
  const w = await M.mreRecipe(CHEF, WHEEL, svc), sub = w.doc.lines.find((l: any) => l.kind === 'recipe')
  const d = await newDoc(NEW_A)
  d.yield = { portions: 4 }
  d.lines = [{ id: 'n1', kind: 'ingredient', ref: PARM, qty: 100, unit: 'g', per: 'lot', role: 'produzione' },
             { id: 'n2', kind: 'recipe', ref: sub.ref, qty: 40, unit: 'g', per: 'lot', role: 'produzione' }]
  d.steps = [{ it: 'Grattugia {{n1}} g di parmigiano.', en: '', es: '', src: 'it', tr: { it: 'chef' } }]
  await M.mreSaveDraft(CHEF, { id: NEW_A, doc: d }, svc); await M.mreReview(CHEF, { id: NEW_A }, svc)
  const p = await M.mrePublishPreview(CHEF, { id: NEW_A }, svc)
  assertEquals(p.ok, true, JSON.stringify(p.refusals))
  assert(/Ricetta NUOVA in Brigade: «Pasta Nuova del Banco»/.test(p.summary[0]), p.summary.join(' | '))
  assert(p.warnings.some((x: any) => x.code === 'campi_ufficio_dopo'))
  assertEquals(p.impronta, 'nuova:' + NEW_A); assertEquals(p.fc05_before, null)
  assertEquals(await snapAll(), S0)
  // a second new recipe that uses the first one, still in the lab → refused until the first is in Brigade
  NEW_B = (await M.mreNew(CHEF, { title: 'Piatto con la Pasta Nuova' }, svc)).id
  const db2 = await newDoc(NEW_B); db2.yield = { portions: 1 }; db2.lines = [{ id: 'm1', kind: 'recipe', ref: NEW_A, qty: 1, unit: 'pz', per: 'lot', role: 'produzione' }]
  await M.mreSaveDraft(CHEF, { id: NEW_B, doc: db2 }, svc); await M.mreReview(CHEF, { id: NEW_B }, svc)
  const pb = await M.mrePublishPreview(CHEF, { id: NEW_B }, svc)
  assertEquals(pb.ok, false); assert(pb.refusals.some((x: any) => x.code === 'sottoricetta_non_in_brigade'), JSON.stringify(pb.refusals))
})

Deno.test('P16 FC05 non torna sulla ricetta nuova → tutto annullato: la ricetta NON esiste in Brigade', async () => {
  const p = await M.mrePublishPreview(CHEF, { id: NEW_A }, svc)
  await db`insert into bench.fc05 values (${NEW_A}, null, ${999}) on conflict (recipe_id) do update set before = excluded.before, after = excluded.after`
  assertEquals(await err(M.mrePublish(CHEF, { id: NEW_A, impronta: p.impronta, piano: p.piano }, svc)), 'controllo_fc05')
  assertEquals(await snapAll(), S0, 'niente creato')
  assertEquals((await db`select count(*)::int n from public.recipes where id = ${NEW_A}`)[0].n, 0)
})

Deno.test('P17 PUBBLICA la ricetta nuova: riga ricetta + 2 righe di distinta + 1 passo, riletti uguali; diventa una ricetta di Brigade', async () => {
  const p = await M.mrePublishPreview(CHEF, { id: NEW_A }, svc)
  const strictAfter = p.cost.after.food + p.cost.after.pack
  await db`update bench.fc05 set after = ${strictAfter} where recipe_id = ${NEW_A}`
  assertEquals(await err(M.mrePublish(CHEF, { id: NEW_A, impronta: 'x', piano: p.piano }, svc)), 'ricetta_cambiata')
  const r = await M.mrePublish(CHEF, { id: NEW_A, impronta: p.impronta, piano: p.piano, reason: 'prova banco' }, svc)
  assertEquals(r.ok, true); PUB_A = r.publication
  assertEquals(r.checks.rilettura.length, 0); assertEquals(r.checks.fc05_ok, true)
  const [rec] = await db`select title, base_servings, procedure from public.recipes where id = ${NEW_A}`
  assertEquals(rec.title, 'Pasta Nuova del Banco'); assertEquals(Number(rec.base_servings), 4); assertEquals(rec.procedure, 'Grattugia 100 g di parmigiano.')
  const rows = await rowsOf(NEW_A)
  assertEquals(rows.map((x: any) => [x.component_type, Number(x.quantity), x.unit]), [['ITEM', 100, 'g'], ['RECIPE', 40, 'g']])
  assertEquals((await db`select count(*)::int n from public.recipe_steps where recipe_id = ${NEW_A}`)[0].n, 1)
  const S1 = JSON.parse(await snapAll())[0], S0p = JSON.parse(S0)[0]
  assertEquals(JSON.stringify(S1.b.filter((x: any) => x.parent_recipe_id !== NEW_A)), JSON.stringify(S0p.b), 'le altre distinte identiche')
  assertEquals(JSON.stringify(S1.r.filter((x: any) => x.id !== NEW_A)), JSON.stringify(S0p.r), 'le altre ricette identiche')
  const o = await M.mreRecipe(CHEF, NEW_A, svc)
  assertEquals(o.source, 'official'); assertEquals(o.draft, null)
  assert((await M.mreList(CHEF, svc)).recipes.some((x: any) => x.id === NEW_A && !x.lab_only))
  assertEquals((await M.mrePublications(CHEF, { id: NEW_A })).items[0].created, true)
  // the second recipe can now use it
  const pb = await M.mrePublishPreview(CHEF, { id: NEW_B }, svc)
  assert(!pb.refusals.some((x: any) => x.code === 'sottoricetta_non_in_brigade'), JSON.stringify(pb.refusals))
  // the same name a second time → refused by the database too
  assertEquals(await err(M.mreNew(CHEF, { title: 'pasta nuova del banco' }, svc)), 'titolo_esistente')
})

Deno.test('P18 RITIRA: rifiutato se in Brigade qualcosa la usa (una prep); poi la cancella con distinta e passi, il resto identico', async () => {
  await db`insert into public.prep_tasks (id, name, unit, recipe_id) values (990001, 'Prep della pasta nuova', 'g', ${NEW_A})`
  const e1 = await err(M.mreRestoreOfficial(CHEF, { publication: PUB_A }))
  assertEquals(e1, 'gia_usata')
  await db`delete from public.prep_tasks where id = 990001`
  await db`update public.recipe_bom set quantity = 101 where parent_recipe_id = ${NEW_A} and component_type = 'ITEM'`
  assertEquals(await err(M.mreRestoreOfficial(CHEF, { publication: PUB_A })), 'cambiata_dopo_la_pubblicazione')
  await db`update public.recipe_bom set quantity = 100 where parent_recipe_id = ${NEW_A} and component_type = 'ITEM'`
  const r = await M.mreRestoreOfficial(CHEF, { publication: PUB_A })
  assertEquals(r.withdrawn, true)
  assertEquals(await snapAll(), S0, 'Brigade identica a prima della ricetta nuova')
  const o = await M.mreRecipe(CHEF, NEW_A, svc)
  assertEquals(o.source, 'lab', 'torna una proposta del laboratorio')
  assertEquals(await err(M.mreRestoreOfficial(CHEF, { publication: PUB_A })), 'gia_ripristinata')
  await db`delete from bench.fc05 where recipe_id = ${NEW_A}`
})

const TEC = { id: 41, name: 'T.E.C. per Max', role: 'assistente' as any }
let TEC_NEW = ''
Deno.test('P19 T.E.C. salva una bozza su una ricetta ufficiale: la lista dello Chef la segna «da T.E.C.», anche dopo che lo Chef la corregge', async () => {
  S0 = await snapAll()
  const o = await M.mreRecipe(CHEF, WHEEL, svc)
  await M.mreSaveDraft(CHEF, { id: WHEEL, doc: o.doc }, svc)                // start: a Chef draft identical to Brigade (not from T.E.C.)
  let row = (await M.mreList(CHEF, svc)).recipes.find((r: any) => r.id === WHEEL)
  assertEquals(!!row.da_tec, false, 'bozza dello Chef: non «da T.E.C.»')
  const L = await M.tecLeggi(TEC, { id: WHEEL }, svc)
  const sv = await M.tecSalvaBozza(TEC, { id: WHEEL, impronta: L.impronta, modifiche: [{ tipo: 'cambia_quantita', riga: 'b2173', quantita: 12, unita: 'g' }] }, svc)
  assertEquals(sv.ok, true)
  row = (await M.mreList(CHEF, svc)).recipes.find((r: any) => r.id === WHEEL)
  assertEquals(row.da_tec, true, 'dopo T.E.C.: «da T.E.C.»'); assertEquals(row.draft, true)
  const staffRow = (await M.mreList(STAFF, svc)).recipes.find((r: any) => r.id === WHEEL)
  assertEquals(staffRow.da_tec, undefined, 'il personale non vede le bozze')
  const d = structuredClone((await M.mreRecipe(CHEF, WHEEL, svc)).draft)
  assert(/^T\.E\.C\. per Max: /.test((await M.mreRecipe(CHEF, WHEEL, svc)).versions.find((v: any) => v.state === 'bozza').reason), 'nella scheda: cosa ha scritto T.E.C.')
  d.lines.find((l: any) => l.id === 'b2173').qty = 10                        // the Chef corrects it
  await M.mreSaveDraft(CHEF, { id: WHEEL, doc: d }, svc)
  row = (await M.mreList(CHEF, svc)).recipes.find((r: any) => r.id === WHEEL)
  assertEquals(row.da_tec, true, 'corretta dallo Chef: resta «da T.E.C.» finché non è pubblicata o scartata')
  assertEquals(await snapAll(), S0, 'T.E.C. non scrive niente in Brigade')
})

Deno.test('P20 la bozza di T.E.C. si verifica e si pubblica come sempre; dopo, non è più «da T.E.C.»', async () => {
  await M.mreReview(CHEF, { id: WHEEL }, svc)
  const p = await M.mrePublishPreview(CHEF, { id: WHEEL }, svc)
  assertEquals(p.ok, true, JSON.stringify(p.refusals)); assert(p.summary.some((x: string) => /Diced Butter: 20 → 10/.test(x)), p.summary.join(' | '))
  const r = await M.mrePublish(CHEF, { id: WHEEL, impronta: p.impronta, piano: p.piano }, svc)
  assertEquals(r.ok, true)
  const row = (await M.mreList(CHEF, svc)).recipes.find((x: any) => x.id === WHEEL)
  assertEquals(!!row.da_tec, false); assertEquals(!!row.draft, false)
  await M.mreRestoreOfficial(CHEF, { publication: r.publication }); assertEquals(await snapAll(), S0)
})

Deno.test('P21 T.E.C. propone una ricetta NUOVA: compare nell\'elenco «da T.E.C.», lo Chef la verifica e la crea in Brigade; ritirata resta nell\'elenco', async () => {
  const pr = await M.tecPropostaNuova(TEC, { titolo: 'Salsa Nuova di T.E.C.', righe: [{ ref: PARM, genere: 'ingredient', quantita: 200, unita: 'g' }], resa: { porzioni: 4 } }, svc)
  assertEquals(pr.ok, true); TEC_NEW = pr.ricetta_id
  let row = (await M.mreList(CHEF, svc)).recipes.find((r: any) => r.id === TEC_NEW)
  assert(row && row.lab_only && row.da_tec, 'proposta di T.E.C. nell\'elenco dello Chef, segnata')
  assertEquals((await M.mreList(STAFF, svc)).recipes.some((r: any) => r.id === TEC_NEW), false, 'il personale non la vede')
  assertEquals(await err(M.mrePublish(TEC, { id: TEC_NEW }, svc)), 'forbidden')
  await M.mreReview(CHEF, { id: TEC_NEW }, svc)
  const p = await M.mrePublishPreview(CHEF, { id: TEC_NEW }, svc)
  assertEquals(p.ok, true, JSON.stringify(p.refusals))
  await db`insert into bench.fc05 values (${TEC_NEW}, null, ${p.cost.after.food + p.cost.after.pack}) on conflict (recipe_id) do update set after = excluded.after`
  const r = await M.mrePublish(CHEF, { id: TEC_NEW, impronta: p.impronta, piano: p.piano }, svc)
  assertEquals(r.ok, true)
  assertEquals((await db`select title from public.recipes where id = ${TEC_NEW}`)[0].title, 'Salsa Nuova di T.E.C.')
  const w = await M.mreRestoreOfficial(CHEF, { publication: r.publication }); assertEquals(w.withdrawn, true)
  row = (await M.mreList(CHEF, svc)).recipes.find((x: any) => x.id === TEC_NEW)
  assert(row && row.lab_only && row.title === 'Salsa Nuova di T.E.C.', 'ritirata: resta nell\'elenco come proposta (prima spariva)')
  assertEquals(await snapAll(), S0)
  await db`delete from bench.fc05 where recipe_id = ${TEC_NEW}`
})

Deno.test('P10 niente da pubblicare / ricetta solo di laboratorio', async () => {
  const o = await M.mreRecipe(CHEF, WHEEL, svc)
  await M.mreSaveDraft(CHEF, { id: WHEEL, doc: o.doc }, svc); await review()     // draft identical to the official recipe
  const p = await M.mrePublishPreview(CHEF, { id: WHEEL }, svc)
  assertEquals(p.empty, true); assertEquals(p.ok, false)
  assertEquals(await err(M.mrePublish(CHEF, { id: WHEEL, impronta: p.impronta, piano: p.piano }, svc)), 'niente_da_pubblicare')
  off(); await db.end()
})
