// B-63 (Max 22/10): T.E.C. scrive in bozza. Lanciato da tests/tec/tec_bench.mjs (Postgres usa-e-getta con lo schema di laboratorio vero).
// Le tabelle ufficiali di Brigade sono finte: rispondono alle letture dalla fotografia e FANNO FALLIRE la prova a qualsiasi scrittura.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import * as M from '../../supabase/functions/brigade-app-api/mre.ts'
import postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js'

const S = JSON.parse(Deno.readTextFileSync(Deno.env.get('SNAP')!))
const db = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 1 })
const writes: string[] = []
const TABLES: Record<string, any[]> = { recipes: S.recipes, recipe_bom: S.bom, recipe_steps: S.steps, prep_tasks: S.prep, recipe_yield: S.yield,
  users: [{ id: 1, name: 'Max' }, { id: 38, name: 'Pablo' }, { id: 99, name: 'T.E.C. per Max' }] }
const ingName = Object.fromEntries(Object.values(S.facts).filter(Boolean).map((f: any) => [f.id, { name: f.name, base_unit: f.base_unit }]))
function from(t: string) {
  let rows = (TABLES[t] || []).slice(), join = false
  const q: any = {
    select(cols: string) { join = /ingredients\(/.test(cols); return q },
    in(c: string, v: any[]) { const s = new Set(v.map(String)); rows = rows.filter(r => s.has(String(r[c]))); return q },
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
const TEC = { id: 99, name: 'T.E.C. per Max', role: 'assistente' } as any
const SPIN = '9cec677b-55d6-4329-9dae-5dd4d489e147'
const official0 = JSON.stringify(TABLES)
const err = async (p: Promise<any>) => { try { await p; return null } catch (e: any) { return e.status || e.code || e.message } }
const altroIngrediente = Object.values(S.facts).find((f: any) => f && !S.bom.some((b: any) => b.parent_recipe_id === SPIN && b.item_id === f.id) && /^[A-Z]/.test(f.name)) as any

Deno.test('T1 T.E.C. legge la Butter Spinach: righe, nomi, impronta, nessun prezzo', async () => {
  const L = await M.tecLeggi(TEC, { id: SPIN }, svc)
  assertEquals(L.fonte, 'ufficiale'); assertEquals(L.impronta.length, 32)
  const burro = L.righe.find((r: any) => r.nome === 'Butter'); assertEquals(burro.quantita, 440)
  assert(!JSON.stringify(L).includes('price'), 'nessun prezzo nella risposta')
})
Deno.test('T2 prova a secco: frase prima → dopo, NIENTE salvato', async () => {
  const L = await M.tecLeggi(TEC, { id: SPIN }, svc), riga = L.righe.find((r: any) => r.nome === 'Butter').riga
  const n0 = (await db`select count(*)::int n from mre.versions`)[0].n
  const P = await M.tecProva(TEC, { id: SPIN, impronta: L.impronta, modifiche: [{ tipo: 'cambia_quantita', riga, quantita: 400 }] }, svc)
  assertEquals(P.ok, true); assertEquals(P.frasi, ['Butter: 440 g → 400 g']); assertEquals(P.impronta_cambiata, false)
  assertEquals((await db`select count(*)::int n from mre.versions`)[0].n, n0)
})
Deno.test('T3 salva bozza: impronta sbagliata → 409, giusta → bozza firmata T.E.C., rilettura vera', async () => {
  const L = await M.tecLeggi(TEC, { id: SPIN }, svc), riga = L.righe.find((r: any) => r.nome === 'Butter').riga
  const mod = [{ tipo: 'cambia_quantita', riga, quantita: 400 }]
  assertEquals(await err(M.tecSalvaBozza(TEC, { id: SPIN, impronta: 'x'.repeat(32), modifiche: mod }, svc)), 409)
  const R = await M.tecSalvaBozza(TEC, { id: SPIN, impronta: L.impronta, modifiche: mod }, svc)
  assertEquals(R.ok, true); assertEquals(R.cambiato_davvero, ['Butter: 440 g → 400 g']); assertEquals(R.salvato_da, 'T.E.C. per Max')
  const [v] = await db`select state, created_by, reason from mre.versions where recipe_id = ${SPIN} and state = 'bozza'`
  assertEquals(Number(v.created_by), 99); assert(/^T\.E\.C\. per Max: Butter: 440 g → 400 g/.test(v.reason))
  const [a] = await db`select user_id, op, detail from mre.audit where recipe_id = ${SPIN} and op = 'save_draft' order by id desc limit 1`
  assertEquals(Number(a.user_id), 99); assertEquals(a.detail.da, 'T.E.C.'); assertEquals(a.detail.per, 'Max')
  // la vecchia impronta non vale più: c'è una bozza nuova
  assertEquals(await err(M.tecSalvaBozza(TEC, { id: SPIN, impronta: L.impronta, modifiche: mod }, svc)), 409)
  // Max vede la bozza nell'Editor, come le sue
  const C = await M.mreRecipe(CHEF, SPIN, svc)
  assertEquals(C.draft.lines.find((l: any) => l.id === riga).qty, 400)
  assertEquals(C.versions[0].by, 'T.E.C. per Max')
})
Deno.test('T4 passo nuovo in italiano: numero collegato e tradotto in inglese e spagnolo', async () => {
  const L = await M.tecLeggi(TEC, { id: SPIN }, svc)
  const R = await M.tecSalvaBozza(TEC, { id: SPIN, impronta: L.impronta, modifiche: [{ tipo: 'aggiungi_passo', testo: 'Sciogliere 400 g di burro e aggiungere gli spinaci.' }] }, svc)
  assertEquals(R.ok, true)
  const [v] = await db`select doc from mre.versions where recipe_id = ${SPIN} and state = 'bozza'`
  const st = v.doc.steps[v.doc.steps.length - 1]
  assert(/\{\{b1753\}\} g/.test(st.it), 'numero collegato alla riga del burro: ' + st.it)
  assert(st.en.startsWith('[en]') && st.es.startsWith('[es]') && st.tr.en === 'auto' && st.tr.es === 'auto', JSON.stringify(st))
  assert(/\{\{b1753\}\}/.test(st.en) && /\{\{b1753\}\}/.test(st.es), 'il numero collegato resta anche nelle traduzioni')
})
Deno.test('T5 riga nuova e resa; ingrediente inesistente rifiutato', async () => {
  const L = await M.tecLeggi(TEC, { id: SPIN }, svc)
  const R = await M.tecSalvaBozza(TEC, { id: SPIN, impronta: L.impronta, modifiche: [{ tipo: 'aggiungi_riga', ref: altroIngrediente.id, quantita: 2, unita: 'g' }, { tipo: 'cambia_resa', porzioni: 24 }] }, svc)
  assert(R.cambiato_davvero.includes(`Nuova riga: ${altroIngrediente.name} 2 g`), JSON.stringify(R.cambiato_davvero))
  const L2 = await M.tecLeggi(TEC, { id: SPIN }, svc)
  assertEquals(await err(M.tecProva(TEC, { id: SPIN, impronta: L2.impronta, modifiche: [{ tipo: 'aggiungi_riga', ref: '99999999-2222-4333-8444-555555555555', quantita: 1, unita: 'g' }] }, svc)), null)
  const P = await M.tecProva(TEC, { id: SPIN, impronta: L2.impronta, modifiche: [{ tipo: 'aggiungi_riga', ref: '99999999-2222-4333-8444-555555555555', quantita: 1, unita: 'g' }] }, svc)
  assertEquals(P.ok, false); assert(P.errori.some((e: string) => /ingrediente_non_trovato/.test(e)))
})
Deno.test('T6 regole di Max: T.E.C. non pubblica, non cancella, non ripristina; lo staff non usa T.E.C.', async () => {
  assertEquals(await err(M.mrePublish(TEC, { id: SPIN })), 403)
  assertEquals(await err(M.mreDiscard(TEC, { id: SPIN })), 403)
  assertEquals(await err(M.mreRestore(TEC, { id: SPIN, version: 1 })), 403)
  assertEquals(await err(M.tecSalvaBozza(STAFF as any, { id: SPIN, impronta: 'x', modifiche: [] }, svc)), 403)
  assertEquals(await err(M.tecLeggi(STAFF as any, { id: SPIN }, svc)), 403)
  const L = await M.tecLeggi(TEC, { id: SPIN }, svc)
  const P = await M.tecProva(TEC, { id: SPIN, impronta: L.impronta, modifiche: [{ tipo: 'togli_riga', riga: 'b1753' }] }, svc)
  assertEquals(P.ok, false)
})
Deno.test('T7 proposta di ricetta nuova: bozza di laboratorio, la vede solo Max', async () => {
  const R = await M.tecPropostaNuova(TEC, { titolo: 'Spinaci al burro di prova T.E.C.', righe: [{ ref: altroIngrediente.id, quantita: 100, unita: 'g' }], passi: ['Cuocere tutto insieme per 5 minuti.'], resa: { porzioni: 4 } }, svc)
  assertEquals(R.ok, true)
  const [r] = await db`select source from mre.recipes where id = ${R.ricetta_id}`
  assertEquals(r.source.lab_only, true); assertEquals(r.source.proposta_da, 'T.E.C.')
  const Lc = await M.mreList(CHEF, svc), Ls = await M.mreList(STAFF, svc)
  assert(Lc.recipes.some((x: any) => x.id === R.ricetta_id && x.lab_only), 'Max la vede')
  assert(!Ls.recipes.some((x: any) => x.id === R.ricetta_id), 'lo staff no')
  assertEquals(await err(M.tecPropostaNuova(TEC, { titolo: 'x', righe: [] }, svc)), 400)
})
Deno.test('T8 le tabelle ufficiali di Brigade non sono mai state scritte', async () => {
  assertEquals(writes, []); assertEquals(JSON.stringify(TABLES), official0)
  await db.end()
})
