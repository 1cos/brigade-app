// R1.13 (Chef 20/10 "TRUST · EASY · CLEAN") — the final Recipe Master interface, iPhone size, WebKit.
// List = the 265 real Brigade recipes (read-only snapshot, kinds as the server computes them) + the Chef's proposal.
// Recipe contents = the read-only snapshot of step A. API answered in memory with the shapes of brigade-app-api/mre.ts
// (tested on its own in tests/stepA/bench.mjs). Nothing is sent to Supabase.
// Usage: PORT=<static server for web/> FLAKES_FACTS=<json> node tests/r113/r113_ui_mock.mjs <snap2_parsed.json> <titles.json> <outDir>
import { webkit } from '/Users/massimilianozubboli/cw-probe/node_modules/playwright-core/index.mjs'
import fs from 'node:fs'
import * as E from '../../supabase/functions/_shared/mre_engine.js'
import { buildLabDoc } from '../../supabase/functions/_shared/mre_import.js'
const [SNAP, TITLES, OUT] = process.argv.slice(2), PORT = process.env.PORT || '18791'
fs.mkdirSync(OUT, { recursive: true })
const S = JSON.parse(fs.readFileSync(SNAP, 'utf8')), TT = JSON.parse(fs.readFileSync(TITLES, 'utf8')).rows
const byId = Object.fromEntries(S.recipes.map(r => [r.id, r])), Y = Object.fromEntries(S.yield.map(y => [y.id, y]))
const OFF = {}, DIFFS = {}
for (const r of S.recipes) { const o = buildLabDoc({ id: r.id, r, rows: S.bom.filter(b => b.parent_recipe_id === r.id), stepRows: S.steps.filter(s => s.recipe_id === r.id), prepRows: S.prep.filter(p => p.recipe_id === r.id && !p.archived), y: Y[r.id], byId, importedAt: 'now' }); OFF[r.id] = Object.assign(o.doc, { id: r.id, _source: 'official' }); DIFFS[r.id] = o.diffs }
const SPIN = '9cec677b-55d6-4329-9dae-5dd4d489e147', PARM = '6357c9f1-f944-4153-8d7f-afb11336d91a', WHEEL = '5479387e-e4ad-4401-92ce-9cb785ef4a0d', POS = 'b0490000-0000-4000-8000-0000000000a1'
const FLAKES = 'bb3717e0-3d2c-43ef-aac4-dc5df13f5d8a', ARTI = 'dbdc80fd-142f-4ca1-8f83-7bcebe19ee63'
const facts = Object.assign({}, S.facts); if (!facts[FLAKES]) facts[FLAKES] = JSON.parse(process.env.FLAKES_FACTS || 'null')
const spinDraft = Object.assign(JSON.parse(JSON.stringify(OFF[SPIN])), { title: 'Spinach Cup', yield: Object.assign({}, OFF[SPIN].yield, { portions: 22, label: '22 contenitori = 22 porzioni (CD-067)' }), lines: OFF[SPIN].lines.filter(l => l.id !== 'b1757') })
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
let role = 'chef', publishCalls = 0, saves = 0, reviews = 0
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
    case 'mre_review': if (!chef) return [403, 'forbidden']; reviews++; REVIEW[b.id] = b.verified === false ? null : { by: 'Max', at: new Date().toISOString() }; return { ok: true, review: REVIEW[b.id] }
    case 'office': return [403, 'forbidden']
    case 'mre_ingredients': return { ingredients: [], recipes: [] }
  }
  return [400, 'bad_op']
}
const log = []
const ok = (c, m) => { log.push((c ? 'PASS ' : 'FAIL ') + m); console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1 }
const browser = await webkit.launch()
async function page(w, h, dark) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, colorScheme: dark ? 'dark' : 'light' })
  const pg = await ctx.newPage()
  pg.on('pageerror', e => ok(false, 'errore JS: ' + e.message))
  await pg.route('**/functions/v1/brigade-app-api', async r => { const b = JSON.parse(r.request().postData() || '{}'); const out = api(b.op, b); if (Array.isArray(out)) return r.fulfill({ status: out[0], contentType: 'application/json', body: JSON.stringify({ ok: false, error: out[1] }) }); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) }) })
  await pg.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }))
  await pg.addInitScript(L => { localStorage.setItem('brigade-app-token', 'a'.repeat(64)); localStorage.setItem('brigade-app-lang', L); navigator.serviceWorker && (navigator.serviceWorker.register = () => Promise.resolve()) }, process.env.LANG2 || 'it')
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`); await pg.waitForTimeout(700)
  return pg
}
const txt = async (pg, sel) => (await pg.locator(sel).allInnerTexts()).join(' | ').replace(/\s+/g, ' ')
const list = async pg => { await pg.click('button.w[data-w="restaurant"]'); await pg.waitForTimeout(500) }
const shot = async (pg, name, full) => pg.screenshot({ path: `${OUT}/${name}.png`, fullPage: !!full })
const noScrollX = async pg => pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1 && [...document.querySelectorAll('#main *')].every(e => e.getBoundingClientRect().right <= window.innerWidth + 1 || getComputedStyle(e).overflowX !== 'visible' || e.closest('.rm-chips,.seg')))
const LABTXT = /laboratorio|sola lettura|read.only|proposta|lab proposal|ufficiale|importata|test mode/i
const rowNames = pg => pg.$$eval('#main .rm-row .name', els => els.map(e => e.textContent.trim()))


// ---- REPRO of the iPhone problem (R1.13a): tap a bold quantity in the reading card
let pg = await page(390, 844)
await list(pg); await pg.fill('#q', 'spinach'); await pg.waitForTimeout(500)
await pg.click('#main .rm-row:has(.name:text-is("Butter Spinach"))'); await pg.waitForTimeout(800)
const toastTxt = async () => (await pg.locator('.toast:not([hidden])').allInnerTexts()).join(' ')
const tapQty = async (sel, val) => { await pg.click(sel); if (val != null) { await pg.keyboard.press('Meta+A'); await pg.keyboard.type(String(val)) } await pg.keyboard.press('Enter'); await pg.waitForTimeout(300) }
const rows = await pg.$$eval('.mr-ings li', ls => ls.map(l => ({ name: l.querySelector('.mr-nm')?.innerText.split('\n')[0], u: l.querySelector('b.mq')?.dataset.u, key: l.querySelector('b.mq')?.dataset.mq })))
console.log('RIGHE', JSON.stringify(rows))
for (const r of rows) { if (!r.key) continue
  await tapQty(`.mr-ings b.mq[data-mq="${r.key}"]`, null); const t1 = await toastTxt()
  await pg.waitForTimeout(2700)
  await tapQty(`.mr-ings b.mq[data-mq="${r.key}"]`, 2); const t2 = await toastTxt()
  console.log(`REPRO ${r.name} (unità mostrata "${r.u}"): tocco senza cambiare → "${t1}" | scrivo 2 → "${t2}"`)
  await pg.screenshot({ path: `${OUT}/repro_${r.key.replace(/[^a-z0-9]/gi, '_')}.png` })
  if (await pg.locator('[data-m="reset"]').count()) await pg.click('[data-m="reset"]'); await pg.waitForTimeout(2700) }
// the same in the Spinach Cup prep
await pg.click('.mr-sub:has-text("Spinach Cup")'); await pg.waitForTimeout(800); if (await pg.locator('[data-m="reset"]').count()) await pg.click('[data-m="reset"]')
const rows2 = await pg.$$eval('.mr-ings li', ls => ls.map(l => ({ name: l.querySelector('.mr-nm')?.innerText.split('\n')[0], u: l.querySelector('b.mq')?.dataset.u, key: l.querySelector('b.mq')?.dataset.mq })))
for (const r of rows2.concat([{ name: 'RESA porzioni', key: 'y:p' }, { name: 'RESA g', key: 'y:g' }])) { const sel = r.key.startsWith('y:') ? `.mr-yield b.mq[data-mq="${r.key}"]` : `.mr-ings b.mq[data-mq="${r.key}"]`; if (!(await pg.locator(sel).count())) { console.log('REPRO', r.name, 'assente'); continue }
  await tapQty(sel, null); const t1 = await toastTxt(); await pg.waitForTimeout(2700)
  await tapQty(sel, 2); const t2 = await toastTxt()
  console.log(`REPRO Spinach Cup · ${r.name} ("${r.u || ''}"): tocco → "${t1}" | 2 → "${t2}"`)
  if (await pg.locator('[data-m="reset"]').count()) await pg.click('[data-m="reset"]'); await pg.waitForTimeout(2700) }
await pg.click('.mr-editbtn'); await pg.waitForTimeout(300); await pg.screenshot({ path: `${OUT}/repro_edit_spinach_cup.png`, fullPage: true })
console.log('EDIT Spinach Cup note righe:', JSON.stringify(await pg.$$eval('.mr-ings li .mr-note', e => e.map(x => x.innerText))))
console.log('EDIT resa:', await txt(pg, '.mr-yield'))
await browser.close()
