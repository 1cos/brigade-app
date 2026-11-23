// B-25 passo 1 — prova del server su dati finti ma con la risposta VERA di catering_event_plan per Mason (fixture).
import { cateringPlan, PlanError } from '../supabase/functions/brigade-app-api/catering_plan.ts'
const F = JSON.parse(await Deno.readTextFile(new URL('./catering_plan_mason_fixture.json', import.meta.url)))
const ID = '7c4b3029-f4c9-4a64-a17d-c2844e54bf06'
const calls: string[] = []
const q = (rows: any) => { const o: any = { then: (r: any) => r({ data: rows, error: null }) }; for (const m of ['select', 'gte', 'lte', 'order', 'limit', 'in', 'eq']) o[m] = () => o; o.maybeSingle = () => Promise.resolve({ data: Array.isArray(rows) ? rows[0] : rows, error: null }); return o }
const EV = { id: ID, name: 'Mason Rehearsal', event_date: '2026-10-09', event_time: '18:00', guest_count: 45, status: 'definite', tripleseat_id: '60062987' }
const svc: any = {
  from(t: string) { calls.push('from:' + t)
    if (t === 'catering_dish_links') return q([{ event_id: ID }, { event_id: ID }, { event_id: ID }])
    if (t === 'events') return q([EV])
    if (t === 'event_document_versions') return q([{ ts_document_id: 1, version_no: 2, lines: [{ name: 'Penne Marinara', section: 'Food' }, { name: 'Beef Lasagna', section: 'Food' }, { name: 'Tiramisu', section: 'Dessert' }, { name: 'Coke', section: 'Beverages' }] }])
    throw new Error('tabella inattesa ' + t) },
  rpc(fn: string, a: any) { calls.push('rpc:' + fn); if (fn !== 'catering_event_plan') throw new Error('rpc inattesa ' + fn); return Promise.resolve({ data: F, error: null }) },
}
let pass = 0, fail = 0; const ok = (c: boolean, m: string) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++ }
const chef = { id: 1, name: 'Max', role: 'chef' }, staff = { id: 38, name: 'Pablo', role: 'staff' }
// staff: rifiutato prima di toccare il database
try { await cateringPlan(staff, {}, svc); ok(false, 'staff rifiutato') } catch (e) { ok(e instanceof PlanError && e.status === 403, 'staff: 403, nessun accesso ai dati'); }
ok(calls.length === 0, 'staff: nessuna lettura fatta')
const L = await cateringPlan(chef, {}, svc)
ok(L.events.length === 1 && L.events[0].past && L.events[0].links === 3, 'elenco: Mason passato con 3 piatti collegati')
const P = await cateringPlan(chef, { id: ID }, svc)
ok(P.event.name === 'Mason Rehearsal' && P.components.length === 4, 'piano: 4 componenti su 3 piatti (Production)')
ok(P.shopping.known.filter((x: any) => x.name === 'Penne').length === 1 && P.cost_stale === true, 'spesa: Penne in una riga (4.050 g) e foglio costi segnalato non aggiornato (risposta del database dopo la correzione Mason)')
ok(P.cost.complete === false && Math.abs(P.cost.total - 15.678) < 0.001, 'costo: 15,68 $ incompleto (come nel database)')
ok(P.menu_not_linked.length === 1 && P.menu_not_linked[0] === 'Tiramisu', 'menu Tripleseat: solo Tiramisu senza collegamento (bevande escluse)')
try { await cateringPlan(chef, { id: 'x' }, svc); ok(false, 'id sbagliato rifiutato') } catch (e) { ok(e instanceof PlanError && e.status === 400, 'id sbagliato: 400') }
ok(calls.every(c => c.startsWith('from:') || c === 'rpc:catering_event_plan'), 'solo letture e una sola funzione del database (STABLE)')
console.log(`\n${pass} PASS, ${fail} FAIL`); if (fail) Deno.exit(1)
