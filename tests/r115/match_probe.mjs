import fs from 'node:fs'
import { matchCandidates, needsMatch } from '../../supabase/functions/_shared/purchase_match.js'
const D = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
for (const name of process.argv.slice(4)) {
  const i = D.ing.find(x => x.name === name); const r = matchCandidates(i.id, D, [], { more: true })
  console.log(`\n== ${name}`); r.candidates.forEach(c => console.log(` ${c.level}${c.ambiguous ? ' AMBIGUO' : ''} ${c.score} | ${c.vendor} ${c.sku || ''} "${c.description}" → ${c.target ? c.target.name : '(nessun ingrediente)'} | ${c.invoices} fatt. ${c.last.date} ${c.last.pack} $${c.last.unit_price} ${c.price ? JSON.stringify(c.price) : ''} | ${c.why.map(w => w.k + ':' + (w.v ?? '')).join(' ')}`))
}
