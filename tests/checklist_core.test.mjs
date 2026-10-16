// R1.11 Progressive Trust — pure engine tests on READ-ONLY dumps: step 1 questions, margins per weekday, lobster rules,
// levels that cannot rise by mistake, Step 2 result, progression advice on worked shifts only.
// Usage: node tests/checklist_core.test.mjs
import fs from 'node:fs'
import { loadC } from './checklist_dump.mjs'
import * as CL from '../supabase/functions/_shared/checklist_core.js'
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++ }
const C = loadC(), run = (day, extra = {}) => CL.stationPriorities(Object.assign({}, C, { today: day }, extra)), by = (r, k) => r.items.find(c => c.key === k)
// ---------- step 1: one question per item, POS amounts, rounded ----------
const F = run('2026-10-16'), lob = by(F, 'lobster')
ok(F.items.length === 4 && F.items.every(c => c.level === 1 && c.ask === 'ready' && c.for_day.today && c.qty > 0), `Friday: 4 questions, level 1 (${F.items.map(c => c.key + ' ' + c.qty).join(', ')})`)
ok(lob.for_day.today && lob.for_day.weekday === 'Friday' && lob.how === 'thaw_morning', 'lobster: for TODAY, thawed the same morning (no day-ahead thaw)')
ok(lob.why.margin === 25 && lob.why.day.samples.every(s => new Date(s.date + 'T12:00:00Z').getUTCDay() === 5) && lob.qty === Math.ceil(lob.why.day.mean * 1.25), `lobster Friday: mean of 4 Fridays ${lob.why.day.mean} + 25% → ${lob.qty}`)
const S = run('2026-10-17'), ls = by(S, 'lobster')
ok(ls.why.margin === 5 && ls.qty === Math.ceil(ls.why.day.mean * 1.05) && ls.qty < lob.qty, `lobster Saturday prudent: mean ${ls.why.day.mean} + 5% → ${ls.qty} (Friday ${lob.qty})`)
ok(!ls.tonight && !F.items.some(c => c.for_day.weekday === 'Saturday' && c.key === 'lobster'), 'no weekend thawed in advance: Friday asks only for Friday lobsters')
const M = run('2026-10-19'), lm = by(M, 'lobster')
ok(lm.leftovers_from && lm.leftovers_from.weekday === 'Saturday' && lm.qty === Math.ceil(lm.why.day.mean * 1.10), `Monday: ${lm.qty} lobsters (+10%), Saturday leftovers only mentioned, NOT subtracted`)
ok(!by(F, 'lobster').leftovers_from && !by(run('2026-10-20'), 'lobster').leftovers_from, 'leftover note only after a closed day (not Friday, not Tuesday)')
const sh = by(F, 'shrimp'); ok(sh.ask === 'ready' && sh.for_day.today && sh.for_day.weekday === 'Friday' && sh.qty % 150 === 0 && !sh.why.lead_note && !sh.how, `shrimp: for TODAY (no more "for tomorrow"), ${sh.qty} g in 150 g portions, no thaw time`)
const ar = by(F, 'arrabbiata'), gn = by(F, 'gnocco')
ok(ar.for_day.today && ar.qty % 500 === 0 && ar.why.margin === 30 && /3150 g per batch/.test(ar.why.batch), `arrabbiata: today only, ${ar.qty} g (+30% Friday), batch info in Why only`)
ok(gn.for_day.today && gn.qty % 100 === 0 && gn.why.dishes[0].title === 'Coccoli Toscani', `gnocco dough: today only, ${gn.qty} g`)
ok(by(F, 'arrabbiata').why.dishes.find(d => d.title === 'Chicken Parmesan').per_portion === 275, 'Chicken Parmesan still 275 g (official recipe untouched)')
ok(Object.values(CL.MARGINS).some(m => m[5] !== m[6]) && !Object.values(CL.MARGINS).every(m => m.weekday === 0.15), 'no fixed +15%: margins differ by item and weekday')
// ---------- fish: stations, today only, no invented amounts (R1.11b, Chef 16/10) ----------
const allItems = Object.entries(CL.STATIONS).flatMap(([k, v]) => v.items.map(i => ({ st: k, key: i.key })))
ok(new Set(allItems.map(x => x.key)).size === allItems.length && Object.values(CL.STATIONS).every(v => v.items.every(i => CL.STATIONS[i.station].items.includes(i))), `each item in ONE station only (${Object.entries(CL.STATIONS).map(([k, v]) => k + ': ' + v.items.map(i => i.key).join('+')).join(' · ')})`)
ok(CL.STATIONS.pasta.items.map(i => i.key).join() === 'lobster,shrimp,gnocco,arrabbiata' && CL.STATIONS.oven.items.map(i => i.key).join() === 'calamari,salmon,branzino_filet' && CL.STATIONS.tableside.items.map(i => i.key).join() === 'branzino_whole', 'Pasta: lobster+shrimp · Oven: calamari+salmon+branzino filets for the Siciliana · Table Side: whole branzino only (Chef 16/10)')
const O = run('2026-10-16', { station: 'oven' }), T = run('2026-10-16', { station: 'tableside' })
const ca = by(O, 'calamari'), sa = by(O, 'salmon')
ok(O.station === 'Oven Station' && ca.for_day.today && ca.qty > 0 && ca.why.dishes.some(d => d.title === 'Fried calamari' && d.per_portion === 165), `calamari: ${ca.qty} g for today from Fried calamari 165 g/portion`)
ok(sa.for_day.today && sa.unit === 'pz' && sa.what === 'salmon filets (200 g)' && sa.why.dishes.map(d => d.title + ' ' + d.per_portion + ' ' + d.source).sort().join(' | ') === 'Amalfi Salmon 1 POS menu items | Salmon Whole 1 POS modifiers', `salmon: ${sa.qty} filets of 200 g = Amalfi Salmon (1 filet) + "Add salmon whole" modifier (1 filet), nothing else`)
ok(!sa.why.dishes.some(d => /Pistachio/.test(d.title)) && sa.why.not_counted.some(x => /Salmon Pistachio: off the menu \(last POS sale 26\/06\/2026\)/.test(x)), 'Salmon Pistachio: off the menu, not added to the forecast')
{ const x = sa.why.day, mean = x.samples.reduce((a, s) => a + s.amount, 0) / x.samples.length, exp = Math.max(1, Math.ceil(mean * 1.25))
  ok(x.samples.length === 4 && x.samples.every(s => s.amount === s.portions) && sa.qty === exp, `salmon calc: last 4 Fridays ${x.samples.map(s => s.portions).join('+')} → mean ${mean} +25% → ${sa.qty} (expected ${exp})`) }
const bf = by(O, 'branzino_filet'), bw = by(T, 'branzino_whole')
ok(bf.qty === null && bf.need === null && bf.status === 'missing' && bf.why.not_counted.some(x => /Siciliana/.test(x)), 'branzino filets: Siciliana has no amount per portion → no POS number (not invented)')
ok(bf.ref && bf.ref.lo === 10 && bf.ref.hi === 10 && bf.ref.weekend, 'branzino filets Friday: Chef reference about 10 (weekend)')
{ const W = run('2026-10-15', { station: 'oven' }), S = run('2026-10-17', { station: 'oven' }), M = run('2026-10-19', { station: 'oven' }), r = R => by(R, 'branzino_filet').ref
  ok(r(W).lo === 5 && r(W).hi === 7 && r(M).lo === 5 && r(M).hi === 7 && r(S).lo === 10 && !r(W).weekend, 'branzino filets: about 5–7 Monday–Thursday, about 10 Friday–Saturday (reference, not a fixed amount)') }
ok(by(O, 'calamari').ref === null && sa.ref === null, 'the Chef reference appears only where the POS gives no number')
ok(T.items.length === 1 && bw.what === 'whole branzino (gutted and cleaned)' && bw.qty >= 1 && bw.why.dishes.length === 1 && bw.why.dishes[0].title === 'Branzino Chef Style', `Table Side: ${bw.qty} whole branzino gutted and cleaned for today (Branzino Chef Style), nothing else`)
{ const all = Object.values(CL.STATIONS).flatMap(s => s.items), tg = all.map(i => JSON.stringify(i.target))
  ok(new Set(tg).size === tg.length && all.filter(i => /branzino/.test(i.key)).map(i => i.station + ':' + i.key).join() === 'oven:branzino_filet,tableside:branzino_whole', 'no need asked twice: filets only in Oven, whole fish only in Table Side') }
{ const th = Object.fromEntries([...F.items, ...O.items, ...T.items].filter(c => c.thaw_min).map(c => [c.key, c.thaw_min]))
  ok(JSON.stringify(th) === '{"lobster":15,"salmon":20,"branzino_filet":10}', `thaw times only where the Chef gave them: ${JSON.stringify(th)} (none for shrimp, calamari, whole branzino)`) }
ok([...F.items, ...O.items].filter(c => c.thaw_min).every(c => c.why.notes.some(n => /not an HACCP validation/.test(n))), 'thaw time labelled as current practice, not an HACCP validation (Chef view)')
ok(CL.GATES.reassign === false, 'dynamic reassignment: design only, switched off')
ok([...F.items, ...O.items, ...T.items].every(c => c.for_day.today), 'all fish (and every other item) for TODAY\'s service')
// ---------- cook view: nothing technical ----------
const ck = CL.forCook(F), s = JSON.stringify(ck)
ok(!/why|margin|samples|events|need|status|batch|lead_note|confirm/.test(s.replace(/"station(_key)?":"[^"]*"/g, '')) && ck.items.every(c => c.qty != null), 'cook view: question + amount only (no Why, margins, events, batches, Step 2)')
ok(JSON.stringify(CL.forCook(F, 2).items[0].confirm) === '{"question":"how_many_ready","unit":"pz"}', 'Step 2 payload exists, only when level 2')
// ---------- levels cannot rise by mistake ----------
ok(Object.isFrozen(CL.GATES) && !CL.GATES.staffVisible && !CL.GATES.step2 && !CL.GATES.step3, 'release switches all OFF and frozen')
let threw = false; try { 'use strict'; CL.GATES.step2 = true } catch (e) { threw = true } ok((threw || CL.GATES.step2 === false) && CL.GATES.step2 === false, 'a switch cannot be flipped at run time')
const grant = [{ user_id: 38, step: 2, granted_by_role: 'chef', revoked_at: null }]
ok(CL.levelFor({ id: 38 }, grant) === 1, 'Chef grant present but release switch off → level 1')
ok(CL.levelFor({ id: 38 }, grant, { step2: true }) === 2, 'switch on + Chef grant → level 2 (design check)')
ok(CL.levelFor({ id: 38 }, [{ ...grant[0], granted_by_role: 'staff' }], { step2: true }) === 1 && CL.levelFor({ id: 38 }, [{ ...grant[0], revoked_at: '2026-10-20' }], { step2: true }) === 1 && CL.levelFor({ id: 39 }, grant, { step2: true }) === 1, 'not granted by the Chef / revoked / another cook → level 1 (reversible)')
ok(CL.levelFor({ id: 38 }, [{ ...grant[0], step: 3 }], { step2: true, step3: true }) === 1, 'step 3 is never returned (not implemented)')
// ---------- Step 2 result ----------
ok(JSON.stringify(CL.confirmResult(lob, 20)) === JSON.stringify({ ready: 20, short: lob.qty - 20, enough: false }) && CL.confirmResult(lob, 30).enough && CL.confirmResult(lob, -1) === null, `Step 2: 20 counted of ${lob.qty} → ${lob.qty - 20} more; never a theoretical stock`)
// ---------- progression: worked shifts, regularity, never ticks as presence ----------
const days = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-12']
const shifts = days.map(d => ({ date: d, station: 'Pasta Station', worked: true, source: '7shifts' })), assigned = Object.fromEntries(days.map(d => [d, 4]))
const all = days.flatMap(d => ['lobster', 'shrimp', 'gnocco', 'arrabbiata'].map(k => ({ date: d, key: k })))
const base = { today: '2026-10-13', station: 'Pasta Station', shifts, assigned }
ok(CL.progressionAdvice({ ...base, answers: all }).suggest === true, '7 worked shifts, all checks answered → suggest to the Chef (never automatic)')
ok(CL.progressionAdvice({ ...base, answers: all.filter(a => a.date !== '2026-10-12' || a.key === 'lobster') }).suggest === false, 'last worked shift with checks missing → run reset, no suggestion')
ok(CL.progressionAdvice({ ...base, shifts: shifts.slice(0, 4), answers: all }).suggest === false, '4 worked shifts only → not yet')
ok(CL.progressionAdvice({ ...base, shifts: [], answers: all }).suggest === false && /no worked shifts/.test(CL.progressionAdvice({ ...base, shifts: [], answers: all }).reason), 'ticks without worked shifts on record → nothing (ticks are not presence)')
ok(CL.progressionAdvice({ ...base, shifts: shifts.map(s => ({ ...s, source: 'ticks' })), answers: all }).suggest === false, 'shifts derived from ticks are refused')
ok(CL.progressionAdvice({ ...base, shifts: shifts.map(s => ({ ...s, station: 'Salad Station' })), answers: all }).suggest === false, 'shifts at another station do not count')
ok(CL.progressionAdvice({ ...base, answers: all.concat(all) }).suggest === true && CL.progressionAdvice({ ...base, answers: all, level: 2 }).suggest === false, 'double ticks add nothing; already at step 2 → no advice')
const gaps = ['2026-09-29', '2026-10-01', '2026-10-03', '2026-10-06', '2026-10-08', '2026-10-10']   // 6 shifts spread over 2 weeks: calendar days do not matter
ok(CL.progressionAdvice({ today: '2026-10-11', station: 'Pasta Station', shifts: gaps.map(d => ({ date: d, station: 'Pasta Station', worked: true, source: '7shifts' })), assigned: Object.fromEntries(gaps.map(d => [d, 4])), answers: gaps.flatMap(d => ['a', 'b', 'c', 'd'].map(k => ({ date: d, key: k }))) }).suggest === true, 'counted on worked shifts, not calendar days (part-time cook qualifies)')
console.log(`\nRISULTATO: ${pass} superati, ${fail} falliti`)
process.exitCode = fail ? 1 : 0
