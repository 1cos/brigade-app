// C-62: MISURA delle operazioni di T.E.C. — quante richieste al database fa ognuna (REST = tabelle ufficiali via supabase-js,
// SQL = laboratorio mre via postgres) e quanto tempo di calcolo. Le richieste SQL si contano dal registro di Postgres (marcatori MARK:).
// Lanciato da tests/tec/tec_bench_misure.mjs con PGLOG=<file>. Scrive il risultato in $MISURE (JSON).
import * as M from '../../supabase/functions/brigade-app-api/mre.ts'
import postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js'

const S = JSON.parse(Deno.readTextFileSync(Deno.env.get('SNAP')!))
const db = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 1 })
const LAT = Number(Deno.env.get('LAT_REST') || 0)   // ritardo finto per ogni richiesta REST (ms), per stimare la produzione
const TABLES: Record<string, any[]> = { recipes: S.recipes, recipe_bom: S.bom, recipe_steps: S.steps, prep_tasks: S.prep, recipe_yield: S.yield,
  users: [{ id: 1, name: 'Max' }, { id: 99, name: 'T.E.C. per Max' }] }
const ingName = Object.fromEntries(Object.values(S.facts).filter(Boolean).map((f: any) => [f.id, { name: f.name, base_unit: f.base_unit }]))
let rest = 0
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
    then(res: any, rej: any) { rest++; const data = join ? rows.map(r => Object.assign({}, r, { ingredients: r.item_id ? ingName[r.item_id] || null : null })) : rows
      return new Promise(ok => setTimeout(ok, LAT)).then(() => ({ data: structuredClone(data), error: null })).then(res, rej) },
  }
  for (const w of ['insert', 'update', 'upsert', 'delete']) q[w] = () => { throw new Error('WRITE ON OFFICIAL TABLE ' + t) }
  return q
}
const svc = { from, rpc: () => { throw new Error('rpc') } }
const TEC = { id: 99, name: 'T.E.C. per Max', role: 'assistente' } as any
const RICETTE: Record<string, string> = { 'La N° 4': '20ce4798-9d46-440a-988f-6efc6eecab56', 'Cacio e Pepe': 'f174c32c-4c00-438a-a35a-40e2e1d02e8b', 'Butter Spinach': '9cec677b-55d6-4329-9dae-5dd4d489e147' }
const out: any[] = []
const misura = async (nome: string, fn: () => Promise<any>) => {
  await db`select ${'MARK:inizio:' + nome}::text`
  rest = 0; const t0 = performance.now(); const r = await fn(); const ms = Math.round(performance.now() - t0)
  await db`select ${'MARK:fine:' + nome}::text`
  out.push({ nome, rest, ms, risposta: (() => { const { ms_server, ricetta, ...x } = r || {}; return x })() }); return r
}
Deno.test('C-62 misure', async () => {
  for (const [titolo, id] of Object.entries(RICETTE)) {
    const L = await misura(`${titolo} | tec_leggi`, () => M.tecLeggi(TEC, { id }, svc))
    const riga = L.righe[0]?.riga
    await misura(`${titolo} | tec_prova`, () => M.tecProva(TEC, { id, impronta: L.impronta, modifiche: [{ tipo: 'cambia_quantita', riga, quantita: Number(L.righe[0].quantita) + 1 }] }, svc))
    const U = await misura(`${titolo} | tec_prova con nome (1 chiamata)`, () => M.tecProva(TEC, { id, modifiche: [{ tipo: 'cambia_quantita', nome: L.righe[0].nome, quantita: Number(L.righe[0].quantita) + 1 }] }, svc))
    out[out.length - 1].ok = U.ok; out[out.length - 1].errori = U.errori
  }
  Deno.writeTextFileSync(Deno.env.get('MISURE')!, JSON.stringify(out))
  await db.end()
})
