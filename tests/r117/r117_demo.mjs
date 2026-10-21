// R1.17 DEMO (Chef 21/10 "STANDARD DI RESA, MULTILINGUA E SEMPLIFICAZIONE") — Spinach Cup in English, Italian, Spanish; 80 g cooked, 15 cups. iPhone, WebKit.
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
const REVIEW = {}, SAVED = []
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
    case 'mre_save_draft': if (!chef) return [403, 'forbidden']; saves++; SAVED.push(JSON.parse(JSON.stringify(b.doc))); { const v = E.validate(b.doc, null, false); if (v.length) return [400, 'non_valida:' + v.join(',')] } LAB[b.id] = LAB[b.id] || { versions: [], dv: 1 }; LAB[b.id].draft = b.doc; return { ok: true, draft_version: LAB[b.id].dv }
    case 'mre_discard': LAB[b.id].draft = null; return { ok: true }
    case 'mre_publish': publishCalls++; return [423, 'pubblicazione_bloccata']
    case 'mre_review': { if (!chef) return [403, 'forbidden']; reviews++; const L = LAB[b.id], root = L && L.draft ? Object.assign({}, L.draft, { id: b.id }) : docOf(b.id), t = treeOf(root), iss = E.issues(b.id, { doc: x => t.dr[x] || t.o[x], facts: x => facts[x], measures: S.measures })
      REVIEW[b.id] = b.verified === false ? null : { by: 'Max', at: new Date().toISOString(), open: iss.length, issues: iss }; return { ok: true, review: REVIEW[b.id] } }
    case 'office': return [403, 'forbidden']
    case 'mre_ingredients': return { ingredients: [], recipes: [] }
    case 'mre_translate': return translate(b)
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
// ---- the Chef's lab drafts of 21/10 evening (read-only copy) turned into the R1.17 structure ----
const CWS = 'db944759-42e3-4fdf-a705-d073f181d698', CONT2 = 'bb09009b-adba-4f20-a4a7-fe5ba4cd4ce7', NUT = '8d97bcc6-dcec-428e-a996-6c8725847aa9'
LAB[SPIN].draft = { schema: 1, id: SPIN, title: 'Spinach Cup', category: OFF[SPIN].category, has_stock: true, stock: OFF[SPIN].stock, notes: null,
  yield: { g: null, portions: 15, portion_g: 80, portion_unit: 'cup', label: null, label_hist: ['15 contenitori =7,5 porzioni'] },
  lines: [{ id: 'b1752', kind: 'ingredient', ref: CWS, qty: 4, unit: 'lb', role: 'produzione' }, { id: 'b1753', kind: 'ingredient', ref: 'fdf9aa4d-2bb0-4197-98ce-298fc7c1b52f', qty: 440, unit: 'g', role: 'produzione' },
    { id: 'b1754', kind: 'ingredient', ref: 'b86f83e6-694c-4136-89a2-c1509c8b3cb2', qty: 3, unit: 'g', role: 'produzione' }, { id: 'b1755', kind: 'ingredient', ref: '4720ed37-9e3b-417b-a949-b2bc60d5ec5f', qty: 10, unit: 'g', role: 'produzione' },
    { id: 'b1756', kind: 'ingredient', ref: CONT2, qty: 1, unit: 'each', per: 'portion', role: 'imballo' }], steps: [] }
LAB[POS].draft = Object.assign(LAB[POS].draft, { lines: [{ id: 'p1', kind: 'recipe', ref: SPIN, qty: 2, unit: 'portion', role: 'produzione', note: null, group: null }, { id: 'p2', kind: 'recipe', ref: PARM, qty: 5, unit: 'g', role: 'al_piatto', note: null, group: null }, { id: 'nmvi7khmg', kind: 'ingredient', ref: NUT, qty: 1, unit: 'g', role: 'produzione', note: null, group: null }],
  steps: [{ en: 'Scaldare due Cup di spinaci messe su un piatto bianco quadrato o verde rettangolare nel microonde senza la Cup di alluminio per un minuto e mezzo affinché caldi', es: '', it: '', title_en: null, title_es: null, title_it: null },
    { en: 'Spostare eventualmente gli spinaci senza schiacciarli, lasciandoli belli gonfi sul piatto di Servizio decorare con una spolverata di parmigiano e un pinch di noce moscata', es: '', it: '', title_en: null, title_es: null, title_it: null }] })
// ---- translator for the demo: the same path as the server (language, protected numbers, check). Brigade's service (ai-translate) is out of
// quota today and gives back the original: these demo translations were written by Claude and are marked "automatic, to check" like any other.
const W = t => t.replace(/\s+/g, ' ').trim()
const DEMO = {
  'Cuocere tutti gli spinaci insieme con gli ingredienti previsti.': { en: 'Cook all the spinach together with the listed ingredients.', es: 'Cocinar todas las espinacas juntas con los ingredientes previstos.' },
  'Lasciare raffreddare leggermente.': { en: 'Let cool slightly.', es: 'Dejar enfriar ligeramente.' },
  'Formare le Spinach Cups: mettere [[1]] g di spinaci cotti in ogni contenitore.': { en: 'Form the Spinach Cups: put [[1]] g of cooked spinach in each container.', es: 'Formar las Spinach Cups: poner [[1]] g de espinacas cocidas en cada recipiente.' },
  'Scaldare due Cup di spinaci messe su un piatto bianco quadrato o verde rettangolare nel microonde senza la Cup di alluminio per un minuto e mezzo affinché caldi': { en: 'Heat two spinach Cups, placed on a white square or green rectangular plate, in the microwave without the aluminum Cup for one and a half minutes until hot', es: 'Calentar dos Cups de espinacas, colocadas en un plato blanco cuadrado o verde rectangular, en el microondas sin la Cup de aluminio durante un minuto y medio hasta que estén calientes' },
  'Spostare eventualmente gli spinaci senza schiacciarli, lasciandoli belli gonfi sul piatto di Servizio decorare con una spolverata di parmigiano e un pinch di noce moscata': { en: 'If needed, move the spinach without pressing it, leaving it nice and fluffy on the serving plate; garnish with a sprinkle of parmesan and a pinch of nutmeg', es: 'Si hace falta, mover las espinacas sin aplastarlas, dejándolas bien esponjosas en el plato de servicio; decorar con un poco de parmesano espolvoreado y una pizca de nuez moscada' },
}
let trCalls = 0
function translate(b) { trCalls++
  return { items: (b.items || []).map(it => { const from = it.from || E.langOf(it.text).lang, out = {}
    for (const to of it.to.filter(x => x !== from)) { const p = E.protectTokens(it.text), d = DEMO[W(p.text)]; out[to] = E.restoreTokens(d ? d[to] : p.text, p.map, p.text) }   // unknown text = what ai-translate does today: the original back
    return { key: it.key, from, sure: true, out } }) }
}
const DELAY = { mre_save_draft: 900, mre_recipe: 600, mre_translate: 2000 }
const browser = await webkit.launch()
let LANG = 'en'
async function page() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const pg = await ctx.newPage()
  pg.on('pageerror', e => ok(false, 'errore JS: ' + e.message)); pg.on('console', m => { if (/^DBG/.test(m.text())) console.log(m.text()) })
  await pg.route('**/functions/v1/brigade-app-api', async r => { const b = JSON.parse(r.request().postData() || '{}'); await new Promise(x => setTimeout(x, DELAY[b.op] || 80))
    const out = api(b.op, b); if (Array.isArray(out)) return r.fulfill({ status: out[0], contentType: 'application/json', body: JSON.stringify({ ok: false, error: out[1] }) }); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) }) })
  await pg.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }))
  await pg.addInitScript(() => { localStorage.setItem('brigade-app-token', 'a'.repeat(64)); navigator.serviceWorker && (navigator.serviceWorker.register = () => Promise.resolve()) })
  await pg.addInitScript(L => localStorage.setItem('brigade-app-lang', L), LANG)
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`); await pg.waitForTimeout(1500)
  return pg
}
const txt = async (pg, sel) => (await pg.locator(sel).allInnerTexts()).join(' | ').replace(/\s+/g, ' ')
const shot = (pg, n, full) => pg.screenshot({ path: `${OUT}/${n}.png`, fullPage: !!full })
async function open(pg, q, name) { await pg.click('button.w[data-w="restaurant"]'); await pg.waitForSelector('#q'); await pg.fill('#q', q); await pg.click(`#main .rm-row:has(.name:text-is("${name}"))`); await pg.waitForSelector('#main .mr-ings', { timeout: 15000 }); await pg.waitForTimeout(300) }
const status = pg => pg.locator('#main [data-sst]').innerText().catch(() => '')
const idle = async pg => { for (let i = 0; i < 200; i++) { if (!(await pg.evaluate(() => window.MreUI.pending().length)) && /Saved|Salvata|Guardado/.test(await status(pg))) return true; await pg.waitForTimeout(100) } return false }
const last = () => SAVED[SAVED.length - 1]

let pg = await page()
// 1 — reading: 15 cups · 80 g each; containers come from "1 per cup"
await open(pg, 'spinach', 'Spinach Cup'); await shot(pg, '1_spinach_cup_lettura', true)
const head = await txt(pg, '#main .mr-yield'), ings = await txt(pg, '#main .mr-ings')
ok(/15 cups · 80 g each, cooked/.test(head), 'lettura: "' + head + '"')
ok(/Container Aluminum 4 oz Utility.*15/.test(ings) || /Container.*15/.test(ings), 'contenitori 15 calcolati da "1 per cup" — ' + ings.slice(0, 220))
ok(!/7,5|22 contenitori|15 contenitori/.test(await txt(pg, '#main .mr')), 'nessuna nota della resa con numeri sullo schermo')
ok(/\+ packaging \$0\.136/.test(await txt(pg, '#main .mr-fc')), 'imballo a cup $0,136 (1 contenitore), non moltiplicato — ' + await txt(pg, '#main .mr-fc'))
// 2 — editing: two numbers only, the rest derived
await pg.click('.mr-editbtn'); await pg.waitForSelector('#mrAdd'); await pg.waitForTimeout(500)
const ye = await txt(pg, '#main .mr-yield'), der = await txt(pg, '#main .mr-derived')
ok(/Expected yield 15 .*cups/.test(ye) && /Portion weight 80 g cooked/.test(ye) && !/Lot weight/.test(ye), 'modifica: "Expected yield 15 cups" + "Portion weight 80 g cooked", niente terzo numero — ' + ye)
ok(/1,2|1\.2/.test(der) && /15 × Container/i.test(der), 'calcolati, non scritti: ' + der)
ok(!(await pg.locator('#main [data-mt="label"]').count()), 'nessun campo "yield note" libero')
await shot(pg, '2_modifica_resa', true)
// 3 — the Chef writes the steps in Italian with the app in English
const steps = ['Cuocere tutti gli spinaci insieme con gli ingredienti previsti.', 'Lasciare raffreddare leggermente.', 'Formare le Spinach Cups: mettere 80 g di spinaci cotti in ogni contenitore.']
for (const [i, t] of steps.entries()) { await pg.click('[data-m="addstep"]'); await pg.waitForTimeout(150); await pg.keyboard.type(t, { delay: 8 }) }
await pg.click('#main h1.mr-title'); await pg.waitForTimeout(600)
const s3 = await pg.locator('#main [data-mt="step:2"]').innerHTML()
ok(/data-tok="y:portion_g"/.test(s3), '"80 g" nello step è diventato il peso porzione strutturato (non un numero di testo)')
ok(await pg.evaluate(() => document.activeElement && document.activeElement.matches('h1.mr-title')), 'mentre traduce in background il cursore resta dove l\'ho messo')
for (let i = 0; i < 60 && !(SAVED.length && last().steps.length === 3 && last().steps.every(s => s.tr && s.tr.en === 'auto' && s.tr.es === 'auto')); i++) await pg.waitForTimeout(200)
await idle(pg)
const L = last()
ok(L.steps.every(s => s.src === 'it') && L.steps.every(s => s.it && s.en && s.es), 'lingua riconosciuta: italiano (app in inglese); inglese e spagnolo prodotti in background e salvati')
ok(['it', 'en', 'es'].every(k => L.steps[2][k].includes('{{y:portion_g}}')), 'nelle tre lingue lo step 3 punta allo stesso valore strutturato: ' + ['it', 'en', 'es'].map(k => L.steps[2][k]).join(' | '))
ok(L.steps.every(s => s.tr.en === 'auto' && s.tr.es === 'auto'), 'traduzioni segnate "automatica · da verificare"')
await pg.click('#main [data-m="trs:2"]'); await pg.waitForTimeout(300); await shot(pg, '3_step_tre_lingue_modifica', true)
// 4 — 80 → 85: the number changes by itself in all three languages; back to 80
await pg.click('#main b.mq[data-mq="y:pg"]'); await pg.keyboard.press('Meta+A'); await pg.keyboard.type('85'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(400)
const t85 = await txt(pg, '#main .mr-steps')
await shot(pg, 'dbg_85'); ok((t85.match(/85/g) || []).length >= 3 && !/\b80\b/.test(t85), 'peso porzione 85: il numero cambia da solo in italiano, inglese e spagnolo — ' + (await txt(pg, '#main .mr-yield')) + ' || ' + (t85.match(/.{0,40}\b8[05]\b.{0,20}/g) || []).join(' ¦ '))
ok(/1,28|1\.28/.test(await txt(pg, '#main .mr-derived')), 'lotto previsto ricalcolato ≈ 1,28 kg')
await pg.click('#main b.mq[data-mq="y:pg"]'); await pg.keyboard.press('Meta+A'); await pg.keyboard.type('80'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(300)
// 5 — expected yield 16 → 16 containers by themselves; back to 15
await pg.click('#main b.mq[data-mq="y:p"]'); await pg.keyboard.press('Meta+A'); await pg.keyboard.type('16'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(300)
ok(/16 × Container/i.test(await txt(pg, '#main .mr-derived')) && /= 16 per lot/.test(await txt(pg, '#main .mr-ings')), 'resa prevista 16 → 16 contenitori da soli (nessun secondo numero da correggere)')
await pg.click('#main b.mq[data-mq="y:p"]'); await pg.keyboard.press('Meta+A'); await pg.keyboard.type('15'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(300)
await idle(pg)
// 6 — Save draft: clear state
await pg.click('.mr-ebar [data-m="savedraft"]'); await pg.waitForSelector('.mr-editbtn', { timeout: 15000 })
ok(/DRAFT v\d.*Not published/i.test(await txt(pg, '#main .mr-flash')), 'stato: ' + await txt(pg, '#main .mr-flash'))
const Ld = LAB[SPIN].draft
ok(Ld.yield.portions === 15 && Ld.yield.portion_g === 80 && Ld.yield.g == null && Ld.lines.find(l => l.id === 'b1756').qty === 1 && Ld.lines.find(l => l.id === 'b1756').per === 'portion', 'bozza salvata: 15 cups, 80 g, contenitori "1 per cup" — un numero, un posto')
// 7 — the same recipe in the three languages
const read = async (lang) => { LANG = lang; await pg.close(); pg = await page(); await open(pg, 'spinach', 'Spinach Cup'); await shot(pg, '4_spinach_cup_' + lang, true); await pg.locator('#main .mr-steps').scrollIntoViewIfNeeded(); await pg.evaluate(() => { const m = document.getElementById('main'), o = document.querySelector('#main .mr-steps'); m.scrollTop += o.getBoundingClientRect().top - 260 }); await pg.waitForTimeout(200); await shot(pg, '4b_procedimento_' + lang); return txt(pg, '#main .mr-steps') }
const en = await read('en'), it = await read('it'), es = await read('es')
ok(/Cook all the spinach/.test(en) && /put 80 g of cooked spinach/.test(en) && /automatic translation/.test(en) && !/Cuocere/.test(en), 'EN: istruzioni in inglese, 80 g, "automatic translation" — ' + en.slice(0, 160))
ok(/Cuocere tutti gli spinaci/.test(it) && /mettere 80 g/.test(it) && !/traduzione automatica/.test(it), 'IT: l\'originale dello Chef, senza segni — ' + it.slice(0, 120))
ok(/Cocinar todas las espinacas/.test(es) && /poner 80 g de espinacas cocidas/.test(es) && /traducción automática/.test(es), 'ES: istruzioni in spagnolo, 80 g — ' + es.slice(0, 160))
// 8 — the Chef corrects the Spanish of step 2 → verified
LANG = 'en'; await pg.close(); pg = await page(); await open(pg, 'spinach', 'Spinach Cup'); await pg.click('.mr-editbtn'); await pg.waitForSelector('#mrAdd'); await pg.waitForTimeout(400)
await pg.click('#main [data-m="trs:1"]'); await pg.waitForTimeout(200)
await pg.click('#main [data-mt="tr:1:es"]'); await pg.keyboard.press('Meta+A'); await pg.keyboard.type('Dejar enfriar un poco.'); await pg.click('#main h1.mr-title'); await idle(pg)
ok(last().steps[1].es === 'Dejar enfriar un poco.' && last().steps[1].tr.es === 'chef' && last().steps[1].it === 'Lasciare raffreddare leggermente.', 'correzione dello Chef in spagnolo: salvata come "verificata", l\'originale italiano intatto')
// 9 — the Chef changes the original → translations to update, then new ones
await pg.click('#main [data-mt="step:1"]'); await pg.keyboard.type('x', { delay: 5 }); await pg.waitForTimeout(150); await pg.keyboard.press('Backspace'); await pg.waitForTimeout(150)
await pg.click('#main [data-mt="step:0"]'); await pg.keyboard.press('Meta+A'); await pg.keyboard.type('Cuocere tutti gli spinaci insieme con gli ingredienti previsti.'); await pg.click('#main h1.mr-title'); await idle(pg)
ok(last().steps[1].tr.es === 'chef', 'lo Chef cambia l\'originale e lo rimette com\'era: la traduzione verificata resta valida — ' + JSON.stringify(last().steps[1]))
await pg.close()
// 10 — Butter Spinach: the Chef's Italian steps written with the app in English are recovered, never lost
pg = await page(); await open(pg, 'butter spinach', 'Butter Spinach')
const before = await txt(pg, '#main .mr-steps')
ok(/Scaldare due Cup/.test(before) && !/automatic translation/.test(before), 'oggi in inglese si legge l\'italiano senza avviso (il problema segnalato dallo Chef)')
await pg.click('.mr-editbtn'); await pg.waitForSelector('#mrAdd'); for (let i = 0; i < 60 && !(SAVED.length && last().id === POS && last().steps.every(s => s.tr && s.tr.en === 'auto')); i++) await pg.waitForTimeout(200)
await idle(pg)
const B = last()
ok(B.id === POS && B.steps[0].src === 'it' && B.steps[0].it.startsWith('Scaldare due Cup') && B.steps[1].it.includes('pinch') && B.steps.every(s => s.tr.en === 'auto' && s.tr.es === 'auto'), 'step recuperati: testo originale identico spostato in "italiano", inglese e spagnolo prodotti')
await shot(pg, '5_butter_spinach_modifica', true)
await pg.click('.mr-ebar [data-m="savedraft"]'); await pg.waitForSelector('.mr-editbtn', { timeout: 15000 })
const bsEn = await txt(pg, '#main .mr-steps'); await shot(pg, '6_butter_spinach_en', true); await pg.evaluate(() => { const m = document.getElementById('main'), o = document.querySelector('#main .mr-steps'); m.scrollTop += o.getBoundingClientRect().top - 200 }); await pg.waitForTimeout(200); await shot(pg, '6b_butter_spinach_procedimento_en')
ok(/Spinach Cup › 2 cups/.test(await txt(pg, '#main .mr-ings')), 'Butter Spinach: "Spinach Cup 2 cups" (porzioni della PREP, non tazze) — ' + (await txt(pg, '#main .mr-ings')).slice(0, 80))
ok(/Heat two spinach Cups/.test(bsEn) && /automatic translation/.test(bsEn), 'Butter Spinach in inglese: istruzioni in inglese, segnate automatiche — ' + bsEn.slice(0, 140))
// 11 — a step the translation service cannot translate (today: ai-translate gives back the original) is NOT stored as a translation
await pg.click('.mr-editbtn'); await pg.waitForSelector('#mrAdd'); await pg.click('[data-m="addstep"]'); await pg.keyboard.type('Servire subito ben caldo.', { delay: 5 }); await pg.click('#main h1.mr-title')
for (let i = 0; i < 40 && !(await pg.locator('#main .mr-trerr').count()); i++) await pg.waitForTimeout(200)
await idle(pg)
const s3b = last().steps[2]
ok(s3b.it === 'Servire subito ben caldo.' && !s3b.en && s3b.tr.en === 'stale' && await pg.locator('#main .mr-trerr').count() === 1, 'servizio di traduzione che restituisce l\'originale: NON salvato come inglese, resta "da aggiornare" e lo dice — ' + await txt(pg, '#main .mr-trerr') + ' ' + JSON.stringify(s3b))
await pg.click('.mr-ebar [data-m="savedraft"]'); await pg.waitForSelector('.mr-editbtn', { timeout: 15000 })
ok(/original in Italiano · translation on the way/.test(await txt(pg, '#main .mr-steps')), 'in inglese lo step si legge nell\'originale, segnato — mai spacciato per inglese')
// 12 — food cost from the same PREP; actual cost with a real lot of 14
await open(pg, 'spinach', 'Spinach Cup'); await pg.click('#main [data-m="p:cost"]'); await pg.waitForTimeout(200)
await pg.click('#main b.mq[data-mq="rp"]'); await pg.keyboard.type('14'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(300)
const cp = await txt(pg, '#main .mr-panel')
ok(/Actual cost per cup \(14\)/.test(cp) && /standard 15/.test(cp), 'lotto reale di 14 cups: costo effettivo calcolato, la ricetta resta 15 — ' + cp.match(/Real lot.*?standard 15: \$[\d.]+/)?.[0])
await shot(pg, '7_costo_resa_reale', true)
const pTitle = await txt(pg, '#main .mr-fc')
ok(/\/ portion|\/ cup/.test(pTitle), 'food cost a cup: ' + pTitle)
console.log(`traduzioni chieste: ${trCalls}, salvataggi: ${SAVED.length}`)
fs.writeFileSync(OUT + '/log.txt', log.join('\n') + '\n')
console.log(`# pass ${log.filter(x => x.startsWith('PASS')).length}\n# fail ${log.filter(x => x.startsWith('FAIL')).length}`)
await browser.close()
