import * as E from '/Users/massimilianozubboli/brigade-app/supabase/functions/_shared/mre_engine.js'
import fs from 'node:fs'
const d=JSON.parse(fs.readFileSync(process.argv[2])); const id=d.draft.id
const mk=doc=>({doc:x=>x===id?doc:((d.draft_docs||{})[x]||d.docs[x]),facts:x=>d.facts[x],measures:d.measures})
let ok=0,ko=0; const t=(n,c)=>{c?ok++:ko++; console.log((c?'PASS ':'FAIL ')+n)}
const base=JSON.parse(JSON.stringify(d.draft)), c0=E.cost(id,1,mk(base))
const withEst=(est,unit,qty)=>{const x=JSON.parse(JSON.stringify(base)); const l=x.lines.find(l=>l.id==='b2175'); l.est=est; if(unit){l.unit=unit;l.qty=qty}; return x}
// rum line 30 g, estimate per 750 ml: no density -> stays missing, said
let x=withEst({usd:25,qty:750,unit:'ml'}); let c=E.cost(id,1,mk(x))
t('stima in ml, riga in g: resta mancante', c.missing===c0.missing && Math.abs(c.food-c0.food)<1e-9 && c.chef_est===0)
t('...e lo dice (manca la densità)', E.issues(id,mk(x)).some(i=>i.code==='conversione'&&i.status==='densita_mancante'))
// estimate per gram
x=withEst({usd:25,qty:700,unit:'g'}); c=E.cost(id,1,mk(x))
t('stima a peso: 30 g = $'+(30*25/700).toFixed(3), Math.abs(c.food-c0.food-30*25/700)<1e-9 && c.chef_est===1 && c.missing===c0.missing-1)
t('riga segnata stima_chef', c.byLine.b2175.status==='stima_chef')
t('issue prezzo_stima_chef', E.issues(id,mk(x)).some(i=>i.code==='prezzo_stima_chef') && !E.issues(id,mk(x)).some(i=>i.code==='prezzo_mancante'&&i.ref===x.lines[2].ref))
// line in fl oz with per-ml estimate
x=withEst({usd:25,qty:750,unit:'ml'},'fl oz',1); c=E.cost(id,1,mk(x))
t('riga 1 fl oz, stima $25/750 ml = $'+(29.5735*25/750).toFixed(3), Math.abs(c.food-c0.food-29.5735*25/750)<1e-9)
// estimate never overrides an invoice price (cheese has one)
x=JSON.parse(JSON.stringify(base)); x.lines.find(l=>l.id==='b2176').est={usd:1,qty:1,unit:'g'}; c=E.cost(id,1,mk(x))
t('mai sopra un prezzo da fattura', Math.abs(c.food-c0.food)<1e-9 && c.chef_est===0)
// validate
x=withEst({usd:0,qty:750,unit:'ml'}); t('validate rifiuta stima a zero', E.validate(x,mk(x),false).includes('riga_stima:b2175'))
x=withEst({usd:25,qty:750,unit:'boh'}); t('validate rifiuta unità sconosciuta', E.validate(x,mk(x),false).includes('riga_stima:b2175'))
x=withEst({usd:25,qty:750,unit:'ml'}); t('validate accetta stima buona', E.validate(x,mk(x),false).length===0)
// without est: identical to before
t('senza stima: costo identico', JSON.stringify(E.cost(id,1,mk(base)).byLine)===JSON.stringify(c0.byLine))
// sale movements unaffected by est
const m0=E.explode(id,1,'vendita',mk(base)).map(l=>{const {est,...r}=l;return r}), m1=E.explode(id,1,'vendita',mk(withEst({usd:25,qty:700,unit:'g'}))).map(l=>{const {est,...r}=l;return r})
t('scarichi simulati identici', JSON.stringify(m0)===JSON.stringify(m1))
console.log(ok+'/'+(ok+ko))
