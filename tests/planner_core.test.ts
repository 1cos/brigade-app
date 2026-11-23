// B-25 Planner — regole di Max: Chef vede tutti, staff solo i propri; giorni senza turni pubblicati = «non ancora pubblicato» (mai «libero»).
import { buildDays } from '../supabase/functions/brigade-app-api/planner_core.ts'
let pass = 0, fail = 0; const ok = (c: boolean, m: string) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++ }
// stato VERO letto il 22/11/2026 (turni_giorni): 22 (1 turno aperto), 23–25, 26 chiuso (0), 27–28; poi 0+0
const gi = [['2026-11-22', 1], ['2026-11-23', 14], ['2026-11-24', 16], ['2026-11-25', 15], ['2026-11-26', 0], ['2026-11-27', 18], ['2026-11-28', 17], ['2026-11-29', 0], ['2026-11-30', 0], ['2026-12-01', 0], ['2026-12-05', 0]].map(([g, p]) => ({ giorno: g, pubblicati: p, bozze: 0 }))
const mk = (g: string, nome: string | null, stato = 'pubblicato') => ({ giorno: g, inizio: g + 'T15:00:00Z', fine: g + 'T22:00:00Z', ruolo: 'Cook', nome, stato })
const rows = [mk('2026-11-22', null, 'aperto'), mk('2026-11-23', 'Pablo Rossi'), mk('2026-11-23', 'Anna Verdi'), mk('2026-11-24', 'Anna Verdi'), mk('2026-11-27', 'Pablo Rossi', 'modificato')]
const chef = buildDays('2026-11-22', gi, rows, '', true), pablo = buildDays('2026-11-22', gi, rows, 'pablo rossi', false), nobody = buildDays('2026-11-22', gi, rows, '', false)
const st = (d: any[], date: string) => d.find(x => x.date === date)
ok(chef.length === 14 && chef[0].date === '2026-11-22' && chef[13].date === '2026-12-05', '14 giorni, da oggi')
ok(st(chef, '2026-11-23').shifts.length === 2 && st(chef, '2026-11-23').shifts.every((s: any) => s.name), 'Chef: vede tutti i turni con i nomi')
ok(st(pablo, '2026-11-23').shifts.length === 1 && st(pablo, '2026-11-23').shifts[0].name === null, 'Staff: vede solo il proprio turno, senza nome di colleghi')
ok(pablo.flatMap((d: any) => d.shifts).length === 2 && !JSON.stringify(pablo).includes('Anna'), 'Staff: nessuna traccia dei colleghi in tutta la risposta')
ok(nobody.flatMap((d: any) => d.shifts).length === 0, 'Staff non collegato a 7shifts: nessun turno (e nessuno dei colleghi)')
ok(st(chef, '2026-11-22').shifts[0].open === true && st(pablo, '2026-11-22').shifts.length === 0, 'Turno aperto: lo vede lo Chef, non lo staff')
ok(st(chef, '2026-11-26').state === 'nessun_turno', '26/11 (0 turni, prima dell\'ultimo giorno pubblicato) = «nessun turno», non «non pubblicato»')
ok(['2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02', '2026-12-05'].every(d => st(chef, d).state === 'non_ancora_pubblicato'), 'Dal 29/11 in poi (dopo l\'ultimo giorno pubblicato) = «non ancora pubblicato»')
ok(['2026-11-23', '2026-11-28'].every(d => st(chef, d).state === 'pubblicato'), 'Giorni con turni = pubblicato')
ok(st(pablo, '2026-11-25').state === 'pubblicato' && st(pablo, '2026-11-25').shifts.length === 0, 'Staff, giorno pubblicato senza turni suoi: pubblicato, lista vuota («nessun turno per te»)')
const gb = gi.map(g => g.giorno === '2026-11-26' ? { ...g, bozze: 5 } : g)
ok(st(buildDays('2026-11-22', gb, rows, '', true), '2026-11-26').state === 'non_ancora_pubblicato', 'Giorno con sole bozze = «non ancora pubblicato»')
ok(buildDays('2026-11-22', [], [], '', true).every((d: any) => d.state === 'non_ancora_pubblicato'), 'Nessun dato letto = tutto «non ancora pubblicato», mai «libero»')
console.log(`\n${pass} PASS, ${fail} FAIL`); if (fail) Deno.exit(1)
