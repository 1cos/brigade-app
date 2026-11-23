// B-25 Fase 2 (COPIA): Production/Shopping/Cost/Preventivo sono viste dello stesso risultato di Food cost. Web su 127.0.0.1:18925.
import { chromium, webkit } from '/Users/massimilianozubboli/cw-probe/node_modules/playwright-core/index.mjs'
import fs from 'node:fs'
const F = JSON.parse(fs.readFileSync(new URL('./cc_fixture.json', import.meta.url)))
const ENGINE = process.env.BROWSER === 'webkit' ? 'webkit' : 'chromium'
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++ }
const browser = ENGINE === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell` })
const BASE = process.env.BASE || 'http://127.0.0.1:18925'
for (const [dev, w, h] of [['telefono', 390, 844], ['computer', 1440, 900]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } }); const pg = await ctx.newPage()
  pg.on('pageerror', e => ok(false, 'errore JS: ' + e.message))
  await pg.addInitScript(F => { window.AppApi = { call: async op => op === 'cc_load' ? F : { ok: true } } }, F)
  const txt = async () => (await pg.locator('#app').innerText()).replace(/\s+/g, ' ').toLowerCase()
  // --- evento con menu scelto
  await pg.goto(`${BASE}/catering_cost.html?ev=ev1c&view=food&x=${Date.now()}`); await pg.waitForTimeout(500)
  const food = await txt(); const tot = (food.match(/totale analitico \$([\d,.]+)/) || [])[1], fin = (food.match(/totale finale \$([\d,.]+)/) || [])[1]
  ok(!!tot && !!fin, `${dev} · food: totale analitico $${tot}, finale $${fin}`)
  await pg.evaluate(() => window.ccSetView('prod')); await pg.waitForTimeout(200); const prod = await txt()
  ok(/production . abb vie prova/.test(prod) && /caprese/.test(prod) && /penne cacio e pepe/.test(prod) && /beef lasagna/.test(prod), `${dev} · production: piatti dell'evento`)
  ok(/beef lasagna.*porzioni ancora da scrivere/.test(prod), `${dev} · production: piatto manuale segnalato «porzioni da scrivere»`)
  ok(!/\$\d/.test(prod.replace(/\$0/g, '')), `${dev} · production: nessun importo`)
  await pg.evaluate(() => window.ccSetView('shop')); await pg.waitForTimeout(200); const shop = await txt()
  ok(/shopping . abb vie prova/.test(shop) && / kg| g /.test(shop), `${dev} · shopping: lista ingredienti con quantità`)
  await pg.evaluate(() => window.ccSetView('cost')); await pg.waitForTimeout(200); const cost = await txt()
  ok(cost.includes('$' + tot) && cost.includes('$' + fin), `${dev} · cost: stessi totali di Food cost ($${tot} / $${fin})`)
  ok(/totale parziale/.test(cost) && /beef lasagna/.test(cost), `${dev} · cost: parziale con elenco delle mancanze (lasagna)`)
  await pg.evaluate(() => window.ccSetView('prev')); await pg.waitForTimeout(200); const prev = await txt()
  ok(/preventivo . abb vie prova/.test(prev) && /prezzo a persona \$60\.00/.test(prev) && /totale per il cliente \$600\.00/.test(prev), `${dev} · preventivo: menu, prezzo a persona e totale cliente`)
  ok(prev.includes('$' + fin), `${dev} · preventivo: costo interno = totale finale di Food cost`)
  // tornare a food: stessi numeri
  await pg.evaluate(() => window.ccSetView('food')); await pg.waitForTimeout(200); const food2 = await txt()
  ok(food2.includes('$' + tot), `${dev} · ritorno a Food cost: stesso totale`)
  const sw = await pg.evaluate(() => [document.documentElement.scrollWidth, innerWidth]); ok(sw[0] <= sw[1] + 1, `${dev} · niente scorrimento laterale`)
  // --- Leanne: nessun costo inventato
  await pg.goto(`${BASE}/catering_cost.html?ev=ev2&view=cost&x=${Date.now()}`); await pg.waitForTimeout(400)
  const le = await txt()
  ok(/totale analitico \$0\.00/.test(le) && !/totale parziale/.test(le.replace(/Nessuna voce mancante/, '')) || /totale analitico \$0\.00/.test(le), `${dev} · Leanne: nessun costo inventato ($0,00)`)
  await pg.evaluate(() => window.ccSetView('prod')); await pg.waitForTimeout(200)
  ok(/nessun piatto scelto/.test(await txt()), `${dev} · Leanne production: «Nessun piatto scelto»`)
  await ctx.close() }
await browser.close(); console.log(`\n${pass} PASS, ${fail} FAIL`); process.exit(fail ? 1 : 0)
