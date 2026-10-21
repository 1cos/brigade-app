// R1.17 — checks on the PUBLISHED site with the REAL server (Chef test session). Every save of the Chef's recipes is rewritten to the lab
// test recipe; every other write is blocked except mre_translate (it only reads text and returns a translation, nothing is stored by it).
import { webkit } from '/Users/massimilianozubboli/cw-probe/node_modules/playwright-core/index.mjs'
import fs from 'node:fs'
import * as E from '../../supabase/functions/_shared/mre_engine.js'
const [TOKF, OUT] = process.argv.slice(2), tok = fs.readFileSync(TOKF, 'utf8').trim(), API = 'https://ydqmumpytgrlceuinoqt.supabase.co/functions/v1/brigade-app-api'
const SPIN = '9cec677b-55d6-4329-9dae-5dd4d489e147', POS = 'b0490000-0000-4000-8000-0000000000a1', TEST = '00000000-b490-4000-8000-000000000001', NUT = '8d97bcc6-dcec-428e-a996-6c8725847aa9'
fs.mkdirSync(OUT, { recursive: true })
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++ }
const call = async (op, b = {}) => { const r = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok }, body: JSON.stringify(Object.assign({ op }, b)) }); return r.json() }
// ---- server ----
ok((await call('me')).build === 'api-r1.17', 'server R1.17 (api-r1.17)')
const S = await call('mre_recipe', { id: SPIN }), P = await call('mre_recipe', { id: POS })
const sd = S.draft, ctxS = { doc: x => x === SPIN ? sd : ((S.draft_docs || {})[x] || S.docs[x]), facts: x => S.facts[x], measures: S.measures }
ok(sd.yield.portion_g === 80 && sd.yield.portions === 15 && sd.yield.portion_unit === 'cup' && sd.yield.g == null && sd.yield.label_hist && sd.yield.label_hist.length === 1, 'bozza Spinach Cup sul server: 80 g cotti, 15 cups, vecchia nota nello storico')
ok(!sd.lines.some(l => /utmeg/i.test((S.facts[l.ref] || {}).name || '')) && sd.lines.length === 5 && E.resolveDoc(sd).lines.find(l => l.id === 'b1756').qty === 15, 'Spinach Cup: spinaci, burro, pepe bianco, sale, contenitori (1 per cup = 15); niente noce moscata')
const cs = E.cost(SPIN, 1, ctxS)
const pd = P.draft || P.doc, ctxP = { doc: x => x === POS ? pd : ((P.draft_docs || {})[x] || P.docs[x]), facts: x => P.facts[x], measures: P.measures }, cp = E.cost(POS, 1, ctxP)
const nl = pd.lines.find(l => l.ref === NUT)
ok(nl && nl.role === 'al_piatto' && nl.qty === 1 && pd.lines.find(l => l.id === 'p1').qty === 2 && pd.steps.every(s => s.src === 'it' && s.it), 'Butter Spinach sul server: 2 Spinach Cup + parmigiano + Ground Nutmeg 1 g AL SERVIZIO; step originali italiani')
const sale = E.explode(POS, 1, 'vendita', ctxP)
ok(sale.some(x => x.kind === 'ingredient' && x.ref === NUT && Math.abs(x.g - 1) < 1e-9) && sale.some(x => x.kind === 'prep' && Math.abs(x.portions - 2) < 1e-9) && !E.explode(SPIN, 1, 'produzione', ctxS).some(x => x.ref === NUT), 'alla vendita: 2 cup + 1 g di noce moscata; la produzione della PREP non usa noce moscata')
console.log(`   food cost (bozze, prezzi di oggi): lotto $${cs.food.toFixed(2)} + imballo $${cs.pack.toFixed(2)} · cup $${cs.per_portion.toFixed(3)} + $${(cs.pack / 15).toFixed(3)} · Butter Spinach $${cp.food.toFixed(3)} + imballo $${cp.pack.toFixed(3)} (${cp.state}, mancano ${cp.missing})`)
const tr = await call('mre_translate', { items: [{ key: '0:x', text: 'Lasciare raffreddare leggermente.', from: 'it', to: ['en', 'es'] }] })
ok(tr.items && tr.items[0] && Object.values(tr.items[0].out).every(o => o.text == null && o.why === 'non_tradotto'), 'servizio di traduzione oggi: restituisce l\'originale → riconosciuto "non tradotto", nessuna traduzione falsa — ' + JSON.stringify(tr.items && tr.items[0].out))
// ---- published site ----
const R = { blocked: [], tr: 0, saved: [] }
const br = await webkit.launch(), cx = await br.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }), pg = await cx.newPage()
pg.on('pageerror', e => ok(false, 'errore JS: ' + e.message))
const READS = new Set(['me', 'shift', 'mre_list', 'mre_recipe', 'mre_ingredients', 'ingredients', 'knowledge', 'mre_purchase_match', 'recipe', 'recipes', 'prep', 'office', 'catering'])
await pg.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }))
await pg.route('**/functions/v1/brigade-app-api*', async r => { const b = JSON.parse(r.request().postData() || '{}')
  if (b.op === 'mre_save_draft') { R.saved.push(b.id); b.id = TEST; b.base = 3; b.doc = Object.assign({}, b.doc, { id: TEST }); return r.continue({ postData: JSON.stringify(b) }) }
  if (b.op === 'mre_translate') { R.tr++; return r.continue() }
  if (!READS.has(b.op)) { R.blocked.push(b.op); return r.fulfill({ status: 403, contentType: 'application/json', body: '{"ok":false,"error":"blocked_by_test"}' }) }
  return r.continue() })
await pg.addInitScript(T => { localStorage.setItem('brigade-app-token', T); localStorage.setItem('brigade-app-lang', 'en'); navigator.serviceWorker && (navigator.serviceWorker.register = () => Promise.resolve()) }, tok)
await pg.goto('https://1cos.github.io/brigade-app/?v=' + Date.now()); await pg.waitForSelector('button.w[data-w="restaurant"]', { timeout: 30000 })
ok(/R1\.17/.test(await pg.evaluate(() => (window.APP_CONFIG || {}).build || '')), 'sito pubblicato: R1.17')
const txt = async s => (await pg.locator(s).allInnerTexts()).join(' | ').replace(/\s+/g, ' ')
const open = async (q, name) => { await pg.click('button.w[data-w="restaurant"]'); await pg.waitForSelector('#q'); await pg.fill('#q', q); await pg.click(`#main .rm-row:has(.name:text-is("${name}"))`); await pg.waitForSelector('#main .mr-ings', { timeout: 30000 }); await pg.waitForTimeout(400) }
await open('spinach', 'Spinach Cup'); await pg.screenshot({ path: OUT + '/1_spinach_cup.png' })
ok(/15 cups · 80 g each, cooked/.test(await txt('#main .mr-yield')), 'Spinach Cup: "' + await txt('#main .mr-yield') + '"')
ok(/Container Aluminum 4 oz Utility.{0,120}?15 pcs/.test(await txt('#main .mr-ings')) && /\+ packaging \$0\.136/.test(await txt('#main .mr-fc')) && /\/ cup/.test(await txt('#main .mr-fc')), 'contenitori 15 da "1 per cup"; food cost a cup + imballo $0,136 — ' + await txt('#main .mr-fc') + ' · ' + (await txt('#main .mr-ings')).match(/Container.{0,140}/)?.[0])
ok(!/7,5|22 contenitori|15 contenitori/.test(await txt('#main .mr')), 'nessuna nota della resa con numeri sullo schermo')
await pg.click('.mr-editbtn'); await pg.waitForSelector('#mrAdd'); await pg.waitForTimeout(600)
const ye = await txt('#main .mr-yield')
ok(/Expected yield 15/.test(ye) && /Portion weight 80 g cooked/.test(ye) && !/Lot weight/.test(ye) && !(await pg.locator('#main [data-mt="label"]').count()), 'modifica: "Expected yield 15 cups" + "Portion weight 80 g cooked", nessuna nota libera — ' + ye)
ok(/1\.2 kg cooked · 15 × Container/.test(await txt('#main .mr-derived')), 'calcolati: ' + await txt('#main .mr-derived'))
await pg.screenshot({ path: OUT + '/2_spinach_cup_modifica.png' })
await open('butter spinach', 'Butter Spinach'); await pg.screenshot({ path: OUT + '/3_butter_spinach.png' })
const bi = await txt('#main .mr-ings'), bst = await txt('#main .mr-steps')
ok(/Spinach Cup ›.{0,40}? 2 cups/.test(bi) && /Ground Nutmeg.{0,60}? 1 g/.test(bi) && /Grated Parmesan ›.{0,60}? 5 g/.test(bi), 'Butter Spinach: Spinach Cup 2 cups · Parmesan 5 g · Ground Nutmeg 1 g — ' + bi)
ok(/Scaldare due Cup/.test(bst) && /original in Italiano · translation on the way/.test(bst), 'in inglese gli step si leggono nell\'originale italiano CON l\'avviso (mai spacciati per inglese)')
await pg.click('.mr-editbtn'); await pg.waitForSelector('#mrAdd')
for (let i = 0; i < 60 && !(await pg.locator('#main .mr-trerr').count()); i++) await pg.waitForTimeout(250)
await pg.click('#main [data-m="adv"]'); await pg.waitForTimeout(200)
ok(await pg.locator('#main .mr-trerr').count() === 1 && /ITALIANO · ORIGINAL/i.test(await txt('#main .mr-steps')), 'modifica: "Italiano · originale" e avviso "Il servizio di traduzione non risponde…" — ' + await txt('#main .mr-trerr'))
await pg.screenshot({ path: OUT + '/4_butter_spinach_modifica.png', fullPage: true })
ok(R.saved.length === 0, 'aprire e guardare non salva niente (salvataggi: ' + R.saved.length + ')')
// editing speed on the real server (saves diverted to the test recipe)
const n0 = await pg.locator('#main [data-m^="del:"]').count(); await pg.click('#mrAdd'); await pg.keyboard.type('salt', { delay: 80 })
await pg.waitForSelector('[data-m^="addi:"]', { timeout: 15000 }); const t0 = Date.now(); await pg.locator('[data-m^="addi:"]').first().click()
let vis = null; for (let i = 0; i < 100; i++) { if ((await pg.locator('#main [data-m^="del:"]').count()) > n0) { vis = Date.now() - t0; break } await pg.waitForTimeout(16) }
ok(vis != null && vis < 300, `ingrediente visibile in ${vis} ms (salvataggio in background, deviato sulla ricetta di prova)`)
for (let i = 0; i < 60 && !/Saved/.test(await txt('#main [data-sst]')); i++) await pg.waitForTimeout(250)
ok(/Saved in draft/.test(await txt('#main [data-sst]')) && R.saved.every(x => x === POS), 'stato "Saved in draft · not published" — ' + await txt('#main [data-sst]'))
ok(R.blocked.length === 0, 'nessuna altra scrittura tentata: ' + R.blocked.join(','))
console.log(`traduzioni chieste al server: ${R.tr}, salvataggi (deviati): ${R.saved.length}`)
await br.close()
console.log(`# pass ${pass}\n# fail ${fail}`); process.exitCode = fail ? 1 : 0
