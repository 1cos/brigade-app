// R1.11 — runs the REAL server code (kitchen.ts smartChecklist) in Deno against an in-memory fake of the Supabase client
// filled from READ-ONLY dumps (answers capped at 1000 rows like the real API). Checks: Chef = engine, staff blocked,
// level always 1 whatever the request says, cook view stripped, past days Chef only.
// Usage: deno run -A tests/checklist_server_offline.ts
import * as KIT from '../supabase/functions/brigade-app-api/kitchen.ts'
import * as CL from '../supabase/functions/_shared/checklist_core.js'
const D = `${Deno.env.get('HOME')}/brigade-audit-work/b52/data`
const L = (n: string) => { const j = JSON.parse(Deno.readTextFileSync(`${D}/${n}.json`)); return Array.isArray(j) ? j : j.rows }
let uid = 0; const nid = () => 'x' + (++uid).toString().padStart(8, '0')
const sales = L('k_sales_daily_all')
const T: Record<string, any[]> = {
  recipe_bom: L('k_bom').map((b: any) => Object.assign({ bom_id: nid() }, b)), recipes: L('k_rec'), recipe_yield: L('k_yld'),
  pos_sales_by_item: sales.filter((s: any) => s.kind === 'item').map((r: any) => ({ id: nid(), menu_item: r.name, quantity: Number(r.qty), sale_date: r.date, is_historical: false, sales_category: 'Food' })),
  pos_modifiers: sales.filter((s: any) => s.kind === 'modifier').map((r: any) => ({ id: nid(), modifier: r.name, quantity_sold: Number(r.qty), sale_date: r.date, is_historical: false })),
  events: L('k_events').map((e: any) => ({ name: e.name, event_date: e.date, guest_count: e.guests, status: e.status })),
}
const writes: string[] = []
function from(t: string) {
  let rows = (T[t] || []).slice(), cols: string[] | null = null, rng: [number, number] | null = null
  const b: any = {
    select(c: string) { cols = c.split(',').map(x => x.trim()); return b },
    eq(k: string, v: any) { rows = rows.filter(r => r[k] === v); return b }, gte(k: string, v: any) { rows = rows.filter(r => r[k] != null && String(r[k]) >= String(v)); return b },
    lte(k: string, v: any) { rows = rows.filter(r => r[k] != null && String(r[k]) <= String(v)); return b },
    not(k: string, op: string, v: any) { rows = rows.filter(r => op === 'is' ? (v === null ? r[k] != null : r[k] !== v) : true); return b },
    order(k: string) { rows.sort((x, y) => String(x[k] ?? '') < String(y[k] ?? '') ? -1 : String(x[k] ?? '') > String(y[k] ?? '') ? 1 : 0); return b },
    range(a: number, z: number) { rng = [a, z]; return b },
    insert() { writes.push('insert ' + t); return b }, update() { writes.push('update ' + t); return b }, upsert() { writes.push('upsert ' + t); return b }, delete() { writes.push('delete ' + t); return b },
    then(res: any, rej: any) { let out = rows; if (rng) out = out.slice(rng[0], rng[1] + 1); out = out.slice(0, 1000)
      return Promise.resolve({ data: out.map(r => cols ? Object.fromEntries(cols.map(c => [c, r[c] ?? null])) : r), error: null }).then(res, rej) },
  }
  return b
}
const svc = { from }
let pass = 0, fail = 0; const ok = (c: boolean, m: string) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++ }
const NOW = new Date('2026-10-16T15:00:00Z'), chef = { id: 1, role: 'chef' } as any, staff = { id: 38, role: 'staff' } as any
const strip = (x: any) => JSON.parse(JSON.stringify(x, (k, v) => typeof v === 'number' ? Math.round(v * 10) / 10 : v))
const engine = (day: string, past: boolean, station = 'pasta') => {
  const since = new Date(Date.parse(day + 'T12:00:00Z') - 42 * 86400000).toISOString().slice(0, 10)
  const rows = sales.filter((s: any) => s.date >= since).map((s: any) => ({ date: s.date, kind: s.kind, name: s.name, qty: Number(s.qty) }))
  const open = [...new Set(T.pos_sales_by_item.filter(r => r.sale_date >= since).map(r => r.sale_date))].sort()
  return CL.stationPriorities({ station, today: day, bom: T.recipe_bom, recipes: T.recipes, yields: T.recipe_yield, sales: rows.filter((r: any) => r.date < day), openDates: open.filter(d => d < day), salesAll: past ? rows : null, events: [] })
}
for (const day of [null, '2026-10-09', '2026-10-10', '2026-10-12']) {
  const g: any = await KIT.smartChecklist(chef, day ? { station: 'pasta', day } : { station: 'pasta' }, svc, { now: NOW })
  const e = engine(day || '2026-10-16', !!day)
  ok(JSON.stringify(strip(g.items)) === JSON.stringify(strip(e.items)), `Chef ${day || 'today 16/10'}: server = engine (${g.items.map((c: any) => `${c.key} ${c.qty}${c.actual != null ? ' sold ' + c.actual : ''}`).join(', ')})`)
}
for (const st of ['oven', 'tableside']) {
  const g: any = await KIT.smartChecklist(chef, { station: st }, svc, { now: NOW }), e = engine('2026-10-16', false, st)
  ok(JSON.stringify(strip(g.items)) === JSON.stringify(strip(e.items)) && g.station_key === st, `Chef ${st} today: server = engine (${g.items.map((c: any) => `${c.key} ${c.qty}`).join(', ')})`)
}
const g: any = await KIT.smartChecklist(chef, { station: 'pasta', level: 3, step: 2, gates: { step2: true } }, svc, { now: NOW })
ok(g.level === 1 && g.items.every((c: any) => c.level === 1) && g.gates.step2 === false && g.gates.staffVisible === false, 'a request asking for level 2/3 or switches on still gets level 1, switches off')
let st = 0; try { await KIT.smartChecklist(staff, { station: 'pasta' }, svc, { now: NOW }) } catch (e) { st = (e as any).status }
ok(st === 403, 'staff → 403 (not activated for the brigade)')
let bad = 0; try { await KIT.smartChecklist(chef, { station: 'grill' }, svc, { now: NOW }) } catch (e) { bad = (e as any).status }
ok(bad === 400, 'other station → 400')
ok(writes.length === 0, `no write on any table (${writes.length})`)
console.log(`\nRISULTATO: ${pass} superati, ${fail} falliti`)
Deno.exit(fail ? 1 : 0)
