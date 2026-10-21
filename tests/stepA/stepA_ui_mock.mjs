// SUPERSEDED by tests/r113/r113_ui_mock.mjs (R1.13, Chef 20/10 "TRUST · EASY · CLEAN"): the step-A texts checked here (official · read only, lab proposal, long lock note) were removed from the interface on purpose.
// STEP A (Chef GO 20/10) — the EXISTING Chef editor with the step-A server answers: official recipe read fresh (read only),
// lab = drafts + history, Draft and Preview, Publish LOCKED. API answered in memory with the shapes of brigade-app-api/mre.ts
// (tested on its own in tests/stepA/bench.mjs). Nothing is sent to Supabase. WebKit, iPhone size.
// Usage: PORT=<static server for web/> node tests/stepA/stepA_ui_mock.mjs <snap2_parsed.json> <outDir>
import { webkit } from '/Users/massimilianozubboli/cw-probe/node_modules/playwright-core/index.mjs'
import fs from 'node:fs'
import * as E from '../../supabase/functions/_shared/mre_engine.js'
import { buildLabDoc } from '../../supabase/functions/_shared/mre_import.js'
const [SNAP, OUT] = process.argv.slice(2), PORT = process.env.PORT || '18791'
fs.mkdirSync(OUT, { recursive: true })
const S = JSON.parse(fs.readFileSync(SNAP, 'utf8'))
const byId = Object.fromEntries(S.recipes.map(r => [r.id, r])), Y = Object.fromEntries(S.yield.map(y => [y.id, y]))
const OFF = {}, DIFFS = {}
for (const r of S.recipes) { const o = buildLabDoc({ id: r.id, r, rows: S.bom.filter(b => b.parent_recipe_id === r.id), stepRows: S.steps.filter(s => s.recipe_id === r.id), prepRows: S.prep.filter(p => p.recipe_id === r.id && !p.archived), y: Y[r.id], byId, importedAt: 'now' }); OFF[r.id] = Object.assign(o.doc, { id: r.id, _source: 'official' }); DIFFS[r.id] = o.diffs }
const SPIN = '9cec677b-55d6-4329-9dae-5dd4d489e147', PARM = '6357c9f1-f944-4153-8d7f-afb11336d91a', WHEEL = '5479387e-e4ad-4401-92ce-9cb785ef4a0d', POS = 'b0490000-0000-4000-8000-0000000000a1'
const FLAKES = 'bb3717e0-3d2c-43ef-aac4-dc5df13f5d8a'
const facts = Object.assign({}, S.facts)
if (!facts[FLAKES]) facts[FLAKES] = JSON.parse(process.env.FLAKES_FACTS || 'null')
// lab: links + drafts + history (what the deploy script writes) — never a copy of an official recipe
const LAB = {
  [SPIN]: { lab_only: false, versions: [], draft: null },
  [WHEEL]: { lab_only: false, versions: [{ version: 1, state: 'importata', reason: 'Copia del 15/10 (storico)', at: '2026-10-15T15:38:00Z' }], draft: null },
  [POS]: { lab_only: true, versions: [], draft: { schema: 1, id: POS, title: 'Butter Spinach / Sautéed Spinach', category: 'Contorni', yield: { g: null, portions: 1, label: '1 porzione' }, has_stock: false, stock: [],
    lines: [{ id: 'p1', kind: 'recipe', ref: SPIN, qty: 1, unit: 'portion', role: 'produzione', note: '1 Spinach Cup', group: null }, { id: 'p2', kind: 'recipe', ref: PARM, qty: 5, unit: 'g', role: 'al_piatto', note: 'al servizio — 5 g da verificare (CD-067)', group: null }], steps: [], notes: 'Proposta CD-067' } },
}
LAB[WHEEL].draft = Object.assign(JSON.parse(JSON.stringify(OFF[WHEEL])), { lines: OFF[WHEEL].lines.map(l => l.id === 'b2176' ? Object.assign({}, l, { ref: FLAKES, note: 'Parmigiano Reggiano 24 mesi · Chef\'s Warehouse 00907 (fattura). 100 g da verificare' }) : l) })
let role = 'chef', publishCalls = 0, saves = 0
const user = () => role === 'chef' ? { id: 1, name: 'Max', role: 'chef', lang: 'it', station: null } : { id: 38, name: 'Pablo', role: 'staff', lang: 'it', station: 'Salad Station' }
const docOf = id => OFF[id] || (LAB[id] && LAB[id].lab_only ? LAB[id].draft : null)
function treeOf(root) { const o = { [root.id]: root }, dr = {}; let fr = [root]; for (let i = 0; i < 8 && fr.length; i++) { const nx = []; fr.forEach(x => (x.lines || []).filter(l => l.kind === 'recipe').forEach(l => { if (!o[l.ref] && docOf(l.ref)) { o[l.ref] = docOf(l.ref); nx.push(o[l.ref]); if (LAB[l.ref] && LAB[l.ref].draft && !LAB[l.ref].lab_only) { dr[l.ref] = Object.assign({}, LAB[l.ref].draft, { id: l.ref }); nx.push(dr[l.ref]) } } })); fr = nx } return { o, dr } }
function api(op, b) {
  const u = user(), chef = u.role === 'chef'
  switch (op) {
    case 'me': return { ok: true, user: u, build: 'mock' }
    case 'shift': return { build: 'mock', today: '2026-10-20', plan_date: '2026-10-20', user: u, items: [], messages: [], done_today: [], reports: [], people: [] }
    case 'recipes': return { recipes: [] }
    case 'mre_list': return { source: 'official', publish_locked: true, pending: 0, recipes: [POS, SPIN, WHEEL].filter(id => chef || !LAB[id].lab_only).map(id => ({ id, pilot: id !== POS, is_test: false, lab_only: LAB[id].lab_only, current_version: 0, state: LAB[id].lab_only ? null : 'ufficiale', title: docOf(id).title, category: docOf(id).category, draft: !!LAB[id].draft, pending: 0 })) }
    case 'mre_recipe': { const L = LAB[b.id], root = docOf(b.id); if (!root || (L && L.lab_only && !chef)) return [404, 'not_found']
      const t = treeOf(root), ctx = { doc: x => t.o[x], facts: x => facts[x], measures: S.measures }
      const f2 = {}; Object.keys(facts).forEach(k => { if (facts[k]) f2[k] = chef ? facts[k] : (({ price, ...r }) => r)(facts[k]) })
      return { source: OFF[b.id] ? 'official' : 'lab', read_at: new Date().toISOString(), publish_locked: true, recipe: { id: b.id, current_version: 0, linked: !!L },
        doc: root, docs: t.o, draft_docs: chef ? t.dr : {}, facts: f2, measures: S.measures, versions: (L ? L.versions : []).concat(L && L.draft ? [{ version: L.versions.length + 1, state: 'bozza', reason: null, by: 'Max', at: new Date().toISOString() }] : []).reverse(),
        productions: [], suggestions: [], draft: chef && L && L.draft ? Object.assign({}, L.draft, { id: b.id, _version: L.versions.length + 1 }) : null, diffs: chef ? DIFFS[b.id] || [] : undefined, diffs_checked: null, cost: chef ? E.cost(b.id, 1, OFF[b.id] ? ctx : { doc: x => t.dr[x] || t.o[x], facts: ctx.facts, measures: ctx.measures }) : undefined } }
    case 'mre_save_draft': saves++; LAB[b.id].draft = b.doc; return { ok: true }
    case 'mre_discard': LAB[b.id].draft = null; return { ok: true }
    case 'mre_publish': publishCalls++; return [423, 'pubblicazione_bloccata']
    case 'office': return [403, 'forbidden']
    case 'mre_ingredients': return { ingredients: [], recipes: [] }
  }
  return [400, 'bad_op']
}
const log = []
const ok = (c, m) => { log.push((c ? 'PASS ' : 'FAIL ') + m); console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1 }
const browser = await webkit.launch()
async function page(w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 })
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
const open = async (pg, t) => { await list(pg); await pg.click(`text="${t}"`); await pg.waitForTimeout(800) }
const shot = async (pg, sel, name) => { if (sel) await pg.locator(sel).first().scrollIntoViewIfNeeded(); await pg.screenshot({ path: `${OUT}/${name}.png`, fullPage: !sel }) }

let pg = await page(390, 844)
await list(pg); await shot(pg, null, 'a0_lista')
ok(/ufficiale · sola lettura/.test(await txt(pg, '#main')) && /proposta del laboratorio/.test(await txt(pg, '#main')), 'lista: ricette ufficiali (sola lettura) + proposta del laboratorio')
await pg.click('text="BUTTER SPINACH"'); await pg.waitForTimeout(800)
await shot(pg, null, 'a1_ufficiale')
ok(/Ricetta ufficiale di Brigade · letta .* · sola lettura/.test(await txt(pg, '.mr-src')), 'ricetta aperta = ufficiale, letta adesso, sola lettura')
ok(/75 g/.test(await txt(pg, '.mr-ings li')) && /15 porzioni/.test(await txt(pg, '.mr-yield')), 'numeri ufficiali: 15 porzioni, 75 g di parmigiano')
// Draft
await pg.click('[data-m="edit"]'); await pg.waitForTimeout(300)
ok(/Bozza v1 nel laboratorio/.test(await txt(pg, '.mr-editbar')) && /Pubblica è BLOCCATO/.test(await txt(pg, '.mr-isol')), 'Modifica: bozza nel laboratorio, Pubblica bloccato scritto in chiaro')
await pg.click('b.mq[data-mq="y:p"]'); await pg.keyboard.press('Meta+A'); await pg.keyboard.type('22'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(400)
await pg.locator('[data-m="del:b1757"]').evaluate(e => e.click()); await pg.waitForTimeout(400)
await pg.locator('h1.mr-title').evaluate(e => { e.focus(); e.textContent = 'Spinach Cup'; e.dispatchEvent(new InputEvent('input', { bubbles: true })); e.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); e.blur() }); await pg.waitForTimeout(1800)
await shot(pg, '.mr-editbar', 'a2_bozza')
await shot(pg, '.mr-foot', 'a3_anteprima')
const ft = await txt(pg, '.mr-foot')
ok(/(Parmesan Grated|Grated Parmesan) \(prep\) 75 g → 0/.test(ft) && /\+15 porzioni · \+1200 g → \+22 porzioni/.test(ft), 'Anteprima: lotto 15 → 22 porzioni, parmigiano 75 g → 0')
ok(/Fresh Spinach 121 g → 82,5 g/.test(ft) && /Butter 29,3 g → 20 g/.test(ft), 'Anteprima: consumo teorico a porzione spinaci 121 → 82,5 g, burro 29,3 → 20 g')
ok(/Food cost lotto \$17\.02 → \$16\.29/.test(ft), 'Anteprima: food cost lotto $17,02 → $16,29')
const pub = pg.locator('[data-m="publish"]')
ok(await pub.isDisabled() && /Pubblica · bloccato/.test(await pub.innerText()), 'pulsante "Pubblica · bloccato" spento')
await pub.click({ force: true }).catch(() => {}); await pg.waitForTimeout(400)
ok(publishCalls === 0 && saves > 0 && LAB[SPIN].draft && LAB[SPIN].draft.yield.portions === 22 && LAB[SPIN].draft.title === 'Spinach Cup', 'nessuna pubblicazione inviata; la bozza è salvata nel laboratorio (22 porzioni)')
await pg.context().close()

// reopen: official stays, draft link
pg = await page(390, 844); await open(pg, 'BUTTER SPINACH')
ok(/15 porzioni/.test(await txt(pg, '.mr-yield')) && /bozza aperta/.test(await txt(pg, '.mr-src')), 'riaperta: si vede l\'ufficiale (15 porzioni) + "bozza aperta"')
await pg.click('[data-m="p:hist"]'); await pg.waitForTimeout(300); await shot(pg, '.mr-panel', 'a4_storico')
await pg.context().close()

// POS ITEM proposal linked to the Spinach Cup draft
pg = await page(390, 844); await open(pg, 'Butter Spinach / Sautéed Spinach')
await shot(pg, null, 'a5_pos_item')
const pi = await txt(pg, '.mr-ings li')
ok(/Spinach Cup ›.* 1 porz\./.test(pi) && /Grated Parmesan ›.* 5 g/.test(pi), 'POS ITEM: "Spinach Cup › 1 porzione" + "Grated Parmesan 5 g", collegati per ID')
ok(/Proposta del laboratorio · non ancora in Brigade/.test(await txt(pg, '.mr-src')), 'POS ITEM marcato come proposta, non in Brigade')
await pg.click('[data-m="p:struct"]'); await pg.waitForTimeout(300); await shot(pg, '.mr-panel', 'a6_pos_scarichi')
const st = await txt(pg, '.mr-panel')
ok(/Spinach Cup \(prep\) 1 porzione/.test(st) && /Parmesan Grated \(prep\) 5 g/.test(st), 'vendita: 1 Spinach Cup + 5 g di parmigiano al servizio')
ok(/Fresh Spinach 82,5 g/.test(st) && /Butter 20 g/.test(st) && /Parmesan Cheese 5 g/.test(st), 'consumo teorico 1 porzione: spinaci 82,5 g, burro 20 g, parmigiano 5 g')
await pg.click('[data-m="p:cost"]'); await pg.waitForTimeout(300); await shot(pg, '.mr-panel', 'a7_pos_foodcost')
ok(/\$0\.789/.test(await txt(pg, '.mr-panel')), 'food cost Butter Spinach venduto $0,789 a porzione')
await pg.click('[data-m="sub:p1"]'); await pg.waitForTimeout(900); await shot(pg, null, 'a8_tocco_spinach_cup')
ok(/BUTTER SPINACH|Spinach Cup/.test(await txt(pg, 'h1.mr-title')), 'tocco sulla riga → si apre la prep collegata')
await pg.context().close()

// Wheel Pasta: draft that links Cheese Wheel to the invoiced Parmigiano Reggiano 24 mesi
pg = await page(390, 844); await open(pg, 'Wheel Pasta')
await pg.click('[data-m="edit"]'); await pg.waitForTimeout(1600); await shot(pg, '.mr-foot', 'a9_wheel_anteprima')
const wf = await txt(pg, '.mr-foot')
ok(/Food cost lotto \$0\.389 → \$3\.38/.test(wf) && /Cheese Wheel 100 g → 0/.test(wf) && /Scaglie di Parmigiano 0 → 100 g/.test(wf), 'Wheel Pasta, bozza: formaggio collegato all\'articolo della fattura (oggi si chiama Parmesan Flakes / Scaglie di Parmigiano), food cost noto $0,389 → $3,38 (manca ancora il rum)')
await pg.context().close()

role = 'staff'
pg = await page(390, 844); await list(pg)
ok(!/Sautéed Spinach/.test(await txt(pg, '#main')), 'cuoco: la proposta non compare')
await pg.click('text="BUTTER SPINACH"'); await pg.waitForTimeout(800)
ok(!(await pg.locator('[data-m="edit"]').count()) && !/\$/.test(await txt(pg, '#main')) && /75 g/.test(await txt(pg, '.mr-ings li')), 'cuoco: ricetta ufficiale, senza costi e senza Modifica')
await shot(pg, null, 'a10_cuoco')
await pg.context().close()
await browser.close()
fs.writeFileSync(`${OUT}/log.txt`, log.join('\n'))
