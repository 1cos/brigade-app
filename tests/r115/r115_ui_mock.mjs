// R1.15 (Chef GO 21/10 "SUGGERIMENTI INTELLIGENTI DA FATTURE") — Suggested purchase match in the ingredient card, draft vs in-use values, packaging cost. iPhone, WebKit.
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
const REVIEW = {}
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
    case 'mre_save_draft': if (!chef) return [403, 'forbidden']; saves++; LAB[b.id] = LAB[b.id] || { versions: [], dv: 1 }; LAB[b.id].draft = b.doc; return { ok: true, draft_version: LAB[b.id].dv }
    case 'mre_discard': LAB[b.id].draft = null; return { ok: true }
    case 'mre_publish': publishCalls++; return [423, 'pubblicazione_bloccata']
    case 'mre_review': { if (!chef) return [403, 'forbidden']; reviews++; const L = LAB[b.id], root = L && L.draft ? Object.assign({}, L.draft, { id: b.id }) : docOf(b.id), t = treeOf(root), iss = E.issues(b.id, { doc: x => t.dr[x] || t.o[x], facts: x => facts[x], measures: S.measures })
      REVIEW[b.id] = b.verified === false ? null : { by: 'Max', at: new Date().toISOString(), open: iss.length, issues: iss }; return { ok: true, review: REVIEW[b.id] } }
    case 'office': return [403, 'forbidden']
    case 'mre_ingredients': return { ingredients: [], recipes: [] }
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
const browser = await webkit.launch()
let LANG = 'en'
async function page(w, h, dark) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, colorScheme: dark ? 'dark' : 'light' })
  const pg = await ctx.newPage()
  pg.on('pageerror', e => ok(false, 'errore JS: ' + e.message))
  await pg.route('**/functions/v1/brigade-app-api*', async r => { const b = JSON.parse(r.request().postData() || '{}'); const out = api(b.op, b); if (Array.isArray(out)) return r.fulfill({ status: out[0], contentType: 'application/json', body: JSON.stringify({ ok: false, error: out[1] }) }); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) }) })
  await pg.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }))
  await pg.addInitScript(L => { localStorage.setItem('brigade-app-token', 'a'.repeat(64)); localStorage.setItem('brigade-app-lang', L); navigator.serviceWorker && (navigator.serviceWorker.register = () => Promise.resolve()) }, LANG)
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`); await pg.waitForTimeout(700)
  return pg
}
const txt = async (pg, sel) => (await pg.locator(sel).allInnerTexts()).join(' | ').replace(/\s+/g, ' ')
const list = async pg => { await pg.click('button.w[data-w="restaurant"]'); await pg.waitForTimeout(500) }
const shot = async (pg, name, full) => pg.screenshot({ path: `${OUT}/${name}.png`, fullPage: !!full })
const noScrollX = async pg => pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1 && [...document.querySelectorAll('#main *')].every(e => e.getBoundingClientRect().right <= window.innerWidth + 1 || getComputedStyle(e).overflowX !== 'visible' || e.closest('.rm-chips,.seg')))
const LABTXT = /laboratorio|sola lettura|read.only|proposta|lab proposal|ufficiale|importata|test mode/i
const rowNames = pg => pg.$$eval('#main .rm-row .name', els => els.map(e => e.textContent.trim()))



const flashTxt = async pg => txt(pg, '.mr-flash')
LANG = 'it'
let pg = await page(390, 844)
await list(pg); await pg.fill('#q', 'spinach'); await pg.waitForTimeout(500)
await pg.click('#main .rm-row:has(.name:text-is("Spinach Cup"))'); await pg.waitForTimeout(800)
await pg.click('.mr-ings button[data-a="openIng"]:has-text("Alluminium Cups"), .mr-ings button[data-a="openIng"]:has-text("Bicchierini")'); await pg.waitForTimeout(900)
await shot(pg, 'c1_scheda_alluminium', true)
// 1. draft vs in use, never mixed
const cx = await txt(pg, '.pm-ctx')
ok(/Bozza v2/i.test(cx) && /22 pz per lotto · 1 pz a porzione \(22 porzioni\)/.test(cx), 'bozza Spinach Cup: 22 per lotto, 1 a porzione (22 porzioni) — ' + cx.slice(0, 160))
ok(/In uso · BUTTER SPINACH/i.test(cx) && /1,47 pz a porzione \(15 porzioni\)/.test(cx), 'in uso BUTTER SPINACH: 1,47 a porzione (15 porzioni), con l\'etichetta "In uso"')
// 2. suggested purchase match
const pm = await txt(pg, '.pm')
ok(/Acquisto suggerito/i.test(pm) && /Cont Alum 4 Oz Utility/.test(pm) && /Ben E\. Keith #168430/.test(pm) && /Corrispondenza forte/.test(pm), 'Acquisto suggerito: Cont Alum 4 Oz Utility · Ben E. Keith #168430 · forte')
ok(/ultima fattura gio 2 lug · n\. 0002464786/.test(pm) && /1\/ 1000 CT · \$135\.91 → \$0\.13591 al pezzo/.test(pm), 'fattura 02/07, 1/1000 CT, $135,91 → $0,13591 al pezzo — ' + pm.slice(0, 260))
ok(/a pezzi, come nella ricetta/.test(pm) && /in Brigade come «Container Aluminum 4 oz Utility»/.test(pm), 'motivo: nome, a pezzi come nella ricetta, articolo canonico in Brigade')
ok(await pg.locator('.pm button[data-d="collega"]').count() === 1 && await pg.locator('.pm button[data-d="non_corrisponde"]').count() >= 1 && await pg.locator('.pm [data-a="pmMore"]').count() === 1, 'pulsanti: Collega alla bozza · Non corrisponde · Cerca altri')
ok(decides === 0 && saves === 0, 'niente collegato da solo')
const buy = await txt(pg, 'details[data-k="buy"] summary'); ok(/0 · 1 suggerito/.test(buy), '"Dettagli acquisto": 0 · 1 suggerito (non "0" muto) — ' + buy)
const use = await txt(pg, '.ksum'); ok(/≥ 83,47/.test(use) && /Previsione incompleta.*non usarla come quantità da ordinare/.test(use), 'consumo ≥ 83,47 con conversione mancante: previsione incompleta, non da ordinare')
// 3. search more, reject a wrong one
await pg.click('.pm [data-a="pmMore"]'); await pg.waitForTimeout(500); await shot(pg, 'c2_cerca_altri', true)
const more = await txt(pg, '.pm'); ok(/Debole — da controllare/.test(more) && /Scoop/.test(more), 'Cerca altri: candidati deboli (es. paletta gelato) segnati "da controllare"')
await pg.click('.pm-c:has-text("Scoop") button[data-d="non_corrisponde"]'); await pg.waitForTimeout(500)
ok(!/Scoop/.test(await txt(pg, '.pm')) && /1 scartati/.test(await txt(pg, '.pm')) && /non verrà più proposto/.test(await txt(pg, '.pm')), 'Non corrisponde: sparisce, "1 scartati", non verrà più proposto')
// 4. link to the draft
await pg.click('.pm-c:has-text("Cont Alum") button[data-d="collega"]'); await pg.waitForTimeout(600); await shot(pg, 'c3_collegato')
ok(/Collegato nella bozza \(v2\): Container Aluminum 4 oz Utility/.test(await txt(pg, '.pm')) && /Collegato/.test(await txt(pg, '.pm-c')), 'Collega: "Collegato nella bozza (v2)", la ricetta in uso non cambia')
ok(LAB[SPIN].draft.lines.find(l => l.id === 'b1756').ref === CONT && OFF[SPIN].lines.find(l => l.id === 'b1756').ref === CUPS, 'solo la bozza punta al contenitore Ben E. Keith; ufficiale invariata')
await pg.click('#main .back, #main [data-a="back"]').catch(() => {}); await pg.waitForTimeout(400)
if (!/Spinach Cup/.test(await txt(pg, 'h1').catch(() => ''))) { await list(pg); await pg.fill('#q', 'spinach'); await pg.waitForTimeout(400); await pg.click('#main .rm-row:has(.name:text-is("Spinach Cup"))'); await pg.waitForTimeout(800) }
await shot(pg, 'c4_spinach_cup_dopo')
const ings = await txt(pg, '.mr-ings'); ok(/Container Aluminum 4 oz Utility/.test(ings) && /22 pz/.test(ings), 'Spinach Cup: riga contenitore = Container Aluminum 4 oz Utility, 22 pz')
const fc = await txt(pg, '.mr-fc'); ok(/\+ imballo \$0\.136/.test(fc), 'food cost Spinach Cup + imballo $0,136 a porzione — ' + fc)
await pg.click('.mr-issues summary').catch(() => {}); const iss = await txt(pg, '.mr-issues'); ok(!/Alluminium|Container/.test(iss) && /White Pepper/.test(iss), 'problemi aperti: contenitore risolto, resta White Pepper senza prezzo — ' + iss)
// 5. Butter Spinach
await list(pg); await pg.fill('#q', 'butter spinach'); await pg.waitForTimeout(400); await pg.click('#main .rm-row:has(.name:text-is("Butter Spinach"))'); await pg.waitForTimeout(800)
const fb = await txt(pg, '.mr-fc'); ok(/\$0\.886/.test(fb) && /\+ imballo \$0\.136/.test(fb) && /parziale/.test(fb), 'Butter Spinach: $0,886 a porzione (parziale) + imballo $0,136 — ' + fb)
await pg.click('.mr-editbtn'); await pg.click('.mr-ebar [data-m="pv:1"]'); await pg.waitForTimeout(300); await shot(pg, 'c5_anteprima_butter_spinach', true)
ok(/Imballo a porzione/.test(await txt(pg, '.mr-change')), 'Anteprima: imballo a porzione mostrato a parte')
await pg.click('.mr-ebar [data-m="pv:0"]'); await pg.click('.mr-foot [data-m="cancel"]'); await pg.waitForTimeout(100)
// 6. wrong / no match: White Pepper
await list(pg); await pg.fill('#q', 'spinach'); await pg.waitForTimeout(400); await pg.click('#main .rm-row:has(.name:text-is("Spinach Cup"))'); await pg.waitForTimeout(700)
await pg.click('.mr-ings button[data-a="openIng"]:has-text("White Pepper"), .mr-ings button[data-a="openIng"]:has-text("Pepe Bianco")'); await pg.waitForTimeout(800)
const wp = await txt(pg, '.pm'); ok(/Nessun acquisto compatibile/.test(wp) && !/Corrispondenza forte|Possibile/.test(wp), 'White Pepper: nessun acquisto compatibile (il pepe nero non viene proposto)'); await shot(pg, 'c6_white_pepper')
ok(await noScrollX(pg), 'nessuno scorrimento orizzontale')
await pg.context().close()
// 7. cook: no purchase box
role = 'staff'; pg = await page(390, 844); await list(pg); await pg.fill('#q', 'spinach'); await pg.waitForTimeout(400)
await pg.click('#main .rm-row:has(.name:text-is("BUTTER SPINACH"))'); await pg.waitForTimeout(800)
await pg.click('.mr-ings button[data-a="openIng"]:has-text("Alluminium Cups"), .mr-ings button[data-a="openIng"]:has-text("Bicchierini")').catch(() => {}); await pg.waitForTimeout(700)
ok(!(await pg.locator('.pm').count()) && !/\$/.test(await txt(pg, '#main')), 'cuoco: niente acquisti suggeriti, niente prezzi')
await pg.context().close()
fs.writeFileSync(`${OUT}/log.txt`, log.join('\n') + '\n'); await browser.close()
console.log(log.filter(l => l.startsWith('PASS')).length + '/' + log.length)
