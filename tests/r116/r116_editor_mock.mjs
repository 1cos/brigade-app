// R1.16 (Chef 21/10 "BUG CRITICI DELL'EDITOR CHEF") — the editor under REAL server delays (save 3 s, recipe 3 s, search 2 s), iPhone, WebKit.
// List = the 265 real Brigade recipes (read-only snapshot, kinds as the server computes them) + the Chef's proposal.
// Recipe contents = the read-only snapshot of step A. API answered in memory with the shapes of brigade-app-api/mre.ts
// (tested on its own in tests/stepA/bench.mjs). Nothing is sent to Supabase.
// Usage: PORT=<static server for web/> FLAKES_FACTS=<json> CW=<facts_cw_parsed.json> node tests/r114/r114_ui_mock.mjs <snap2_parsed.json> <titles.json> <outDir>
import { webkit } from '/Users/massimilianozubboli/cw-probe/node_modules/playwright-core/index.mjs'
import fs from 'node:fs'
import * as E from '../../supabase/functions/_shared/mre_engine.js'
import { buildLabDoc } from '../../supabase/functions/_shared/mre_import.js'
import * as PM from '../../supabase/functions/_shared/purchase_match.js'
import { knowledgeCard } from '../../supabase/functions/_shared/knowledge_core.js'
const DUMP = JSON.parse(fs.readFileSync(process.env.DUMP, 'utf8')), DEC = {}
const [SNAP, TITLES, OUT] = process.argv.slice(2), PORT = process.env.PORT || '18791'
fs.mkdirSync(OUT, { recursive: true })
const S = JSON.parse(fs.readFileSync(SNAP, 'utf8')), TT = JSON.parse(fs.readFileSync(TITLES, 'utf8')).rows
const byId = Object.fromEntries(S.recipes.map(r => [r.id, r])), Y = Object.fromEntries(S.yield.map(y => [y.id, y]))
const OFF = {}, DIFFS = {}
for (const r of S.recipes) { const o = buildLabDoc({ id: r.id, r, rows: S.bom.filter(b => b.parent_recipe_id === r.id), stepRows: S.steps.filter(s => s.recipe_id === r.id), prepRows: S.prep.filter(p => p.recipe_id === r.id && !p.archived), y: Y[r.id], byId, importedAt: 'now' }); OFF[r.id] = Object.assign(o.doc, { id: r.id, _source: 'official' }); DIFFS[r.id] = o.diffs }
const SPIN = '9cec677b-55d6-4329-9dae-5dd4d489e147', PARM = '6357c9f1-f944-4153-8d7f-afb11336d91a', WHEEL = '5479387e-e4ad-4401-92ce-9cb785ef4a0d', POS = 'b0490000-0000-4000-8000-0000000000a1'
const FLAKES = 'bb3717e0-3d2c-43ef-aac4-dc5df13f5d8a', ARTI = 'dbdc80fd-142f-4ca1-8f83-7bcebe19ee63'
const CWF = JSON.parse(fs.readFileSync(process.env.CW, 'utf8')), CWSPIN = 'db944759-42e3-4fdf-a705-d073f181d698'
const facts = Object.assign({}, S.facts, CWF); if (!facts[FLAKES]) facts[FLAKES] = JSON.parse(process.env.FLAKES_FACTS || 'null')
// R1.14 lab draft: spinach = the Chef's Warehouse article, NO cooked weight (not confirmed by the Chef)
const spinDraft = Object.assign(JSON.parse(JSON.stringify(OFF[SPIN])), { title: 'Spinach Cup', yield: { g: null, portions: 22, label: '22 contenitori = 22 porzioni' }, lines: OFF[SPIN].lines.filter(l => l.id !== 'b1757').map(l => l.id === 'b1752' ? Object.assign({}, l, { ref: CWSPIN }) : l) })
const LAB = {      // the live lab of 20/10: drafts + history + the proposal (titles as after the R1.13 lab update)
  [SPIN]: { versions: [{ version: 1, state: 'importata', reason: 'Copia del 15/10 (storico)', at: '2026-10-15T15:28:00Z' }], draft: spinDraft, dv: 2 },
  [WHEEL]: { versions: [{ version: 1, state: 'importata', reason: 'Copia del 15/10 (storico)', at: '2026-10-15T15:28:00Z' }], dv: 2,
    draft: Object.assign(JSON.parse(JSON.stringify(OFF[WHEEL])), { lines: OFF[WHEEL].lines.map(l => l.id === 'b2176' ? Object.assign({}, l, { ref: FLAKES, note: 'Parmigiano Reggiano 24 mesi · Chef\'s Warehouse 00907. 100 g da verificare' }) : l) }) },
  [ARTI]: { versions: [], draft: { title: 'Artichoke' }, dv: 2, noOpen: true },
  [POS]: { lab_only: true, versions: [], dv: 1, source: { kind: 'menu', takes_pos_from: SPIN, pos_names: ['Butter Spinach', 'Sautéed Spinach'] },
    draft: { schema: 1, id: POS, title: 'Butter Spinach', category: 'Contorni', yield: { g: null, portions: 1, label: '1 porzione' }, has_stock: false, stock: [],
      lines: [{ id: 'p1', kind: 'recipe', ref: SPIN, qty: 1, unit: 'portion', role: 'produzione', note: '1 Spinach Cup', group: null }, { id: 'p2', kind: 'recipe', ref: PARM, qty: 5, unit: 'g', role: 'al_piatto', note: 'al servizio — 5 g da verificare (CD-067)', group: null }], steps: [], notes: 'Proposta CD-067' } },
}
const REVIEW = {}, SAVED = [], NUTMEG = '8d97bcc6-dcec-428e-a996-6c8725847aa9'
let role = 'chef', publishCalls = 0, saves = 0, reviews = 0, decides = 0
const CUPS = 'f61ccfe4-2512-4f67-9402-4a00c37efea1', CONT = 'bb09009b-adba-4f20-a4a7-fe5ba4cd4ce7'
const user = () => role === 'chef' ? { id: 1, name: 'Max', role: 'chef', lang: 'it', station: null } : { id: 38, name: 'Pablo', role: 'staff', lang: 'it', station: 'Salad Station' }
const docOf = id => OFF[id] || (LAB[id] && LAB[id].lab_only ? LAB[id].draft : null)
function listOf(chef) {   // same rules as mreList (server)
  const taken = new Set(Object.values(LAB).filter(l => l.lab_only && l.draft && l.source.takes_pos_from).map(l => l.source.takes_pos_from))
  const out = TT.map(r => { const l = LAB[r.id], row = { id: r.id, title: r.title, category: r.category, menu: !!String(r.pos_name || '').trim(), prep: !!(r.prep || r.sub), archived: /archiv/i.test(r.category || ''), mre: !!l }
    if (chef) { if (l && l.draft) { row.draft = true; row.draft_version = l.dv; if (l.draft.title && l.draft.title !== r.title) row.draft_title = l.draft.title } if (taken.has(r.id) && row.draft) row.menu = false; row.review = REVIEW[r.id] || null; row.pending = 0 }
    return row })
  if (chef) out.push({ id: POS, title: LAB[POS].draft.title, category: 'Contorni', menu: true, prep: false, archived: false, mre: true, lab_only: true, draft: true, draft_version: 1, review: REVIEW[POS] || null, pending: 0, pos_names: LAB[POS].source.pos_names })
  return out.sort((a, b) => String(a.draft_title || a.title).localeCompare(String(b.draft_title || b.title), 'en', { sensitivity: 'base' }))
}
function treeOf(root) { const o = { [root.id]: root }, dr = {}; let fr = [root]; for (let i = 0; i < 8 && fr.length; i++) { const nx = []; fr.forEach(x => (x.lines || []).filter(l => l.kind === 'recipe').forEach(l => { if (!o[l.ref] && docOf(l.ref)) { o[l.ref] = docOf(l.ref); nx.push(o[l.ref]); if (LAB[l.ref] && LAB[l.ref].draft && !LAB[l.ref].lab_only) { dr[l.ref] = Object.assign({}, LAB[l.ref].draft, { id: l.ref }); nx.push(dr[l.ref]) } } })); fr = nx } return { o, dr } }
function api(op, b) {
  const u = user(), chef = u.role === 'chef'
  switch (op) {
    case 'me': return { ok: true, user: u, build: 'mock' }
    case 'shift': return { build: 'mock', today: '2026-10-20', plan_date: '2026-10-20', user: u, items: [], messages: [], done_today: [], reports: [], people: [] }
    case 'ingredients': return { ingredients: new Array(492).fill(0).map((_, i) => ({ id: 'i' + i, name: 'x' })) }
    case 'mre_list': return { source: 'official', publish_locked: true, pending: 0, recipes: listOf(chef) }
    case 'mre_recipe': { const L = LAB[b.id], root = docOf(b.id); if (!root || (L && L.lab_only && !chef)) return [404, 'not_found']
      const t = treeOf(root), ctx = { doc: x => t.o[x], facts: x => facts[x], measures: S.measures }
      if (chef && L && L.draft && !L.lab_only) { const t2 = treeOf(Object.assign({}, L.draft, { id: b.id })); Object.keys(t2.o).forEach(k => { if (k !== b.id && !t.o[k]) t.o[k] = t2.o[k] }); Object.assign(t.dr, t2.dr) }
      const f2 = {}; Object.keys(facts).forEach(k => { if (facts[k]) f2[k] = chef ? facts[k] : (({ price, ...r }) => r)(facts[k]) })
      return { source: OFF[b.id] ? 'official' : 'lab', read_at: new Date().toISOString(), publish_locked: true, recipe: { id: b.id, current_version: 0, linked: !!L, review: chef ? REVIEW[b.id] || null : null },
        doc: root, docs: t.o, draft_docs: chef ? t.dr : {}, facts: f2, measures: S.measures, versions: (L ? L.versions : []).concat(L && L.draft ? [{ version: L.dv, state: 'bozza', reason: null, by: 'Max', at: new Date().toISOString() }] : []).reverse(),
        productions: [], suggestions: [], draft: chef && L && L.draft ? Object.assign({}, L.draft, { id: b.id, _version: L.dv }) : null, diffs: chef ? DIFFS[b.id] || [] : undefined, diffs_checked: null, cost: chef ? E.cost(b.id, 1, OFF[b.id] ? ctx : { doc: x => t.dr[x] || t.o[x], facts: ctx.facts, measures: ctx.measures }) : undefined } }
    case 'mre_save_draft': if (!chef) return [403, 'forbidden']; saves++; SAVED.push(JSON.parse(JSON.stringify(b.doc))); LAB[b.id] = LAB[b.id] || { versions: [], dv: 1 }; LAB[b.id].draft = b.doc; return { ok: true, draft_version: LAB[b.id].dv }
    case 'mre_discard': LAB[b.id].draft = null; return { ok: true }
    case 'mre_publish': publishCalls++; return [423, 'pubblicazione_bloccata']
    case 'mre_review': { if (!chef) return [403, 'forbidden']; reviews++; const L = LAB[b.id], root = L && L.draft ? Object.assign({}, L.draft, { id: b.id }) : docOf(b.id), t = treeOf(root), iss = E.issues(b.id, { doc: x => t.dr[x] || t.o[x], facts: x => facts[x], measures: S.measures })
      REVIEW[b.id] = b.verified === false ? null : { by: 'Max', at: new Date().toISOString(), open: iss.length, issues: iss }; return { ok: true, review: REVIEW[b.id] } }
    case 'office': return [403, 'forbidden']
    case 'mre_ingredients': return { ingredients: /nutm/i.test(b.q) ? [{ id: NUTMEG, name: 'Ground Nutmeg', name_it: 'Noce moscata macinata' }, { id: 'd590d00d-b95b-431e-8356-d5a0ae887f54', name: 'Nutmeg', name_it: 'Noce moscata' }] : /salt/i.test(b.q) ? [{ id: '4720ed37-9e3b-417b-a949-b2bc60d5ec5f', name: 'Salt', name_it: 'Sale' }] : [], recipes: [] }
    case 'knowledge': { const ing = DUMP.ing.filter(i => i.id === b.id).map(i => ({ id: i.id, name: i.name, name_it: i.name_it, base_unit: i.base, category: i.cat, active: true }))
      if (!ing.length) return [404, 'not_found']
      const bom = S.bom.map(x => ({ parent_recipe_id: x.parent_recipe_id, component_type: x.component_type, item_id: x.item_id, sub_recipe_id: x.sub_recipe_id, quantity: x.quantity, unit: x.unit }))
      const k = knowledgeCard(b.id, { ingredients: ing, bom, recipes: S.recipes, yields: S.yield, prep: [], vendors: DUMP.vend.filter(v => v.ing === b.id).map(v => ({ ingredient_id: v.ing, vendor: v.v, vendor_sku: v.sku, pack_description: v.pack, purchase_unit: v.pu, unit_price: v.up, last_invoice_date: v.last, active: true })),
        aliases: [], invoices: [], facts: facts[b.id] || null, conv: [], each: [], sales: [], counts: [], days: 28, since: '2026-09-23', today: '2026-10-21' }, chef)
      if (b.id === CUPS) Object.assign(k.theoretical, { v: 83.47, unit: 'each', s: 'missing', partial: true, why: 'Siciliana: conversion missing on the way' })   // as on the live card
      return k }
    case 'mre_purchase_match': { if (!chef) return [403, 'forbidden']; const dec = Object.values(DEC).filter(d => d.ing === b.id)
      const r = PM.matchCandidates(b.id, DUMP, dec, { more: !!b.more }); const nm = PM.needsMatch(b.id, DUMP, facts[b.id], '2026-10-21')
      return { need: nm.need, why: nm.why, candidates: r.candidates, rejected: r.rejected, decisions: dec } }
    case 'mre_match_decide': { if (!chef) return [403, 'forbidden']; const c = PM.matchCandidates(b.id, DUMP, [], { more: true }).candidates.find(x => x.key === b.key); if (!c) return [404, 'candidato_sconosciuto']
      if (b.decision === 'collega') { if (!b.recipe_id || !b.line_id) return [400, 'serve_ricetta']; const L = LAB[b.recipe_id]; const dr = JSON.parse(JSON.stringify(L.draft)); const ln = dr.lines.find(l => l.id === b.line_id); if (!ln || ln.ref !== b.id) return [400, 'riga_non_trovata']
        if ((facts[b.id] || {}).policy === 'non_food') ln.role = 'imballo'; ln.ref = c.target.id; L.draft = dr; saves++ }
      DEC[b.id + c.key] = { ing: b.id, key: c.key, decision: b.decision }; decides++
      return { ok: true, decision: b.decision, draft_version: 2, target: c.target } }
  }
  return [400, 'bad_op']
}

const log = []
const ok = (c, m) => { log.push((c ? 'PASS ' : 'FAIL ') + m); console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1 }
if (!facts[NUTMEG]) facts[NUTMEG] = { name: 'Ground Nutmeg', name_it: 'Noce moscata macinata', base: 'g', price: null }
// measured on the live server 21/10 (R1.15): save 3.0–4.3 s, recipe 2.8–4.0 s, list 1.8–4.1 s, search 1.6–2.0 s
const DELAY = { mre_save_draft: 3000, mre_recipe: 3000, mre_list: 2000, mre_ingredients: 1900, mre_review: 1500 }
let FAIL = 0, inflight = 0, maxInflight = 0, slowFirst = 0
const browser = await webkit.launch()
async function page() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const pg = await ctx.newPage()
  pg.on('pageerror', e => ok(false, 'errore JS: ' + e.message)); pg.on('console', m => { if (/^DBG/.test(m.text())) console.log(m.text()) })
  await pg.route('**/functions/v1/brigade-app-api', async r => { const b = JSON.parse(r.request().postData() || '{}')
    if (b.op === 'mre_save_draft') { inflight++; maxInflight = Math.max(maxInflight, inflight) }
    let d = DELAY[b.op] || 150; if (b.op === 'mre_save_draft' && slowFirst) { d = slowFirst; slowFirst = 0 }
    await new Promise(x => setTimeout(x, d))
    if (b.op === 'mre_save_draft') inflight--
    if (b.op === 'mre_save_draft' && FAIL) { FAIL--; return r.abort('internetdisconnected') }
    const out = api(b.op, b); if (Array.isArray(out)) return r.fulfill({ status: out[0], contentType: 'application/json', body: JSON.stringify({ ok: false, error: out[1] }) }); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) }) })
  await pg.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }))
  await pg.addInitScript(() => { localStorage.setItem('brigade-app-token', 'a'.repeat(64)); localStorage.setItem('brigade-app-lang', 'en');  navigator.serviceWorker && (navigator.serviceWorker.register = () => Promise.resolve())
    const L = window.__M = { req: [], gaps: [] }
    const of = window.fetch; window.fetch = async (u, o) => { let op = '?'; try { op = JSON.parse(o.body).op } catch (e) {} const e = { op, t0: performance.now() }; L.req.push(e); try { const r = await of(u, o); e.t1 = performance.now(); e.st = r.status; return r } catch (x) { e.t1 = performance.now(); e.st = 0; throw x } }
    let gap = null
    new MutationObserver(() => { const has = !!document.querySelector('#main .mr .mr-ings'); if (!has && gap == null && window.__arm) gap = performance.now(); if (has && gap != null) { L.gaps.push({ t0: gap, ms: Math.round(performance.now() - gap) }); gap = null } }).observe(document, { subtree: true, childList: true }) })
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`); await pg.waitForTimeout(2500)
  return pg
}
const pg = await page()
const M = () => pg.evaluate(() => window.__M), now = () => pg.evaluate(() => performance.now())
const nLines = () => pg.locator('#main [data-m^="del:"]').count(), nSteps = () => pg.locator('#main [data-mt^="step:"]').count()
async function waitFor(fn, max = 15000) { const s = Date.now(); while (Date.now() - s < max) { if (await fn()) return Date.now() - s; await pg.waitForTimeout(16) } return null }
const gapsSince = async t0 => (await M()).gaps.filter(g => g.t0 >= t0)
const status = () => pg.locator('#main [data-sst]').innerText().catch(() => '')
const idle = () => waitFor(async () => !(await pg.evaluate(() => window.MreUI.pending().length)) && /Saved/.test(await status()), 20000)
const R = {}
await pg.click('button.w[data-w="restaurant"]'); await pg.waitForSelector('#q', { timeout: 20000 }); await pg.fill('#q', 'butter spinach')
await pg.click('#main .rm-row:has(.name:text-is("Butter Spinach"))'); await pg.waitForSelector('.mr-editbtn', { timeout: 20000 })
await pg.click('.mr-editbtn'); await pg.waitForSelector('#mrAdd'); await pg.evaluate(() => { window.__arm = true })
const base = { lines: await nLines(), steps: await nSteps() }
ok(/no changes yet/.test(await status()), 'stato visibile all\'apertura: ' + await status())

// A — one tap on Ground Nutmeg
await pg.click('#mrAdd'); await pg.keyboard.type('nutmeg', { delay: 120 })
ok(await pg.locator('#mrSearching').isVisible(), 'mentre cerca scrive "Searching…"')
R.search_ms = await waitFor(() => pg.locator('[data-m^="addi:"]:text-is("Ground Nutmeg")').count())
let t0 = await now(); let t = Date.now(); await pg.locator('[data-m^="addi:"]:text-is("Ground Nutmeg")').first().click()
R.A_visible_ms = await waitFor(async () => (await nLines()) > base.lines)
ok(R.A_visible_ms != null && R.A_visible_ms < 300, `A: Ground Nutmeg compare subito nella bozza (${R.A_visible_ms} ms; R1.15 sul server vero: 6.873–7.049 ms)`)
ok(/Editing|Saving/.test(await status()), 'A: stato "Editing/Saving" mentre salva — ' + await status())
await idle(); ok((await gapsSince(t0)).length === 0, 'A: la sezione ricetta non sparisce mai (R1.15: 3,4–4,1 s)')
ok(/Saved in draft v\d/.test(await status()), 'A: poi "Saved" — ' + await status())

// B — three taps on the same suggestion (what the Chef did)
await pg.click('#mrAdd'); await pg.keyboard.type('nutmeg', { delay: 120 }); await waitFor(() => pg.locator('[data-m^="addi:"]:text-is("Ground Nutmeg")').count())
const l0 = await nLines(); t0 = await now(); let taps = 0
await pg.waitForTimeout(100); const btn = await pg.locator('[data-m^="addi:"]:text-is("Ground Nutmeg")').first().boundingBox()
const hit = await pg.evaluate(b => { const e = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return e ? e.outerHTML.slice(0, 120) : '' }, btn)
ok(hit.includes('addi:' + NUTMEG), 'B: il suggerimento è visibile e toccabile, non sotto la barra in basso — ' + hit)
for (let i = 0; i < 3; i++) { await pg.mouse.click(btn.x + btn.width / 2, btn.y + btn.height / 2); taps++; await pg.waitForTimeout(700) }
await idle()
R.B_added = (await nLines()) - l0
await pg.screenshot({ path: OUT + '/b_tre_tocchi.png' })
ok(await pg.locator('.mr-editbtn, .mr-ebar').count() && /Butter Spinach/.test(await pg.locator('h1').first().innerText()), 'B: i tocchi in più non aprono altro e non cancellano niente')
ok(R.B_added === 1, `B: 3 tocchi sullo stesso suggerimento = 1 riga (aggiunte ${R.B_added}; R1.15: 3)`)
ok((await gapsSince(t0)).length === 0, 'B: nessuna sparizione')

// C — add a step
let s0 = await nSteps(); t0 = await now()
await pg.click('[data-m="addstep"]'); R.C_visible_ms = await waitFor(async () => (await nSteps()) > s0)
ok(R.C_visible_ms != null && R.C_visible_ms < 300, `C: lo step compare subito (${R.C_visible_ms} ms) e ha il cursore: ${await pg.evaluate(() => (document.activeElement.dataset || {}).mt)}`)
await idle(); ok((await gapsSince(t0)).length === 0, 'C: la sezione ricetta non sparisce (R1.15: sparisce 3 s e più)')

// D — write the step, go to the next one and keep writing while the first is saving
const si = (await nSteps()) - 1
await pg.click('[data-m="addstep"]'); await waitFor(async () => (await nSteps()) > si + 1)
t0 = await now()
await pg.click(`[data-mt="step:${si}"]`); await pg.keyboard.type('Primo passo di prova', { delay: 40 })
await pg.click(`[data-mt="step:${si + 1}"]`); await pg.keyboard.type('Secondo passo scritto mentre salva', { delay: 60 })
const typingAt = await status()
await idle()
const st = await pg.evaluate(([a, b]) => { const q = i => document.querySelector(`[data-mt="step:${i}"]`); return { s1: q(a).textContent, s2: q(b).textContent, focus: document.activeElement === q(b) } }, [si, si + 1])
ok(st.s1 === 'Primo passo di prova' && st.s2 === 'Secondo passo scritto mentre salva', `D: nessun testo perso — "${st.s1}" / "${st.s2}" (R1.15: il secondo spariva)`)
ok(st.focus, 'D: il cursore resta nello step che sto scrivendo (R1.15: perso)')
ok(/Editing|Saving/.test(typingAt), 'D: mentre scrivo lo stato è "Editing/Saving": ' + typingAt)
let last = SAVED[SAVED.length - 1]
ok(last.steps[si].en === 'Primo passo di prova' && last.steps[si + 1].en === 'Secondo passo scritto mentre salva', 'D: il server ha ricevuto entrambi i testi, anche senza uscire dallo step')
ok(maxInflight === 1, `mai due salvataggi in volo insieme (massimo ${maxInflight}): nessuna risposta vecchia può sovrascrivere`)

// E — quantity
await pg.click('#main [data-mt]').catch(() => {})
const newId = last.lines.find(l => l.ref === NUTMEG && l.qty == null).id
await pg.click(`#main b.mq[data-mq="l:${newId}"]`); await pg.keyboard.type('2'); await pg.keyboard.press('Enter')
await idle(); last = SAVED[SAVED.length - 1]
ok(last.lines.find(l => l.id === newId).qty === 2, 'E: quantità 2 g salvata')

// F — out of order: first save very slow (5 s), edits continue meanwhile
slowFirst = 5000; const sv0 = SAVED.length
await pg.click('[data-m="addstep"]'); const k1 = (await nSteps()) - 1
await pg.keyboard.type('Terzo', { delay: 30 }); await pg.waitForTimeout(900)
await pg.keyboard.type(' passo finale', { delay: 30 })
await idle(); last = SAVED[SAVED.length - 1]
ok(last.steps[k1].en === 'Terzo passo finale', `F: l'ultimo salvataggio è il più recente ("${last.steps[k1].en}"), ${SAVED.length - sv0} invii in ordine, massimo in volo ${maxInflight}`)

// G — connection lost: the change stays, the state says so, Retry sends it
FAIL = 1
await pg.click('#mrAdd'); await pg.keyboard.type('salt', { delay: 80 }); await waitFor(() => pg.locator('[data-m^="addi:"]:text-is("Salt")').count())
const l1 = await nLines(); await pg.locator('[data-m^="addi:"]:text-is("Salt")').first().click()
await waitFor(async () => /Not saved/.test(await status()), 10000)
ok(/Not saved \(no connection\)/.test(await status()) && (await nLines()) === l1 + 1, 'G: senza rete la riga resta e lo stato dice "Not saved (no connection)" + Retry')
await pg.click('#main [data-m="retry"]'); await idle(); last = SAVED[SAVED.length - 1]
ok(last.lines.some(l => l.ref === '4720ed37-9e3b-417b-a949-b2bc60d5ec5f' && !OFF[SPIN].lines.some(x => x.id === l.id)) && /Saved/.test(await status()), 'G: Retry salva — ' + await status())

// H — Save draft, navigate away, reopen: identical count, order, quantities and text
const before = JSON.parse(JSON.stringify(SAVED[SAVED.length - 1]))
const svBefore = SAVED.length
await pg.click('.mr-ebar [data-m="savedraft"]'); await waitFor(async () => (await pg.locator('.mr-editbtn').count()) > 0, 15000)
const fl = await pg.locator('#main .mr-flash').innerText().catch(() => '')
ok(/DRAFT v\d+.*Not published/i.test(fl), 'H: messaggio chiaro — ' + fl)
ok(/DRAFT v\d+ · saved .* not published/.test(await pg.locator('#main .mr-dstate').innerText().catch(() => '')), 'H: la bozza dice sempre il suo stato — ' + await pg.locator('#main .mr-dstate').innerText().catch(() => ''))
ok(SAVED.length === svBefore, `H: "Save draft" senza modifiche nuove non rimanda niente (${SAVED.length - svBefore} invii)`)
await pg.click('button.w[data-w="restaurant"]'); await pg.waitForTimeout(400); await pg.fill('#q', 'spinach'); await pg.click('#main .rm-row:has(.name:text-is("Spinach Cup"))'); await pg.waitForSelector('.mr-editbtn', { timeout: 20000 })
await pg.click('button.w[data-w="restaurant"]'); await pg.waitForTimeout(400); await pg.fill('#q', 'butter spinach'); await pg.click('#main .rm-row:has(.name:text-is("Butter Spinach"))'); await pg.waitForSelector('.mr-editbtn', { timeout: 20000 })
await pg.waitForTimeout(3500)
const shown = await pg.evaluate(() => ({ lines: [...document.querySelectorAll('#main .mr-ings > li')].map(li => li.innerText.replace(/\s+/g, ' ').trim()), steps: [...document.querySelectorAll('#main .mr-steps > li')].map(li => li.innerText.replace(/\s+/g, ' ').trim()) }))
const stored = LAB[POS].draft
ok(JSON.stringify(stored) === JSON.stringify(before), 'H: la bozza sul server è identica all\'ultima versione scritta')
ok(shown.lines.length === before.lines.length && shown.steps.length === before.steps.length, `H: riaperta: ${shown.lines.length} ingredienti e ${shown.steps.length} step, come prima (${before.lines.length}/${before.steps.length})`)
ok(before.steps.every((s, i) => shown.steps[i].includes(s.en || s.it)), 'H: testo e ordine degli step identici')
ok(shown.lines.some(x => /Ground Nutmeg.*2 g/.test(x)), 'H: Ground Nutmeg 2 g dopo la riapertura — ' + shown.lines.join(' | '))
await pg.screenshot({ path: OUT + '/h_riaperta.png', fullPage: true })
console.log(JSON.stringify(R))
fs.writeFileSync(OUT + '/log.txt', log.join('\n') + '\n' + JSON.stringify(R) + '\n')
console.log(`# pass ${log.filter(x => x.startsWith('PASS')).length}\n# fail ${log.filter(x => x.startsWith('FAIL')).length}`)
await browser.close()
