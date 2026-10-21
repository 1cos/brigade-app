// R1.18 — Chef 21/10 "UNA SOLA LINGUA VISIBILE": the recipe card in EN / IT / ES on real recipes (real server, Chef test session, read only:
// every write blocked). LOCAL_WEB=dir serves the lab build under the published address inside this test browser only.
import { webkit, devices } from '/Users/massimilianozubboli/cw-probe/node_modules/playwright-core/index.mjs'
import fs from 'node:fs'
import * as E from '../../supabase/functions/_shared/mre_engine.js'
const [TOKF, OUT] = process.argv.slice(2), tok = fs.readFileSync(TOKF, 'utf8').trim(); fs.mkdirSync(OUT, { recursive: true })
const READS = new Set(['me', 'shift', 'mre_list', 'mre_recipe', 'knowledge', 'recipe', 'recipes', 'prep'])
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++ }
const RAGU = 'a5fb05eb-9b0d-4462-ba1a-f3b7b12b5946', CAKE = 'c58bfd1c-0738-45db-820b-dd65e863aa1e', POS = 'b0490000-0000-4000-8000-0000000000a1', SPIN = '9cec677b-55d6-4329-9dae-5dd4d489e147'
const LN = { it: 'Italiano', en: 'English', es: 'Español' }
const br = await webkit.launch(); const blocked = []
for (const L of ['en', 'it', 'es']) {
  const ctx = await br.newContext({ ...devices['iPhone 13'] })
  if (process.env.LOCAL_WEB) { const types = { js: 'application/javascript', css: 'text/css', html: 'text/html', json: 'application/json', webmanifest: 'application/manifest+json', png: 'image/png', svg: 'image/svg+xml' }
    await ctx.route('https://1cos.github.io/brigade-app/**', r => { const f = new URL(r.request().url()).pathname.replace('/brigade-app/', '') || 'index.html', fp = process.env.LOCAL_WEB + '/' + f
      if (!fs.existsSync(fp)) return r.fulfill({ status: 404, body: '' }); r.fulfill({ status: 200, contentType: types[f.split('.').pop()] || 'application/octet-stream', body: fs.readFileSync(fp) }) }) }
  await ctx.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }))
  await ctx.route(u => u.pathname === '/functions/v1/brigade-app-api', async r => { if (r.request().method() !== 'POST') return r.continue()
    const b = JSON.parse(r.request().postData() || '{}'); if (!READS.has(b.op)) { blocked.push(b.op); return r.fulfill({ status: 403, contentType: 'application/json', body: '{"ok":false,"error":"blocked_by_test"}' }) } return r.continue().catch(() => {}) })
  await ctx.addInitScript(([T, X]) => { localStorage.setItem('brigade-app-token', T); localStorage.setItem('brigade-app-lang', X); navigator.serviceWorker && (navigator.serviceWorker.register = () => Promise.resolve()) }, [tok, L])
  const pg = await ctx.newPage(); pg.on('pageerror', e => ok(false, L + ' errore JS: ' + e.message))
  await pg.goto('https://1cos.github.io/brigade-app/?v=' + Date.now()); await pg.waitForSelector('button.w[data-w="restaurant"]', { timeout: 30000 })
  const open = async id => { await pg.click('button.w[data-w="restaurant"]'); await pg.waitForSelector('#main .rm-row', { timeout: 30000 }); await pg.fill('#q', ''); await pg.waitForTimeout(250)
    await pg.click(`#main .rm-row[data-r="${id}"]`); await pg.waitForSelector('#main .mr-ings', { timeout: 30000 }); await pg.waitForTimeout(400) }
  const visibleNotes = () => pg.locator('#main .mr-ings .mr-note').allInnerTexts()
  for (const [nm, id] of [['RAGU', RAGU], ['Cheesecake', CAKE], ['Butter Spinach', POS], ['Spinach Cup', SPIN]]) {
    await open(id)
    const notes = await visibleNotes(), other = notes.filter(t => { const g = E.langOf(t); return g.sure && g.lang !== L })
    ok(other.length === 0, `${L} · ${nm}: nessuna nota in un'altra lingua sotto gli ingredienti (visibili: ${JSON.stringify(notes)})`)
    const btn = pg.locator('#main .mr-notesbtn')
    if (await btn.count()) {
      const label = await btn.innerText(); await btn.click(); await pg.waitForTimeout(250)
      const o = await pg.locator('#main .mr-noteo').allInnerTexts()
      ok(o.length > 0 && o.every(t => /· (original|originale)/i.test(t)), `${L} · ${nm}: "${label}" mostra le note originali con la lingua dichiarata — ${JSON.stringify(o.slice(0, 3))}`)
      await pg.screenshot({ path: `${OUT}/${L}_${nm.replace(/ /g, '_')}_note_aperte.png`, fullPage: true })
      await pg.locator('#main .mr-notesbtn').click(); await pg.waitForTimeout(200)
      ok((await pg.locator('#main .mr-noteo').count()) === 0, `${L} · ${nm}: nascoste di nuovo`)
    }
    await pg.screenshot({ path: `${OUT}/${L}_${nm.replace(/ /g, '_')}.png`, fullPage: true })
    if (id === RAGU) {
      const ing = await pg.locator('#main .mr-ings').innerText()
      if (L === 'en') ok(/Ground Beef/.test(ing) && !/manzo|pelati/.test(ing), 'en · RAGU: "Ground Beef", senza "manzo"/"pelati"')
      if (L === 'it') ok(/Carne Macinata/.test(ing) && /Bay Leaves\s*EN/.test(ing), 'it · RAGU: nomi in italiano; "Bay Leaves" segnato EN (nome non ancora tradotto) — ' + (ing.match(/Bay Leaves.{0,6}/s) || [''])[0])
      if (L === 'es') ok(/Carne Molida/.test(ing) && /Bay Leaves\s*EN/.test(ing), 'es · RAGU: nomi in spagnolo; "Bay Leaves" segnato EN')
      const st = await pg.locator('#main .mr-steps').innerText()
      ok({ en: /Soffritto\. Heat/, it: /Soffritto\. Scalda/, es: /Sofrito\. Calienta/ }[L].test(st), `${L} · RAGU: procedimento nella lingua dello schermo`)
    }
    if (id === POS) { const st = await pg.locator('#main .mr-steps').innerText()
      ok(L === 'it' ? !/originale in/.test(st) : /(original in|original en) Italiano/.test(st), `${L} · Butter Spinach: step scritti in italiano ${L === 'it' ? 'mostrati senza avviso' : 'mostrati come originale italiano, dichiarato'}`) }
  }
  await ctx.unrouteAll({ behavior: 'ignoreErrors' }); await ctx.close()
}
ok(blocked.length === 0, 'nessuna scrittura tentata: ' + blocked.join(','))
await br.close(); console.log(`# pass ${pass}\n# fail ${fail}`); process.exitCode = fail ? 1 : 0
