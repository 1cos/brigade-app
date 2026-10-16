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
const sh = by(F, 'shrimp'); ok(sh.ask === 'ready' && sh.for_day.today && sh.for_day.weekday === 'Friday' && sh.qty % 50 === 0 && !sh.why.lead_note && !sh.how, `shrimp: for TODAY, ${sh.qty} g rounded to whole shrimp (50 g), no thaw time`)
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
ok(sa.for_day.today && sa.unit === 'pz' && sa.what === 'salmon filets (190 g)' && sa.why.dishes.map(d => d.title + ' ' + d.per_portion + ' ' + d.source).sort().join(' | ') === 'Amalfi Salmon 1 POS menu items | Salmon Whole 1 POS modifiers', `salmon: ${sa.qty} filets of 190 g = Amalfi Salmon (1 filet) + "Add salmon whole" modifier (1 filet), nothing else`)
ok(!sa.why.dishes.some(d => /Pistachio/.test(d.title)) && sa.why.not_counted.some(x => /Salmon Pistachio: off the menu \(last POS sale 26\/06\/2026\)/.test(x)), 'Salmon Pistachio: off the menu, not added to the forecast')
{ const x = sa.why.day, mean = x.samples.reduce((a, s) => a + s.amount, 0) / x.samples.length, exp = Math.max(1, Math.ceil(mean * 1.25))
  ok(x.samples.length === 4 && x.samples.every(s => s.amount === s.portions) && sa.qty === exp, `salmon calc: last 4 Fridays ${x.samples.map(s => s.portions).join('+')} → mean ${mean} +25% → ${sa.qty} (expected ${exp})`) }
const bf = by(O, 'branzino_filet'), bw = by(T, 'branzino_whole')
{ const x = bf.why.day, mean = x.samples.reduce((a, s) => a + s.portions, 0) / 4, exp = Math.ceil(mean * 1.30)
  ok(bf.qty === exp && x.samples.every(s => s.amount === s.portions) && bf.why.dishes.length === 1 && bf.why.dishes[0].title === 'Siciliana' && /Chef 16\/10: 1 filet per Siciliana/.test(bf.why.dishes[0].source), `branzino filets: Siciliana sold last 4 Fridays ${x.samples.map(s => s.portions).join('+')} × 1 filet (Chef) → mean ${mean} +30% → ${bf.qty}`) }
ok(bf.ref === null && bf.why.chef_ref.lo === 10 && bf.why.not_counted.length === 0, 'branzino filets: POS number now; Chef reference (about 10) kept in Why? for comparison only')
ok(bf.why.notes[0] === `${bf.qty} filets = ${Math.ceil(bf.qty / 2)} whole fish if filleted today (2 filets per fish, Chef). Frozen filets already in stock are not counted.`, `filets → whole fish kept separate: ${bf.why.notes[0]}`)
{ const W = run('2026-10-15', { station: 'oven' }), S = run('2026-10-17', { station: 'oven' }), r = R => by(R, 'branzino_filet')
  ok(r(W).why.margin === 25 && r(S).why.margin === 30 && r(W).why.chef_ref.hi === 7 && r(S).why.chef_ref.lo === 10, `filet margins: Mon–Thu +25%, Fri/Sat +30% (Thu ${r(W).qty}, Sat ${r(S).qty})`) }
ok(by(O, 'calamari').ref === null && sa.ref === null, 'no item shows the Chef reference as the question')
ok(T.items.length === 1 && bw.what === 'whole branzino (gutted and cleaned)' && bw.qty >= 1 && bw.why.dishes.length === 1 && bw.why.dishes[0].title === 'Branzino Chef Style', `Table Side: ${bw.qty} whole branzino gutted and cleaned for today (Branzino Chef Style), nothing else`)
{ const all = Object.values(CL.STATIONS).flatMap(s => s.items), tg = all.map(i => JSON.stringify(i.target))
  ok(new Set(tg).size === tg.length && all.filter(i => /branzino/.test(i.key)).map(i => i.station + ':' + i.key).join() === 'oven:branzino_filet,tableside:branzino_whole', 'no need asked twice: filets only in Oven, whole fish only in Table Side') }
{ const th = Object.fromEntries([...F.items, ...O.items, ...T.items].filter(c => c.thaw_min).map(c => [c.key, c.thaw_min]))
  ok(JSON.stringify(th) === '{"lobster":15,"salmon":20,"branzino_filet":10}', `thaw times only where the Chef gave them: ${JSON.stringify(th)} (none for shrimp, calamari, whole branzino)`) }
ok([...F.items, ...O.items].filter(c => c.thaw_min).every(c => c.why.notes.some(n => /not an HACCP validation/.test(n))), 'thaw time labelled as current practice, not an HACCP validation (Chef view)')
// ---------- Chef 16/10 definitive quantities: the forecast follows the OFFICIAL recipes, pending shown until they agree ----------
{ const pend = sh.why.notes.filter(n => /^Pending in the official recipe/.test(n))
  ok(pend.length === 2 && /Add shrimp = 5 shrimp = 250 g \(Brigade says 150 g\)/.test(pend[0]) && /Scoglio = 2 shrimp = 100 g \(Brigade says nothing\)/.test(pend[1]), 'shrimp: Add shrimp 250 g and Scoglio 100 g shown as pending while the official recipes say otherwise')
  const P = JSON.parse(JSON.stringify(C))   // the official recipes as they will be after R1.11.4 (in memory only)
  P.bom.find(b => b.parent_recipe_id === '8346fbee-7306-4d79-a90a-7228a7f9b766' && b.sub_recipe_id === 'dc5cf3dd-f130-46ec-a868-849110d59cdf').quantity = 250
  P.bom.push({ parent_recipe_id: '93e0f4f1-9889-407d-841c-c225659b684c', component_type: 'RECIPE', sub_recipe_id: 'dc5cf3dd-f130-46ec-a868-849110d59cdf', item_id: null, quantity: 100, unit: 'g' })
  const s2 = CL.stationPriorities(Object.assign({}, P, { today: '2026-10-16' })).items.find(c => c.key === 'shrimp')
  const sco = s2.why.dishes.find(d => d.title === 'Fettuccine Allo Scoglio'), add = s2.why.dishes.find(d => d.title === 'ADD SHRIMP')
  ok(sco && sco.per_portion === 100 && add.per_portion === 250 && !s2.why.notes.some(n => /^Pending/.test(n)) && s2.qty > sh.qty, `after the recipe fix: Add shrimp 250 g + Scoglio 100 g counted, nothing pending → ${sh.qty} g becomes ${s2.qty} g`)
  ok(sa.why.notes.some(n => /190 g/.test(n)) && !sa.why.notes.some(n => /200 g/.test(n)), 'salmon: 190 g (Chef), no 200 g anywhere')
  const bwn = T.items[0].why.notes.join(' '), bfn = bf.why.notes.join(' ')
  ok(/2\.2 lb/.test(bwn) && !/2\.1/.test(bwn + bfn) && /1\.1 lb/.test(bfn), 'branzino: 2.2 lb per fish, 1.1 lb per filet in theory (purchase only)') }
ok(CL.GATES.reassign === false, 'dynamic reassignment: design only, switched off')
// ---------- POS add-ons: counted once, nothing sold dropped silently ----------
{ const all = [...F.items, ...O.items, ...T.items], rv = k => all.find(c => c.key === k).why.review || []
  const names = k => rv(k).map(x => x.name.toLowerCase())
  ok(rv('shrimp').some(x => x.name === 'Shrimp' && x.kind === 'adds' && x.qty > 0) && !names('shrimp').includes('add shrimp') && !names('shrimp').includes('extra shrimp'), `shrimp: "Add shrimp"/"Extra shrimp" counted (150 g); unmapped ones flagged with volume (${rv('shrimp').filter(x => x.kind === 'adds').map(x => x.name + ' ' + x.qty).join(', ')})`)
  ok(rv('salmon').some(x => x.name === 'Salmon whole' && x.kind === 'adds') && !names('salmon').some(n => ['add salmon whole', 'add salmon'].includes(n)) && !names('salmon').some(n => /salmon cake/.test(n)), 'salmon: "Add salmon whole"/"Add salmon" counted; "Salmon whole" flagged; Salmon Cakes (cured salmon) not mixed in')
  ok(rv('lobster').some(x => x.kind === 'no_recipe' && /Risotto/.test(x.name)) && rv('branzino_whole').some(x => x.name === 'Porchini Mushroom Branzino'), 'seafood dishes sold without a recipe are listed for the Chef (lobster risottos, branzino specials)')
  ok(CL.modKind('Shrimp on side') === 'note' && CL.modKind('No shrimp') === 'removal' && CL.modKind('Salmon instead of shrimp') === 'sub' && CL.modKind('Side of shrimp') === 'adds' && CL.modKind('Shellfish allergy') === 'note', 'add-on kinds: adds / substitution / removal / note')
  // no double counting: inside one item a POS name feeds ONE dish, and a counted name never appears in the review list
  const dup = []; for (const [k, st] of [['lobster', 'pasta'], ['shrimp', 'pasta'], ['calamari', 'oven'], ['salmon', 'oven'], ['branzino_filet', 'oven'], ['branzino_whole', 'tableside']]) {
    const it = CL.STATIONS[st].items.find(i => i.key === k), ds = CL.dishesFor(it.target, C.bom, C.recipes, C.yields).map(d => (it.as_modifier || []).includes(d.recipe_id) ? { ...d, addon: true } : d), seen = {}
    for (const d of ds) for (const n of new Set(d.pos_names.map(x => x.toLowerCase()))) { const key = (d.addon ? 'm|' : 'i|') + n; if (seen[key] && seen[key] !== d.title) dup.push(k + ': ' + n); seen[key] = d.title }
    for (const x of rv(k)) if (seen[(x.source === 'POS modifier' ? 'm|' : 'i|') + x.name.toLowerCase()]) dup.push(k + ' review: ' + x.name) }
  ok(dup.length === 0, `no POS name counted twice, none both counted and flagged (${dup.join(', ') || 'clean'})`)
  // salmon total on the last Friday = Amalfi Salmon + the two salmon add-on names, straight from raw POS rows
  const day = sa.why.day.samples.at(-1), raw = C.sales.filter(s => s.date === day.date && ((s.kind === 'item' && s.name === 'Amalfi Salmon') || (s.kind === 'modifier' && /^add salmon( whole)?$/i.test(s.name.trim())))).reduce((a, s) => a + s.qty, 0)
  ok(day.amount === raw, `salmon ${day.date}: engine ${day.amount} = raw POS ${raw} (Amalfi Salmon + Add salmon whole + Add salmon, each once)`)
  ok(!JSON.stringify(CL.forCook(O)).includes('review'), 'cook view: no review list') }
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
