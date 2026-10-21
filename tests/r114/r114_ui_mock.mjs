// R1.14 (Chef 21/10 "CORREZIONI URGENTI DOPO TEST REALE IPHONE") — reproduce the iPhone error, then prove the fix. iPhone size, WebKit, EN + IT.
// List = the 265 real Brigade recipes (read-only snapshot, kinds as the server computes them) + the Chef's proposal.
// Recipe contents = the read-only snapshot of step A. API answered in memory with the shapes of brigade-app-api/mre.ts
// (tested on its own in tests/stepA/bench.mjs). Nothing is sent to Supabase.
// Usage: PORT=<static server for web/> FLAKES_FACTS=<json> CW=<facts_cw_parsed.json> node tests/r114/r114_ui_mock.mjs <snap2_parsed.json> <titles.json> <outDir>
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
    case 'mre_review': { if (!chef) return [403, 'forbidden']; reviews++; const L = LAB[b.id], root = L && L.draft ? Object.assign({}, L.draft, { id: b.id }) : docOf(b.id), t = treeOf(root), iss = E.issues(b.id, { doc: x => t.dr[x] || t.o[x], facts: x => facts[x], measures: S.measures })
      REVIEW[b.id] = b.verified === false ? null : { by: 'Max', at: new Date().toISOString(), open: iss.length, issues: iss }; return { ok: true, review: REVIEW[b.id] } }
    case 'office': return [403, 'forbidden']
    case 'mre_ingredients': return { ingredients: [], recipes: [] }
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
  await pg.route('**/functions/v1/brigade-app-api', async r => { const b = JSON.parse(r.request().postData() || '{}'); const out = api(b.op, b); if (Array.isArray(out)) return r.fulfill({ status: out[0], contentType: 'application/json', body: JSON.stringify({ ok: false, error: out[1] }) }); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) }) })
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


const toastTxt = async pg => (await pg.locator('.toast:not([hidden])').allInnerTexts()).join(' ')
const NOCONV = /cannot be converted|missing conversion|non si può convertire|cannot recalculate|non posso ricalcolare/i
const tap = async (pg, sel, val) => { await pg.click(sel); if (val != null) { await pg.keyboard.press('Meta+A'); await pg.keyboard.type(String(val)) } await pg.keyboard.press('Enter'); await pg.waitForTimeout(250) }
const tabsNamed = async pg => (await pg.$$eval('#tabs > *', e => e.map(x => x.innerText.replace('×', '').trim()))).every(x => x.length > 0)

// ===== 1. the exact iPhone gesture (EN): open Butter Spinach, tap every bold quantity, with and without a new number
let pg = await page(390, 844)
await list(pg); await pg.fill('#q', 'spinach'); await pg.waitForTimeout(500)
await pg.click('#main .rm-row:has(.name:text-is("Butter Spinach"))'); await pg.waitForTimeout(800)
await shot(pg, 'a1_butter_spinach_en')
let msgs = []
for (const k of await pg.$$eval('.mr b.mq', e => e.map(x => x.dataset.mq))) {
  await tap(pg, `.mr b.mq[data-mq="${k}"]`, null); msgs.push(k + ':' + (await toastTxt(pg)) + (await txt(pg, '.mr-inlerr')))
  await tap(pg, `.mr b.mq[data-mq="${k}"]`, 2); msgs.push(k + ':' + (await toastTxt(pg)) + (await txt(pg, '.mr-inlerr')))
  if (await pg.locator('[data-m="reset"]').count()) await pg.click('[data-m="reset"]'); await pg.waitForTimeout(150) }
ok(!msgs.some(m => NOCONV.test(m)), 'Butter Spinach: tocco su ogni quantità (anche Spinach Cup "1 porz.") → nessun messaggio di conversione · ' + msgs.length + ' tocchi')
await tap(pg, '.mr-ings b.mq[data-mq="l:p1"]', 2); ok(/2 portion/.test(await txt(pg, '.mr-ings')) && /10 g/.test(await txt(pg, '.mr-ings')), 'Spinach Cup 1 → 2: si ricalcola (2 cup, parmigiano 10 g)')
await shot(pg, 'a2_scalato_2'); await pg.click('[data-m="reset"]')
// ===== 2. food cost state and open problems
const fc = await txt(pg, '.mr-fc'); ok(/partial/i.test(fc) && /\$0\.886/.test(fc), 'food cost $0.886 / portion · PARTIAL (spinaci Chef\'s Warehouse; pepe bianco senza prezzo) — ' + fc)
await pg.click('.mr-issues summary'); await pg.waitForTimeout(200); const iss = await txt(pg, '.mr-issues')
ok(/White Pepper: no price \(in Spinach Cup\)/.test(iss) && /Alluminium Cups: packaging without price/.test(iss) && /method not written/i.test(iss) && !/conversion|piece weight/i.test(iss), 'problemi aperti: ' + iss)
await shot(pg, 'a3_problemi_aperti')
// ===== 3. Spinach Cup: no invented weight, counts are counts
await pg.click('.mr-sub:has-text("Spinach Cup")'); await pg.waitForTimeout(800); await pg.click('[data-m="reset"]'); await pg.waitForTimeout(200)
const yv = await txt(pg, '.mr-yield'); ok(/22 portions/.test(yv) && !/kg|\bg\b/.test(yv), 'Spinach Cup: resa "22 portions", nessun peso inventato — ' + yv)
msgs = []
for (const k of await pg.$$eval('.mr b.mq', e => e.map(x => x.dataset.mq))) { await tap(pg, `.mr b.mq[data-mq="${k}"]`, null); await tap(pg, `.mr b.mq[data-mq="${k}"]`, 2); msgs.push(k + ':' + (await toastTxt(pg)) + (await txt(pg, '.mr-inlerr'))); if (await pg.locator('[data-m="reset"]').count()) await pg.click('[data-m="reset"]'); await pg.waitForTimeout(150) }
ok(!msgs.some(m => NOCONV.test(m)), 'Spinach Cup: ogni quantità e la resa si ricalcolano senza errori (' + msgs.length + ')')
await tap(pg, '.mr-yield b.mq[data-mq="y:p"]', 11); ok(/907 g/.test(await txt(pg, '.mr-ings')) && /11 cups|11 pz|11/.test(await txt(pg, '.mr-ings')), '11 porzioni = mezzo lotto: spinaci 907 g, 11 contenitori'); await shot(pg, 'a4_spinach_cup_11'); await pg.click('[data-m="reset"]')
ok(/Spinach\b/.test(await txt(pg, '.mr-ings')) && !/Fresh Spinach/.test(await txt(pg, '.mr-ings')), 'bozza Spinach Cup: spinaci = articolo Chef\'s Warehouse ("Spinach")')
await pg.click('[data-m="p:cost"]'); await pg.waitForTimeout(200); const cp = await txt(pg, '.mr-panel'); ok(/Hardie|Chef/.test(cp) && !/H-E-B/.test(cp), 'food cost: spinaci dal fornitore abituale (fattura 14/10), non H-E-B')
await pg.click('[data-m="p:struct"]'); await pg.waitForTimeout(200); await pg.locator('.mr-panel').scrollIntoViewIfNeeded(); await shot(pg, 'a5_tre_registri')
const st = await txt(pg, '.mr-panel'); ok(/Physical stock/i.test(st) && /Only from a count/.test(st), 'struttura: consumo / produzione / giacenza fisica tenuti separati')
// ===== 4. Edit: clean, Advanced closed, weight optional, cups do not ask a weight
await pg.click('.mr-editbtn'); await pg.waitForTimeout(300); await shot(pg, 'a6_modifica_spinach_cup')
ok(!(await pg.locator('.mr-adv').count()) && /Advanced$/.test((await txt(pg, '[data-m="adv"]')).trim()), 'Advanced chiuso all\'apertura')
const ey = await txt(pg, '.mr-yield'); ok(/Expected yield 22/.test(ey) && /Portion weight — g/.test(ey), 'resa in modifica (R1.17): resa prevista + peso porzione, nessun peso obbligatorio — ' + ey)
const cupsLine = await txt(pg, '.mr-eline:has-text("Alluminium Cups")'); ok(!/weight of one piece/i.test(cupsLine), 'Alluminium Cups 22 each: nessuna richiesta di peso — ' + cupsLine.slice(0, 80))
const peppers = await txt(pg, '.mr-eline:has-text("White Pepper")'); ok(/no price/i.test(peppers), 'White Pepper: manca il prezzo (segnalato)')
await pg.click('[data-m="adv"]'); await pg.waitForTimeout(200); ok(await pg.locator('select[data-ms^="role:"]').count() > 0, 'Advanced su richiesta: ruoli della prep')
await pg.click('.mr-ebar [data-m="pv:1"]'); await pg.waitForTimeout(300); await shot(pg, 'a7_anteprima_spinach_cup', true)
ok(/open problems/i.test(await txt(pg, '.mr-change')) && await pg.locator('.mr-pub[disabled]').count() === 1, 'Anteprima: problemi aperti visibili, Pubblica spento')
await pg.click('.mr-foot [data-m="cancel"]'); await pg.waitForTimeout(150); await pg.click('.mr-ebar [data-m="savedraft"]'); await pg.waitForTimeout(500)
// ===== 5. Butter Spinach editor: role
await pg.click('#tabs > *:has-text("Butter Spinach")'); await pg.waitForTimeout(400)
await pg.click('.mr-editbtn'); await pg.waitForTimeout(300); await pg.click('[data-m="adv"]'); await pg.waitForTimeout(200)
const adv = await txt(pg, '.mr-ings'); ok(/taken at the sale/.test(adv) && !(await pg.locator('select[data-ms^="role:"]').count()), 'POS ITEM: niente scelta di ruolo, "taken at the sale" (Spinach Cup e parmigiano si scaricano alla vendita)')
await shot(pg, 'a8_butter_spinach_advanced'); await pg.click('[data-m="adv"]'); await pg.click('.mr-ebar [data-m="savedraft"]'); await pg.waitForTimeout(500)
// ===== 6. review = review, problems stay
await pg.locator('.mr-review').scrollIntoViewIfNeeded(); const rb = await txt(pg, '.mr-review'); ok(/Reviewed · next/.test(rb) && !/Verified/.test(rb), 'pulsante: "Reviewed · next" (revisione, non completa né pubblicata)')
await pg.click('[data-m="review"]'); await pg.waitForTimeout(800)
await list(pg); await pg.fill('#q', 'butter'); await pg.waitForTimeout(500); const row = await txt(pg, '#main .rm-row:has(.name:text-is("Butter Spinach"))')
ok((await pg.locator('#main .rm-row:has(.name:text-is("Butter Spinach")) .rm-check.on').count()) === 1 && /⚠ 3/.test(row), 'elenco: Butter Spinach ✓ revisionata con ⚠ 3 problemi aperti')
await shot(pg, 'a9_lista_revisionata')
ok(await tabsNamed(pg), 'ogni scheda in alto ha il nome')
const tb = await pg.$eval('#mode', e => { const c = getComputedStyle(e); return [parseFloat(c.fontSize), c.textTransform, e.innerText] }); ok(tb[0] <= 12 && tb[1] === 'none', 'indicatore di prova discreto: ' + JSON.stringify(tb))
// ===== 7. messages never over the controls
await pg.click('#main .rm-row:has(.name:text-is("Butter Spinach"))'); await pg.waitForTimeout(600); await pg.click('.mr-editbtn'); await pg.waitForTimeout(200)
await pg.click('.mr-ebar [data-m="savedraft"]'); await pg.waitForTimeout(400)
// R1.14: the confirmation is written inside the card; nothing floats over a button
const over = await pg.evaluate(() => { const fl = document.querySelector('.mr-flash'), t = document.querySelector('.toast:not([hidden])'); const btns = [...document.querySelectorAll('#main button')].filter(b => b.offsetParent)
  const hit = el => { if (!el) return []; const r = el.getBoundingClientRect(); return btns.filter(b => { const q = b.getBoundingClientRect(); return !(q.bottom <= r.top || q.top >= r.bottom || q.right <= r.left || q.left >= r.right) && !el.contains(b) }).map(b => b.innerText) }
  return { flash: fl ? fl.innerText : null, toast: !!t, covers: hit(fl).concat(hit(t)) } })
ok(over.flash && /DRAFT v1/.test(over.flash) && !over.toast && over.covers.length === 0, 'conferma dentro la scheda, nessun messaggio sopra i pulsanti — ' + JSON.stringify(over))
await shot(pg, 'a10_messaggio_in_alto')
ok(await noScrollX(pg), 'nessuno scorrimento orizzontale')
await pg.context().close()
// ===== 8. Italian, same checks on the reading card
LANG = 'it'; pg = await page(390, 844)
await list(pg); await pg.fill('#q', 'spinach'); await pg.waitForTimeout(500); await pg.click('#main .rm-row:has(.name:text-is("Butter Spinach"))'); await pg.waitForTimeout(800)
await tap(pg, '.mr-ings b.mq[data-mq="l:p1"]', null); await tap(pg, '.mr-ings b.mq[data-mq="l:p1"]', 3)
ok(!NOCONV.test((await toastTxt(pg)) + (await txt(pg, '.mr'))) && /3 porz/.test(await txt(pg, '.mr-ings')), 'italiano: Spinach Cup 1 → 3 porz., nessun errore')
ok(/parziale/.test(await txt(pg, '.mr-fc')) && /problemi aperti/.test(await txt(pg, '.mr-issues')), 'italiano: food cost parziale + problemi aperti')
await shot(pg, 'b1_it_butter_spinach')
await pg.context().close()
// dark
let pd = await page(390, 844, true); await list(pd); await pd.fill('#q', 'spinach'); await pd.waitForTimeout(500); await pd.click('#main .rm-row:has(.name:text-is("Spinach Cup"))'); await pd.waitForTimeout(800); await shot(pd, 'b2_scuro_spinach_cup'); ok(await noScrollX(pd), 'modo scuro ok')
fs.writeFileSync(`${OUT}/log.txt`, log.join('\n') + '\n')
await browser.close()
console.log(log.filter(l => l.startsWith('PASS')).length + '/' + log.length)
