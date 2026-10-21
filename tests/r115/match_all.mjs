import fs from 'node:fs'
import { matchCandidates } from '../../supabase/functions/_shared/purchase_match.js'
const D = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const used = [...new Set(D.bomu.map(b => b.ing))], I = Object.fromEntries(D.ing.map(i => [i.id, i]))
const linked = new Set(D.inv.filter(l => l.ing).map(l => l.ing))
let n = 0, forte = 0, poss = 0, amb = 0
for (const id of used) { if (!I[id] || linked.has(id)) continue; n++
  const r = matchCandidates(id, D); const c = r.candidates.filter(x => x.level === 'forte' || x.level === 'possibile')
  if (!c.length) continue
  if (c[0].level === 'forte') forte++; else poss++; if (c[0].ambiguous) amb++
  console.log(`${I[id].name} → ${c.map(x => `[${x.level}${x.ambiguous ? '/AMB' : ''} ${x.score}] ${x.vendor}: ${x.description}${x.target ? ' (=' + x.target.name + ')' : ''}`).join(' || ')}`) }
console.log(`\ningredienti usati senza nessuna fattura collegata: ${n}; con proposta forte ${forte}, possibile ${poss}, ambigue ${amb}`)
