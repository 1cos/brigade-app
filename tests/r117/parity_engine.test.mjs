// R1.17 — the new engine (mre-1.2) must give EXACTLY the same results as R1.16 (mre-1.1) on every real recipe that does not use
// the new fields: food cost, production, sale, theoretical consumption, open problems, scaling, steps. Snapshot = Brigade official
// recipes read-only (b49/r3). Usage: SNAP=<snap2_parsed.json> node tests/r117/parity_engine.test.mjs
import fs from 'node:fs'
import * as OLD from './engine_r116.js'
import * as NEW from '../../supabase/functions/_shared/mre_engine.js'
import { buildLabDoc } from '../../supabase/functions/_shared/mre_import.js'
const S = JSON.parse(fs.readFileSync(process.env.SNAP, 'utf8'))
const byId = Object.fromEntries(S.recipes.map(r => [r.id, r])), Y = Object.fromEntries(S.yield.map(y => [y.id, y])), DOC = {}
for (const r of S.recipes) DOC[r.id] = Object.assign(buildLabDoc({ id: r.id, r, rows: S.bom.filter(b => b.parent_recipe_id === r.id), stepRows: S.steps.filter(s => s.recipe_id === r.id), prepRows: S.prep.filter(p => p.recipe_id === r.id && !p.archived), y: Y[r.id], byId, importedAt: 'x' }).doc, { id: r.id })
const ctx = { doc: x => DOC[x], facts: x => S.facts[x], measures: S.measures }
let n = 0, diff = 0; const bad = []
const J = x => JSON.stringify(x, (k, v) => typeof v === 'number' ? Math.round(v * 1e9) / 1e9 : v)
for (const id of Object.keys(DOC)) {
  const d = DOC[id], runs = E => ({
    cost: E.cost(id, 1, ctx), cost3: E.cost(id, 2.5, ctx), prod: E.explode(id, 1, 'produzione', ctx), sale: E.explode(id, 1, 'vendita', ctx),
    iss: E.issues(id, ctx), model: E.modelCheck(id, ctx, { sold: true }), val: E.validate(d, ctx, true),
    theo: Number(d.yield && d.yield.portions) > 0 ? E.theoretical(id, 1, ctx) : E.theoretical(id, null, ctx, 1),
    lines: (d.lines || []).map(l => [E.showLine(l, 1.7, ctx, 'metric', 'it-IT'), E.showLine(l, 0.5, ctx, 'imperial', 'en-US'), E.factorFromLine(d, l.id, 3, l.unit, ctx)]),
    yl: [E.factorFromYield(d, 2, 'kg'), E.lotsFromPortions(d, 7)],
    steps: (d.steps || []).map(s => ['it', 'en', 'es'].map(k => E.stepParts(s[k], d, 2, 'it-IT'))) })
  // R1.19: cost() also says how many lines use the Chef's estimated price — always 0 on official recipes (they have none)
  const rn = runs(NEW); for (const k of ['cost', 'cost3']) { if (rn[k].chef_est !== 0) bad.push('chef_est≠0 ' + d.title); delete rn[k].chef_est }
  const a = J(runs(OLD)), b = J(rn); n++
  if (a !== b) { diff++; bad.push(d.title) }
}
console.log(`ricette confrontate: ${n} · identiche: ${n - diff} · diverse: ${diff}${bad.length ? ' → ' + bad.slice(0, 10).join(', ') : ''}`)
console.log(`# pass ${diff === 0 ? 1 : 0}\n# fail ${diff === 0 ? 0 : 1}`)
process.exitCode = diff ? 1 : 0
