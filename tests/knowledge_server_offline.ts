// B-51 phase 1 — runs the REAL server code (brigade-app-api/kitchen.ts: knowledge, knowledgeGaps) in Deno against an
// in-memory fake of the Supabase client filled from the READ-ONLY dumps. The fake caps every answer at 1000 rows like the
// real API, so a missing page loop would show up as wrong totals. Output must equal the engine run on the same dumps.
// Usage: deno run -A tests/knowledge_server_offline.ts
import * as KIT from '../supabase/functions/brigade-app-api/kitchen.ts'
import { knowledgeCard } from '../supabase/functions/_shared/knowledge_core.js'
const D = `${Deno.env.get('HOME')}/brigade-audit-work/b52/data`
const L = (n: string) => { const j = JSON.parse(Deno.readTextFileSync(`${D}/${n}.json`)); return Array.isArray(j) ? j : j.rows }
const NOW = new Date('2026-10-15T12:00:00Z'), SALE_DAY = '2026-10-01'
let uid = 0; const nid = () => 'x' + (++uid).toString().padStart(8, '0')
const facts = (() => { const f = L('k_facts')[0].f; return typeof f === 'string' ? JSON.parse(f) : f })()
// tables (the sales dump is aggregated by name: split into 10 rows each so the fake has > 1000 rows to page through)
const split = (rows: any[], mk: (r: any, q: number) => any) => rows.flatMap(r => Array.from({ length: 10 }, () => mk(r, Number(r.qty) / 10)))
const sales = L('k_sales'), docs: any[] = [], inv = L('k_inv').map((l: any) => { const imp = l.doc_number ? nid() : null; if (imp) docs.push({ id: imp, document_number: l.doc_number }); return Object.assign({ id: nid(), import_id: imp }, l) })
const T: Record<string, any[]> = {
  ingredients: L('k_ing'), recipe_bom: L('k_bom').map((b: any) => Object.assign({ bom_id: nid() }, b)), recipes: L('k_rec'), recipe_yield: L('k_yld'),
  prep_tasks: L('k_prep'), unit_each_weights: L('k_each'), ingredient_vendors: L('k_vend'), vendor_item_aliases: L('k_alias'), invoice_lines: inv, vendor_documents: docs,
  prep_stock_counts: L('k_counts'),
  pos_sales_by_item: split(sales.filter((s: any) => s.kind === 'item'), (r, q) => ({ id: nid(), menu_item: r.name, quantity: q, sale_date: SALE_DAY, is_historical: false, sales_category: 'Food' })),
  pos_modifiers: split(sales.filter((s: any) => s.kind === 'modifier'), (r, q) => ({ id: nid(), modifier: r.name, quantity_sold: q, sale_date: SALE_DAY, is_historical: false })),
}
let maxServed = 0
function from(t: string) {
  let rows = (T[t] || []).slice(), cols: string[] | null = null, head = false, count = false, lim: number | null = null, rng: [number, number] | null = null
  const b: any = {
    select(c: string, o: any = {}) { cols = c.split(',').map(x => x.trim()); head = !!o.head; count = o.count === 'exact'; return b },
    eq(k: string, v: any) { rows = rows.filter(r => r[k] === v); return b }, gte(k: string, v: any) { rows = rows.filter(r => r[k] != null && String(r[k]) >= String(v)); return b },
    in(k: string, v: any[]) { const s = new Set(v); rows = rows.filter(r => s.has(r[k])); return b },
    is(k: string, v: any) { rows = rows.filter(r => v === null ? r[k] == null : r[k] === v); return b },
    not(k: string, op: string, v: any) { rows = rows.filter(r => op === 'is' ? (v === null ? r[k] != null : r[k] !== v) : true); return b },
    order(k: string, o: any = {}) { const asc = o.ascending !== false; rows.sort((x, y) => (String(x[k] ?? '') < String(y[k] ?? '') ? -1 : String(x[k] ?? '') > String(y[k] ?? '') ? 1 : 0) * (asc ? 1 : -1)); return b },
    limit(n: number) { lim = n; return b }, range(a: number, z: number) { rng = [a, z]; return b },
    then(res: any, rej: any) {
      const total = rows.length; let out = rows
      if (rng) out = out.slice(rng[0], rng[1] + 1); if (lim != null) out = out.slice(0, lim); out = out.slice(0, 1000)   // API cap
      maxServed = Math.max(maxServed, out.length)
      const data = head ? null : out.map(r => cols && cols[0] !== '*' ? Object.fromEntries(cols.map(c => [c, r[c] ?? null])) : r)
      return Promise.resolve({ data, error: null, count: count ? total : null }).then(res, rej)
    },
  }
  return b
}
const svc = { from }, fx = async (ids: string[]) => Object.fromEntries(ids.filter(i => facts[i]).map(i => [i, facts[i]]))
let pass = 0, fail = 0; const ok = (c: boolean, m: string) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++ }
const since = new Date(NOW.getTime() - 28 * 86400000).toISOString().slice(0, 10)
const expect = (id: string, chef: boolean) => knowledgeCard(id, { ingredients: T.ingredients, bom: T.recipe_bom, recipes: T.recipes, yields: T.recipe_yield, prep: T.prep_tasks, vendors: chef ? T.ingredient_vendors : [], aliases: T.vendor_item_aliases,
  invoices: inv.filter((l: any) => l.ingredient_id === id).sort((a: any, b: any) => String(b.invoice_date).localeCompare(String(a.invoice_date))), facts: facts[id] || null, conv: [], each: T.unit_each_weights.filter((e: any) => e.ingredient_id === id),
  sales: sales.map((s: any) => ({ kind: s.kind, name: s.name, qty: Number(s.qty) })), counts: T.prep_stock_counts, days: 28, since, today: since }, chef)
const strip = (c: any) => JSON.parse(JSON.stringify(c, (k, v) => typeof v === 'number' ? Math.round(v * 1000) / 1000 : v))
const names = ['Artichokes', 'Lobster Tail', 'Canned Tomatoes', 'Flour', 'Shrimp', 'Heavy Cream', 'Butter', 'Parsley']
for (const n of names) for (const chef of [true, false]) {
  const id = T.ingredients.find((i: any) => i.name === n).id
  const got = strip(await KIT.knowledge({ id: chef ? 1 : 38, role: chef ? 'chef' : 'staff' } as any, id, svc, { facts: fx, now: NOW }))
  const exp = strip(expect(id, chef))
  // the server shows the 8 newest invoices + all of the window; the engine run above has them all: compare the shown list and the totals
  const same = JSON.stringify({ ...got, invoices: undefined }) === JSON.stringify({ ...exp, invoices: undefined }) && JSON.stringify((got.invoices || []).slice(0, 8)) === JSON.stringify((exp.invoices || []).slice(0, 8))
  ok(same, `${n} · ${chef ? 'Chef' : 'cuoco'}: server code = engine on the same data${got.theoretical?.v != null ? ` (used ${got.theoretical.v} ${got.theoretical.unit})` : ''}`)
}
ok(maxServed === 1000 && T.pos_sales_by_item.length > 1000, `pagination: the fake capped answers at 1000 rows (${T.pos_sales_by_item.length} sale rows read in pages)`)
let forbidden = false; try { await KIT.knowledgeGaps({ id: 38, role: 'staff' } as any, svc, { facts: fx, now: NOW }) } catch (e) { forbidden = (e as any).status === 403 }
ok(forbidden, 'To complete: staff → 403')
const g = await KIT.knowledgeGaps({ id: 1, role: 'chef' } as any, svc, { facts: fx, now: NOW })
ok(g.used_ingredients === 303 && g.lists.unit_mismatch.length === 11 && g.lists.piece_estimate.length === 4, `To complete (Chef): ${g.used_ingredients} ingredients, ${Object.entries(g.lists).map(([k, l]: any) => k + ' ' + l.length).join(', ')}`)
ok(g.pos_unmapped.length > 0 && g.pos_total > 0, `POS without recipe: ${g.pos_unmapped.length} items, ${Math.round(g.pos_unmapped_qty)} of ${Math.round(g.pos_total)} portions`)
console.log(`\nRISULTATO: ${pass} superati, ${fail} falliti`)
Deno.exit(fail ? 1 : 0)
