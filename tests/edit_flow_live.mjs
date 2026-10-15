// B-25 (Chef 16/10) — LIVE test of the published site (WebKit, iPhone screen): Completeness → missing procedure marked →
// Edit → lab copy → draft → cost check; staff cannot prepare edits nor see the copy. Writes ONLY to schema mre (copy + draft).
// Official data are checked separately with a read-only fingerprint before/after. Usage: node tests/edit_flow_live.mjs <tokenDir> <outDir> <recipeId>
import { webkit } from '/Users/massimilianozubboli/cw-probe/node_modules/playwright-core/index.mjs'
import fs from 'node:fs'
const [S, OUT, RID] = process.argv.slice(2); fs.mkdirSync(OUT, { recursive: true })
const tok = n => fs.readFileSync(`${S}/tok_${n}`, 'utf8').trim()
const API = 'https://ydqmumpytgrlceuinoqt.supabase.co/functions/v1/brigade-app-api'
const call = async (who, op, body = {}) => { const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok(who) }, body: JSON.stringify({ op, ...body }) }); let j = null; try { j = await r.json() } catch (e) {}; return { status: r.status, j } }
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++ }
let r = await call('staff', 'mre_prepare_edit', { id: RID }); ok(r.status === 403, `cuoco non può preparare una modifica (${r.status})`)
const b = await webkit.launch()
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1' })
const pg = await ctx.newPage(); const ops = []
pg.on('pageerror', e => ok(false, 'errore JS ' + e.message))
pg.on('request', q => { if (q.url().includes('brigade-app-api') && q.method() === 'POST') { try { ops.push(JSON.parse(q.postData()).op) } catch (e) {} } })
await pg.addInitScript(t => { localStorage.setItem('brigade-app-token', t); localStorage.setItem('brigade-app-lang', 'it') }, tok('chef'))
await pg.goto('https://1cos.github.io/brigade-app/?v=' + Date.now()); await pg.waitForTimeout(5000)
ok(await pg.evaluate(() => window.APP_CONFIG.build) .startsWith('R1.7'), 'sito pubblicato R1.7.x')
await pg.click('button.w[data-w="office"]'); await pg.waitForTimeout(3000)
await pg.click('button[data-a="openComplete"]'); await pg.waitForTimeout(3000)
await pg.locator('button[data-a="kMore"][data-k="m_procedure"]').click(); await pg.waitForTimeout(500)
await pg.locator(`#main button[data-a="openRecipe"][data-r="${RID}"]`).click(); await pg.waitForTimeout(4000)
const box = await pg.locator('#main .fixbox .h').textContent().catch(() => '')
const hl = await pg.locator('#main section.hl h2').allTextContents()
ok(box === 'Da completare: manca il procedimento' && hl.includes('Procedimento'), `1. ricetta incompleta aperta: "${box}", evidenziato "${hl.join(',')}"`)
await pg.screenshot({ path: `${OUT}/1_procedimento_evidenziato.png` })
const t0 = Date.now(); await pg.locator('#main .fixbox button[data-a="editRecipe"]').click(); await pg.waitForSelector('#main .mr.mr-edit', { timeout: 20000 }); const secs = ((Date.now() - t0) / 1000).toFixed(1); await pg.waitForTimeout(500)
ok(await pg.locator('#main .mr.mr-edit').count() === 1 && await pg.locator('#main .mr-right.hl').count() === 1 && ops.includes('mre_prepare_edit'), `2. Modifica: copia di prova creata, editor aperto in ${secs} s, procedimento ancora evidenziato`)
await pg.screenshot({ path: `${OUT}/2_editor.png` })
await pg.locator('#main button[data-m="addstep"]').click(); await pg.waitForTimeout(800)
await pg.locator('#main [data-mt="step:0"]').click(); await pg.keyboard.type('PROVA B-25: affetta il prosciutto sottile e servilo sul melone freddo.')
await pg.locator('#main h1').first().click(); await pg.waitForTimeout(4000)
const foot = await pg.locator('#main .mr-foot').textContent().catch(() => '')
ok(/Food cost lotto \$[\d.]+ → \$[\d.]+/.test(foot), `3. controllo del costo: "${(foot.match(/Food cost lotto[^·]*/) || [''])[0].trim()}"`)
await pg.screenshot({ path: `${OUT}/3_bozza.png`, fullPage: true })
r = await call('chef', 'mre_recipe', { id: RID })
ok(r.status === 200 && r.j.recipe.current_version === 1 && r.j.draft && r.j.draft.steps.length === 1 && /PROVA B-25/.test(r.j.draft.steps[0].it) && r.j.doc.steps.length === 0, `4. bozza salvata nel laboratorio (versione in uso v1 ${r.j.versions[r.j.versions.length - 1].state}, senza procedimento)`)
fs.writeFileSync(`${OUT}/lab_v1_doc.json`, JSON.stringify(r.j.doc))
r = await call('staff', 'mre_list'); ok(!r.j.recipes.some(x => x.id === RID), 'cuoco: la copia di prova non compare (vede la scheda ufficiale)')
r = await call('staff', 'recipe', { id: RID }); ok(r.status === 200 && r.j.recipe.title, 'cuoco: scheda ufficiale ok')
ok(!ops.some(o => ['mre_publish', 'act', 'mre_production', 'mre_restore'].includes(o)), `nessuna pubblicazione, nessuna azione reale (${[...new Set(ops)].join(', ')})`)
await b.close()
console.log(`\nRISULTATO: ${pass} superati, ${fail} falliti`)
