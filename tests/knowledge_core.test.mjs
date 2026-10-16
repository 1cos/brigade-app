// B-51 Knowledge Engine phase 1 — engine checks on READ-ONLY dumps of live Brigade (tests/knowledge_dump.mjs).
// Usage: node tests/knowledge_core.test.mjs
import { load, cardFor } from './knowledge_dump.mjs'
import { parsePack, lineAmount, knowledgeCard } from '../supabase/functions/_shared/knowledge_core.js'
import { ingredientCard } from '../supabase/functions/_shared/kitchen_core.js'
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++ }
const A = load(), by = n => A.ingredients.find(i => i.name === n)

// 1. pack reader: reads only what is unambiguous
const P = [['4/20 CT', 'verified', 80, 'pz'], ['5#', 'verified', 5, 'lb'], ['8/1#', 'verified', 8, 'lb'], ['3/ 50 CT', 'verified', 150, 'pz'], ['15 DZ', 'verified', 180, 'pz'], ['Each', 'verified', 1, 'pz'],
  ['6/3 KG', 'verified', 18, 'kg'], ['12/1 QT', 'verified', 12, 'qt'], ['32oz', 'estimated', 32, 'oz'], ['1 CA', 'missing'], ['6-4/2 oz', 'missing'], ['16-22 CT', 'missing'], ['9-1/2 GAL', 'missing'],
  ['2.75-7.0lb Tray', 'missing'], ['6/#10 cans "La Carmela"', 'missing'], ['', 'missing']]
for (const [t, s, n, u] of P) { const p = parsePack(t); ok(p.status === s && (n == null || (p.total === n && p.unit === u)), `pack "${t}" → ${p.status}${p.total != null ? ' ' + p.total + ' ' + p.unit : ''}${p.why ? ' (' + p.why + ')' : ''}`) }

// 2. invoice line amount: decided by the line total, never by habit
const la = (pack, qty, up, tot) => lineAmount({ pack_description: pack, qty, unit_price: up, line_total: tot })
let a = la('4/20 CT', 1, 159.88, 159.88); ok(a.s === 'verified' && a.amt === 80 && a.rule === 'per case', `Hardie's 1 case "4/20 CT" $159.88 → ${a.amt} pz (${a.rule})`)
a = la('20 LB', 2, 8.5, 170); ok(a.s === 'verified' && Math.round(a.amt) === 9072 && a.rule === 'whole line', `Fruge 2 case "20 LB" $8.50/lb = $170 → ${Math.round(a.amt)} g (${a.rule}), not 40 lb`)
a = la('10 LB', 10, 8.5, 85); ok(a.s === 'missing', `qty 10 × "10 LB" at $8.50 = $85: ambiguous → missing (${a.why})`)
a = la('50#', 1, 19.99, 25); ok(a.s === 'missing', `total does not match → missing (${a.why})`)

// 3. Artichokes (Chef 16/10): case 4 × 20, price each from the invoice, 128 g NOT approved automatically
const art = cardFor(A, by('Artichokes').id, true)
const v = art.vendors_k[0]
ok(v.pack.s === 'verified' && v.pack_total.qty === 80 && v.pack_total.outer === 4 && v.pack_total.inner === 20, `Artichokes: pack ${v.pack.v} (verified)`)
ok(v.price_each.s === 'verified' && Math.abs(v.price_each.v - 1.9985) < 1e-9, `Artichokes: price each $${v.price_each.v} = $159.88 ÷ 80 (verified)`)
ok(art.conversions.piece_g.s === 'estimated' && art.conversions.piece_g.v === 128, 'Artichokes: 128 g stays "estimated" (not approved)')
ok(art.price.per_g_status === 'estimated', 'Artichokes: FC05 per-gram price flagged as resting on the unapproved 128 g')
ok(v.checks.some(c => /Purchase unit says "lb"/.test(c.msg)), 'Artichokes: vendor sheet "lb" vs counted pack reported')
const soldArt = A.sales.filter(s => s.kind === 'item' && s.name === 'Artichoke').reduce((t, s) => t + Number(s.qty), 0)
ok(art.theoretical.v === 2 * soldArt && art.theoretical.unit === 'pz' && art.bought.v === 320, `Artichokes 28 days: used ${art.theoretical.v} pz = POS ${soldArt} × 2, bought ${art.bought.v} pz (4 cases)`)
const since = '2026-06-09', all = A.inv.filter(l => l.ingredient_id === by('Artichokes').id && l.invoice_date >= since)
const bought = all.reduce((s, l) => s + lineAmount(l).amt, 0); ok(bought === 1120, `Artichokes since 9/6: ${bought} pz bought (14 cases × 80), as in the audit`)

// 4. Chicken Parmesan (Chef 16/10): BOTH Arrabbiata lines (200 g + 75 g) count — never merged, never dropped
const cp = A.recipes.find(r => r.title === 'Chicken Parmesan'), arr = A.recipes.find(r => r.title === 'ARRABBIATA')
const lines = A.bom.filter(b => b.parent_recipe_id === cp.id && b.sub_recipe_id === arr.id).map(b => Number(b.quantity)).sort((x, y) => x - y)
ok(lines.join('+') === '75+200', `Chicken Parmesan BOM: Arrabbiata lines ${lines.join(' g + ')} g (unchanged)`)
const tom = cardFor(A, by('Canned Tomatoes').id, true).dishes.find(d => d.title === 'Chicken Parmesan')
ok(tom && Math.abs(tom.per_portion - 275 * 2950 / 3150) < 1e-6, `Canned Tomatoes per Chicken Parmesan = 275 g × 2950/3150 = ${tom && tom.per_portion.toFixed(2)} g (both lines)`)
const lob = cardFor(A, by('Lobster Tail').id, true)
ok(lob.dishes.some(d => d.title === 'ADD LOBSTER' && d.addon) && lob.dishes.some(d => d.title === 'Lobster Fettucine'), 'Lobster Tail: reaches ADD LOBSTER (modifier "Lobsters") and Lobster Fettucine through Thaw Lobster')

// 5. one engine: the knowledge card keeps the module-2 card unchanged inside
const base = ingredientCard(by('Artichokes').id, { ingredients: A.ingredients, bom: A.bom.filter(b => b.item_id === by('Artichokes').id), prep: A.prep, recipes: A.recipes, vendors: A.vendors }, true)
ok(['ingredient', 'used_in', 'preps', 'can_price', 'vendors'].every(k => JSON.stringify(base[k]) === JSON.stringify(art[k])), 'same base as the module-2 ingredient card (ingredientCard), no second engine')

// 6. staff never receive vendors, invoices or prices
const st = cardFor(A, by('Artichokes').id, false)
ok(!st.vendors && !st.vendors_k && !st.invoices && !st.price && !st.bought && !st.aliases && !/\$|unit_price|159\.88/.test(JSON.stringify(st)), 'staff card: no vendor, invoice, price or purchase field')

// 7. every ingredient used in a recipe: no crash, no NaN, every value labelled, every non-verified explained
const used = [...new Set(A.bom.filter(b => b.item_id).map(b => b.item_id))].filter(id => A.ingredients.some(i => i.id === id))
let crash = 0, nan = 0, unlabeled = 0, unexplained = 0; const S = { verified: 0, estimated: 0, missing: 0 }
const walk = o => { if (!o || typeof o !== 'object') return; if ('s' in o && 'v' in o) { if (!S.hasOwnProperty(o.s)) unlabeled++; else S[o.s]++; if (o.s !== 'verified' && !o.why && !o.src) unexplained++ } Object.values(o).forEach(walk) }
for (const id of used) { try { const c = cardFor(A, id, true); if (/NaN|Infinity/.test(JSON.stringify(c))) nan++; walk(c) } catch (e) { crash++; console.log('  crash', id, e.message) } }
ok(crash === 0 && nan === 0, `${used.length} ingredients used in recipes: ${crash} errors, ${nan} with NaN/Infinity`)
ok(unlabeled === 0 && unexplained === 0, `every value labelled (verified ${S.verified} · estimated ${S.estimated} · missing ${S.missing}); every estimated/missing has a reason or source`)
console.log(`\nRISULTATO: ${pass} superati, ${fail} falliti`)
process.exitCode = fail ? 1 : 0
