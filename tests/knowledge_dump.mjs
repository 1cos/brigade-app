// Knowledge Engine (B-51 phase 1) on READ-ONLY dumps of live Brigade (~/brigade-audit-work/b52/data, SELECT only).
// Usage: node tests/knowledge_dump.mjs [ingredient name] → prints the card; node tests/knowledge_dump.mjs --gaps
import fs from 'node:fs'
import { knowledgeCard, gaps, parsePack } from '../supabase/functions/_shared/knowledge_core.js'
const D = process.env.KDUMP || `${process.env.HOME}/brigade-audit-work/b52/data`
const L = n => { const j = JSON.parse(fs.readFileSync(`${D}/${n}.json`, 'utf8')); return Array.isArray(j) ? j : j.rows }
export function load() {
  const facts = L('k_facts')[0].f
  return { ingredients: L('k_ing'), bom: L('k_bom'), recipes: L('k_rec'), yields: L('k_yld'), prep: L('k_prep'), vendors: L('k_vend'), aliases: L('k_alias'),
    inv: L('k_inv'), facts: typeof facts === 'string' ? JSON.parse(facts) : facts, each: L('k_each'), sales: L('k_sales'), counts: L('k_counts') }
}
export function cardFor(all, id, chef, today = '2026-10-15', days = 28) {
  const since = new Date(Date.parse(today) - days * 86400000).toISOString().slice(0, 10)
  return knowledgeCard(id, { ingredients: all.ingredients, bom: all.bom, recipes: all.recipes, yields: all.yields, prep: all.prep, vendors: all.vendors, aliases: all.aliases,
    invoices: all.inv.filter(l => l.ingredient_id === id).sort((a, b) => String(b.invoice_date).localeCompare(String(a.invoice_date))),
    facts: all.facts[id] || null, conv: [], each: all.each.filter(e => e.ingredient_id === id), sales: all.sales, counts: all.counts, days, since, today }, chef)
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const all = load(), arg = process.argv[2] || 'Artichokes'
  if (arg === '--gaps') {
    const g = gaps({ ingredients: all.ingredients, bom: all.bom, vendors: all.vendors, facts: all.facts, recipes: all.recipes,
      posFood: all.sales.filter(s => s.kind === 'item').map(s => ({ name: s.name, qty: Number(s.qty) })) })
    for (const [k, l] of Object.entries(g.lists)) { console.log(`\n## ${k} (${l.length})`); l.slice(0, 12).forEach(r => console.log('  ', r.name, '—', r.note)) }
    console.log('\nPOS unmapped', g.pos_unmapped.length, 'items,', g.pos_unmapped_qty, 'of', g.pos_total, 'portions'); console.log('used ingredients', g.used_ingredients)
  } else {
    const ing = all.ingredients.find(i => i.name.toLowerCase() === arg.toLowerCase()); if (!ing) { console.log('not found'); process.exit(1) }
    console.log(JSON.stringify(cardFor(all, ing.id, process.argv[3] !== 'staff'), null, 1))
  }
}
