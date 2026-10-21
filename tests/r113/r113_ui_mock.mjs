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
  await pg.addInitScript(() => { localStorage.setItem('brigade-app-token', 'a'.repeat(64)); localStorage.setItem('brigade-app-lang', 'it'); navigator.serviceWorker && (navigator.serviceWorker.register = () => Promise.resolve()) })
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`); await pg.waitForTimeout(700)
  return pg
}
const txt = async (pg, sel) => (await pg.locator(sel).allInnerTexts()).join(' | ').replace(/\s+/g, ' ')
const list = async pg => { await pg.click('button.w[data-w="restaurant"]'); await pg.waitForTimeout(500) }
const shot = async (pg, name, full) => pg.screenshot({ path: `${OUT}/${name}.png`, fullPage: !!full })
const noScrollX = async pg => pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1 && [...document.querySelectorAll('#main *')].every(e => e.getBoundingClientRect().right <= window.innerWidth + 1 || getComputedStyle(e).overflowX !== 'visible' || e.closest('.rm-chips,.seg')))
const LABTXT = /laboratorio|sola lettura|read.only|proposta|lab proposal|ufficiale|importata|test mode/i
const rowNames = pg => pg.$$eval('#main .rm-row .name', els => els.map(e => e.textContent.trim()))

let pg = await page(390, 844)
await list(pg); await shot(pg, '1_recipe_master')
const main = await txt(pg, '#main')
ok(/Recipe Master/.test(await txt(pg, '#main h1')), 'una sola sezione: Recipe Master')
ok(!LABTXT.test(main), 'nessun testo tecnico di laboratorio nella lista')
ok(/^prova$/i.test(await txt(pg, '#mode')) && (await pg.locator('#mode').count()) === 1, 'un solo indicatore discreto della prova (in alto)')
let names = await rowNames(pg)
const live = TT.filter(r => !/archiv/i.test(r.category || '')).length
ok(names.length === live + 1, `ogni ricetta una volta: ${names.length} righe = ${live} ricette di Brigade + 1 nuova (Butter Spinach)`)
const ids = await pg.$$eval('#main .rm-row', els => els.map(e => e.dataset.r)); ok(new Set(ids).size === ids.length, 'nessun doppione (per ID)')
const dupN = names.filter((n, i) => names.indexOf(n) !== i); ok(dupN.length === 0, 'nessun nome uguale nell\'elenco' + (dupN.length ? ': ' + dupN.join(', ') : ''))
ok(!names.includes('BUTTER SPINACH') && names.includes('Spinach Cup') && names.includes('Butter Spinach'), 'Spinach Cup e Butter Spinach, nessuna terza scheda "BUTTER SPINACH"')
const rowOf = async n => txt(pg, `#main .rm-row:has(.name:text-is("${n}"))`)
ok(/PREP/i.test(await rowOf('Spinach Cup')) && !/MENU ITEM/i.test(await rowOf('Spinach Cup')) && /Bozza/.test(await rowOf('Spinach Cup')) && /in uso: BUTTER SPINACH/.test(await rowOf('Spinach Cup')), 'Spinach Cup — PREP · Bozza (in uso: BUTTER SPINACH)')
ok(/MENU ITEM/i.test(await rowOf('Butter Spinach')) && !/PREP/i.test(await rowOf('Butter Spinach')), 'Butter Spinach — MENU ITEM')
ok(/0 di 257 verificate/.test(main), 'avanzamento revisione Chef: 0 di 257 (non è "pubblicata")')
ok(await noScrollX(pg), 'nessuno scorrimento orizzontale')
// filters + search
await pg.click('[data-a="rmFilter"][data-v="prep"]'); await pg.waitForTimeout(250); names = await rowNames(pg)
ok(names.includes('Spinach Cup') && !names.includes('Butter Spinach'), `filtro Prep: ${names.length} ricette, Spinach Cup sì, Butter Spinach no`); await shot(pg, '2_filtro_prep')
await pg.click('[data-a="rmFilter"][data-v="menu"]'); await pg.waitForTimeout(250); names = await rowNames(pg)
ok(names.includes('Butter Spinach') && !names.includes('Spinach Cup'), `filtro Menu Item: ${names.length} ricette, Butter Spinach sì, Spinach Cup no`)
await pg.click('[data-a="rmFilter"][data-v="all"][data-f="k"]'); await pg.click('[data-a="rmFilter"][data-f="st"]:has-text("Bozze")'); await pg.waitForTimeout(250); names = await rowNames(pg)
ok(names.join('|') === 'Artichoke|Butter Spinach|Spinach Cup|Wheel Pasta', 'filtro Bozze: ' + names.join(', '))
await pg.click('[data-a="rmFilter"][data-f="st"]:has-text("Bozze")'); await pg.waitForTimeout(200); ok((await rowNames(pg)).length === live + 1, 'tocco di nuovo "Bozze": torna tutto l\'elenco'); await pg.fill('#q', 'sautéed'); await pg.waitForTimeout(500); names = await rowNames(pg)
ok(names.includes('Butter Spinach'), 'cerca "sautéed" (nome POS) trova Butter Spinach: ' + names.join(', ')); await shot(pg, '3_cerca')
await pg.fill('#q', 'spinach'); await pg.waitForTimeout(500); names = await rowNames(pg); ok(names.includes('Spinach Cup') && names.includes('Butter Spinach'), 'cerca "spinach": ' + names.join(', '))
// open Butter Spinach: 1 tap
await pg.click('#main .rm-row:has(.name:text-is("Butter Spinach"))'); await pg.waitForTimeout(800); await shot(pg, '4_butter_spinach')
let card = await txt(pg, '.mr')
ok(/Butter Spinach/.test(await txt(pg, 'h1.mr-title')), 'si apre Butter Spinach')
ok(await pg.locator('.mr-editbtn').isVisible() && (await pg.locator('.mr-editbtn').boundingBox()).y < 844, 'pulsante "Modifica ricetta" ben visibile, in cima')
ok(/Spinach Cup ›/.test(card) && /5 g/.test(card) && /\$0\.789 \/ porzione/.test(card), 'sotto-ricetta Spinach Cup cliccabile + parmigiano 5 g, food cost $0.789 a porzione')
ok(!LABTXT.test(card.replace(/Info tecniche/, '')), 'nessun testo tecnico dentro la ricetta')
// Edit → Preview → Save draft
await pg.click('.mr-editbtn'); await pg.waitForTimeout(300); await shot(pg, '5_modifica')
ok(/Modifica/.test(await txt(pg, '.mr-ebar')) && /Anteprima/.test(await txt(pg, '.mr-ebar')) && /Salva bozza/.test(await txt(pg, '.mr-ebar')), 'Modifica: barra Modifica · Anteprima · Salva bozza')
await pg.click('b.mq[data-mq="l:p2"]'); await pg.keyboard.press('Meta+A'); await pg.keyboard.type('6'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(400)
ok(/\$0\.789 → \$0\.799/.test(await txt(pg, '.mr-foot')), 'mentre modifichi: food cost a porzione $0.789 → $0.799 (stesso motore)')
await pg.click('.mr-ebar [data-m="pv:1"]'); await pg.waitForTimeout(300); await shot(pg, '6_anteprima'); await shot(pg, '6b_anteprima_intera', true)
const pv = await txt(pg, '.mr')
ok(/Cosa cambia/i.test(pv) && /0\.789 → \$?0\.799/.test(pv.replace(/\$/g, '$')) && /Parmesan Grated|Grated Parmesan/.test(pv) && /5 g → 6 g/.test(pv), 'Anteprima: cosa cambia (food cost, scarico parmigiano 5 → 6 g)')
ok(await pg.locator('.mr-pub[disabled]').count() === 1 && /Non attiva in modalità prova/.test(pv), 'Pubblica spento, una riga discreta')
await pg.locator('.mr-pub').evaluate(e => e.click()); ok(publishCalls === 0, 'Pubblica non invia niente')
await pg.click('.mr-ebar [data-m="savedraft"]'); await pg.waitForTimeout(500); await shot(pg, '7_bozza_salvata')
ok(saves >= 1 && /Bozza v1 salvata/.test(await txt(pg, '.toast')) && /6 g/.test(await txt(pg, '.mr-ings')), 'Salva bozza: salvata, la ricetta mostra la bozza (6 g)')
// back to 5 g so the demo state is the real one
await pg.click('.mr-editbtn'); await pg.click('b.mq[data-mq="l:p2"]'); await pg.keyboard.press('Meta+A'); await pg.keyboard.type('5'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(300); await pg.click('.mr-ebar [data-m="savedraft"]'); await pg.waitForTimeout(400)
ok(LAB[POS].draft.lines.find(l => l.id === 'p2').qty === 5, 'riportato a 5 g')
// sub-recipe → Spinach Cup opens on its draft; In uso shows the official
await pg.click('.mr-sub:has-text("Spinach Cup")'); await pg.waitForTimeout(800); await shot(pg, '8_spinach_cup_bozza')
ok(/Spinach Cup/.test(await txt(pg, 'h1.mr-title')) && /1 porzione ·/.test(await txt(pg, '.mr-yield')) && /Per Butter Spinach/.test(await txt(pg, '.mr-scaled')) && !/Parmesan/.test(await txt(pg, '.mr-ings')), 'Spinach Cup si apre sulla sua bozza, alla dose di 1 Butter Spinach (1 porzione), senza parmigiano')
await pg.click('[data-m="reset"]'); await pg.waitForTimeout(200); ok(/22 porzioni/.test(await txt(pg, '.mr-yield')), 'lotto intero della bozza: 22 porzioni')
await pg.click('[data-m="view:live"]'); await pg.waitForTimeout(300); await shot(pg, '9_in_uso')
ok(/BUTTER SPINACH/.test(await txt(pg, 'h1.mr-title')) && /15 porzioni/.test(await txt(pg, '.mr-yield')) && /75 g/.test(await txt(pg, '.mr-ings')), '"In uso": la ricetta ufficiale di oggi (15 porzioni, 75 g)')
// technical info only on request
await pg.click('[data-m="p:tech"]'); await pg.waitForTimeout(200); await pg.locator('.mr-panel').scrollIntoViewIfNeeded(); await shot(pg, '10_info_tecniche')
ok(/bloccata \(modalità prova\)/.test(await txt(pg, '.mr-panel')) && /sola lettura/.test(await txt(pg, '.mr-panel')), 'Info tecniche: fonte ufficiale in sola lettura, Pubblica bloccata')
// review: one tap, next recipe
await list(pg); await pg.fill('#q', ''); await pg.waitForTimeout(400)
await pg.click('[data-a="rmFilter"][data-f="st"]:has-text("Bozze")'); await pg.waitForTimeout(300)
await pg.click('#main .rm-row:has(.name:text-is("Butter Spinach"))'); await pg.waitForTimeout(700)
await pg.locator('.mr-review').scrollIntoViewIfNeeded(); await shot(pg, '11_revisione')
const tabs0 = await pg.locator('#tabs > *').count()
await pg.click('[data-m="review"]'); await pg.waitForTimeout(900)
ok((await pg.locator('#tabs > *').count()) <= tabs0, 'la revisione non apre schede nuove (e non lascia doppioni)')
ok(reviews === 1 && /Spinach Cup/.test(await txt(pg, 'h1.mr-title')), '"Verificata · prossima": segnata e aperta la successiva (Spinach Cup) nella stessa scheda')
await list(pg); ok(/1 di 257 verificate/.test(await txt(pg, '#main')) && (await pg.locator('#main .rm-row:has(.name:text-is("Butter Spinach")) .rm-check.on').count()) === 1, 'elenco: Butter Spinach con ✓, 1 di 257')
await shot(pg, '12_lista_verificata')
// cook
role = 'staff'; let pc = await page(390, 844); await list(pc)
const cook = await txt(pc, '#main'); names = await rowNames(pc)
ok(!names.includes('Butter Spinach') && names.includes('BUTTER SPINACH') && !/verificate|Bozz/.test(cook), 'cuoco: la ricetta in uso, niente bozze, niente revisione'); await shot(pc, '13_cuoco')
// dark mode
role = 'chef'; let pd = await page(390, 844, true); await list(pd); await shot(pd, '14_scuro_lista')
await pd.click('#main .rm-row:has(.name:text-is("Spinach Cup"))'); await pd.waitForTimeout(800); await shot(pd, '15_scuro_ricetta'); ok(await noScrollX(pd), 'modo scuro, nessuno scorrimento orizzontale')
fs.writeFileSync(`${OUT}/log.txt`, log.join('\n') + '\n')
await browser.close()
console.log(log.filter(l => l.startsWith('PASS')).length + '/' + log.length)
