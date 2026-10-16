// Smart Checklist (B-51 phase 1) on READ-ONLY dumps of live Brigade (~/brigade-audit-work/b52/data, SELECT only).
// Usage: node tests/checklist_dump.mjs [YYYY-MM-DD]
import fs from 'node:fs'
import { stationPriorities } from '../supabase/functions/_shared/checklist_core.js'
const D = `${process.env.HOME}/brigade-audit-work/b52/data`
const L = n => { const j = JSON.parse(fs.readFileSync(`${D}/${n}.json`, 'utf8')); return Array.isArray(j) ? j : j.rows }
export function loadC() {
  return { bom: L('k_bom'), recipes: L('k_rec'), yields: L('k_yld'), sales: L('k_sales_daily').map(s => ({ date: s.date, kind: s.kind, name: s.name, qty: Number(s.qty) })),
    openDates: L('k_open').map(r => r.date), events: L('k_events').map(e => ({ name: e.name, date: e.date, guests: e.guests, status: e.status, menu_linked: false })) }
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const r = stationPriorities(Object.assign(loadC(), { today: process.argv[2] || '2026-10-16' }))
  console.log(JSON.stringify(r, null, 1).slice(0, 6000))
}
