// B-88 — PREVENTIVO CATERING dentro Brigade 2 (Max 29/10/2026).
// Motore = traduzione fedele di ~/Tripleseat_Archive/catering_knowledge/preventivo/{preventivo.py, server.py, event_plan.py}
// (regole CATERING_KNOWLEDGE_CENSUS v1.4; prova di parità: b88/tests/parity.mjs). Nessuna regola nuova inventata.
// Prezzi: listino di riferimento P (fatture dei consuntivi fino al 01/10) + prezzi VIVI da Brigade passati in `live`
// (ultima fattura, funzione cq_prices). Se un prezzo vivo manca resta quello di riferimento, segnalato.
// Funzioni pure: girano uguali nel server (Deno) e nelle prove (Node).

export const LB = 453.592
const OZ_FL = 29.5735

// id: [descrizione, unità, prezzo per unità, fornitore, fonte, stato]
export const P = {
  taralli: ['Fennel taralli', 'g', 72.87 / 6000, "Hardie's", '26/08 2x3kg $72.87', 'VERIFIED'],
  salame: ['Salame Napoli Levoni', 'g', 16.50 / LB, 'Global Gourmet', 'fatt. 20734 16/06 $16.50/lb', 'VERIFIED'],
  ricotta: ['Ricotta 32 oz', 'g', 5.24 / 907.18, 'Walmart', '26/08 $5.24', 'VERIFIED'],
  parm_grated: ['Parmesan grated', 'g', 88.78 / 9071.85, "Hardie's", '16/09 4x5lb $88.78', 'VERIFIED'],
  reggiano: ['Parmigiano Reggiano 24m', 'g', 13.50 / LB, "Hardie's", '28/08 $13.50/lb', 'VERIFIED'],
  potato_flakes: ['Fiocchi di patate', 'g', null, '?', 'mai fatturati', 'UNKNOWN'],
  grape_green: ['Uva verde (white seedless)', 'g', 4.49 / 907.18, "Hardie's", '23/09 2lb $4.49', 'VERIFIED'],
  skewer: ['Stecchino', 'pz', 0.04, 'Walmart', 'chef $4/100', 'CHEF STANDARD'],
  meatball_mix: ['Impasto Meatballs (lotto 9.012 g)', 'g', 59.5098 / 9012, 'mix', 'lotto prezzi 27/08', 'VERIFIED'],
  meatball_sauce: ['Meatball sauce (Pomodoro+Demi)', 'g', 9.2172 / 3300, 'mix', 'lotto prezzi 27/08', 'VERIFIED'],
  breadcrumbs: ['Pangrattato Sysco', 'g', 26.73 / 6803.89, 'Sysco', 'foto 27/03 $26.73/15lb', 'VERIFIED'],
  watermelon: ['Cocomero seedless', 'pz', 14.02, "Hardie's", '14/08 $14.02 (Walmart $4.65)', 'VERIFIED'],
  cherry_tomato: ['Pomodorini Hiiros', 'g', 36.89 / 2721.55, "Hardie's", '12/08 8x12oz $36.89', 'VERIFIED'],
  mozz_pearl: ['Perle di mozzarella', 'pz', 0.10, '?', 'chef ~50/$5', 'PROVISIONAL'],
  mozz_slice: ['Mozzarella thin slice', 'g', 4.82 / LB, "Hardie's", '08/07 $4.82/lb (Brigade errato)', 'VERIFIED'],
  beefsteak: ['Pomodoro beefsteak', 'pz', 33.68 / 18, "Hardie's", '08/07 18pz $33.68', 'PROVISIONAL'],
  basil: ['Basilico', 'g', 9.00 / LB, "Hardie's", '1lb $9.00', 'VERIFIED'],
  basil_oil: ['Basil oil (solo basilico)', 'g', 3.9683 / 2000, 'mix', 'ricetta BASIL OIL; olio non prezzato', 'VERIFIED'],
  cantaloupe: ['Melone cantaloupe', 'pz', 7.83 / 3, "Hardie's", '26/08 3CT $7.83', 'VERIFIED'],
  strawberries: ['Fragole 1 lb', 'conf', 2.19, 'Walmart', '26/08', 'VERIFIED'],
  blackberry: ['More (conf.)', 'conf', 9.68 / 3, "Hardie's", '26/08 3CT $9.68', 'VERIFIED'],
  blueberry: ['Mirtilli (conf.)', 'conf', 8.18 / 3, "Hardie's", '24/08 3CT $8.18', 'VERIFIED'],
  grape_bag: ['Uva (sacchetto 2 lb)', 'conf', 3.95, "Hardie's", '26/08', 'VERIFIED'],
  flour00: ['Farina 00', 'g', 50.92 / 24947.6, 'Ben E. Keith', 'Flour Pizza 00 55lb $50.92', 'VERIFIED'],
  evo: ['Olio EVO', 'ml', 164 / 15000, 'Global Gourmet', '3x5L $164', 'VERIFIED'],
  mortadella_2f: ['Mortadella (ripieno 2 focacce)', 'fisso', 15.00, 'Global Gourmet', 'chef', 'PROVISIONAL'],
  bru_topping: ['Tomato x bruschetta', 'g', 21.1099 / 1500, 'mix', 'lotto prezzi 09/10', 'VERIFIED'],
  french_bread: ['French bread 14 oz', 'filone', 1.47, 'Walmart', '08/09 $1.47', 'VERIFIED'],
  pelati_gg: ['Pelati La Carmela 6x3kg', 'g', 35 / 18000, 'Global Gourmet', 'fatt. 20734 + peso chef', 'CHEF STANDARD'],
  rosemary: ['Rosmarino', 'g', 9.00 / LB, "Hardie's", '1lb', 'VERIFIED'],
  mozz_shred: ['Mozzarella shredded Grande', 'g', 22.07 / 2267.96, "Hardie's", '08/08 5lb $22.07', 'VERIFIED'],
  chicken_grill: ['Petto pollo economico (Freshness G.)', 'lb', 2.70, 'Walmart', 'chef $2.70/lb', 'PROVISIONAL'],
  chicken_premium: ['Petto pollo premium (Perdue?)', 'lb', null, 'Walmart', '$/lb sconosciuto', 'UNKNOWN'],
  steak: ['NY Strip / Ribeye / Filetto', 'pz', 20.00, '—', 'costo fisso chef', 'CHEF STANDARD'],
  arugula: ['Rucola', 'g', 14.21 / 1360.78, "Hardie's", '3lb $14.21', 'VERIFIED'],
  glaze: ['Glassa balsamica Sysco', 'g', 31.23 / 2194.25, 'Sysco', 'foto 27/03', 'VERIFIED'],
  carnaroli: ['Riso carnaroli', 'g', 5.40 / 1000, 'Global Gourmet', 'chef $5.40/kg', 'PROVISIONAL'],
  butter: ['Burro unsalted', 'g', 85.99 / 16329.3, "Hardie's", '36lb $85.99', 'VERIFIED'],
  romaine: ['Romana hearts', 'g', 29.42 / 22536, "Hardie's", '09/09 $29.42 (peso anagrafica)', 'PROVISIONAL'],
  spring_mix: ['Spring mix', 'g', 15.24 / (3 * LB), "Hardie's", '13/07 3lb $15.24 (TEVA)', 'VERIFIED'],
  carrots: ['Carote', 'g', 0.20988 / 100, "Hardie's", '10/07 (TEVA)', 'VERIFIED'],
  seed_mix: ['Seed mix (girasole + zucca)', 'g', 1.2637 / 100, 'mix', '02/09 (TEVA [POST])', 'VERIFIED'],
  caesar_dress: ['Caesar dressing BEK', 'g', 71.38 / 15141.6, 'Ben E. Keith', '20/08 $71.38 (più alto)', 'VERIFIED'],
  asparagus: ['Asparagi', 'g', 54.27 / 4989.5, "Hardie's", '07/08 11lb $54.27', 'VERIFIED'],
  potatoes: ['Patate Yukon', 'g', 40.90 / 22679.6, "Hardie's", '29/07 50lb $40.90', 'VERIFIED'],
  penne: ['Penne', 'g', 25.88 / 9071.85, 'Ben E. Keith', '20lb $25.88', 'VERIFIED'],
  arrabbiata: ['Arrabbiata (lotto 3.150 g)', 'g', 8.3847 / 3150, 'mix', 'lotto TEVA, pelati GG', 'VERIFIED'],
  cacio_pp: ['Penne cacio e pepe catering, a persona', 'pers', 11.2076 / 30, 'mix', 'Riley (ricetta 100 porz.)', 'VERIFIED'],
  pannacotta_lot: ['Panna cotta lotto 10 porz. ristorante', 'lotto', 6.4925, 'mix', 'panna 9x1/2gal, zucchero, gelatina', 'VERIFIED'],
  coulis: ['Berry coulis', 'g', 23.0786 / 3475, 'mix', 'BEK Berry Blend + zucchero', 'VERIFIED'],
  nutella: ['Nutella BEK', 'g', 62.41 / 5987.4, 'Ben E. Keith', 'conf. ordine 18/07', 'VERIFIED'],
  mascarpone: ['Mascarpone BEK', 'g', 82.49 / 9071.85, 'Ben E. Keith', '23/07 4x5lb $82.49', 'VERIFIED'],
  lady_finger: ['Lady Finger GF (casa)', 'pz', 2.3766 / 50, 'mix', 'ricetta 50 pz', 'VERIFIED'],
  cake: ['Torta catering', 'pz', 20.00, '—', 'costo fisso chef', 'CHEF STANDARD'],
  special_meal: ['Pasto speciale GF/DF/vegano', 'pz', 7.00, '—', 'costo fisso chef', 'CHEF STANDARD'],
  mint_bavarese: ['Mint bavarese (torta 12 porz.)', 'pz', 8.6463, 'mix', 'Zellers 08/07', 'VERIFIED'],
  cremino: ['Cremino (1 torta)', 'pz', 29.1424 / 2, 'mix', 'ricetta chef, Zellers', 'CHEF STANDARD'],
  salmon_cake: ['Salmon cake (porz. ristorante)', 'pz', 32.9471 / 13, 'mix', 'lotto Zellers (salmone Fruge)', 'VERIFIED'],
  parma: ['Prosciutto di Parma', 'g', 12.80 / LB, 'Global Gourmet?', 'chef $12.80/lb', 'PROVISIONAL'],
  // Fruit Tray = ricetta Brigade dello Chef (29/10), 1 vassoio; riferimento = vassoio standard dei consuntivi (stessi frutti)
  fruit_tray_lot: ['Fruit Tray, 1 vassoio (ricetta Brigade)', 'pz', 0.5 * 14.02 + 7.83 / 3 + 2.19 + 2 * 9.68 / 3 + 2 * 8.18 / 3 + 3.95, 'mix', 'vassoio standard dei consuntivi (26/08)', 'VERIFIED'],
  lasagna_pan: ['Lasagna, teglia (ricetta Brigade Lasagna Pan)', 'pz', null, 'mix', 'ricetta Brigade Lasagna Pan', 'UNKNOWN'],   // Chef 29/10
  piccata_sauce10: ['Salsa piccata per 10 persone', 'lotto', (300 * 48.82 / 9500 + 100 * 85.99 / 16329.3 + 10 * 3.55 / 360), 'mix', 'Zellers (vino/capperi nel buffer)', 'VERIFIED'],
}
// pizza sauce R31: 3 kg pelati + 50 g olio + 3 g rosmarino + 15 g basilico (calcolata con i prezzi in uso)
const pizzaSauce = (pr) => (3000 * pr('pelati_gg') + 50 * pr('evo') + 3 * pr('rosemary') + 15 * pr('basil')) / 3068

const ceil = (x) => Math.ceil(x - 1e-9)
const finger = (n) => ceil(n * 1.30)                    // S01
const g = (x) => String(Number(Number(x).toPrecision(6)))   // come {:g} di Python
// arrotondamento come Python: si guardano le cifre ESATTE del numero; solo un vero «…5000» va al pari (382,5 → 382)
const fix = (x, d) => { x = Number(x); const neg = x < 0, e = Math.abs(x).toFixed(Math.min(100, d + 60))
  const [ip, fp] = e.split('.'), keep = fp.slice(0, d), rest = fp.slice(d)
  let digits = ip + keep, up_ = rest[0] > '5' || (rest[0] === '5' && (/[1-9]/.test(rest.slice(1)) || Number(digits.slice(-1)) % 2 === 1))
  if (up_) digits = (BigInt(digits) + 1n).toString().padStart(digits.length, '0')
  const out = d ? digits.slice(0, digits.length - d) + '.' + digits.slice(digits.length - d) : digits
  return (neg && Number(out) !== 0 ? '-' : '') + (out.startsWith('.') ? '0' + out : out) }
const f2 = (x) => fix(x, 2), f0 = (x) => fix(x, 0), f1 = (x) => fix(x, 1)

/* ---------------- CATALOGO: (N, opzioni) → [etichetta quantità, righe [pid, q], note] ---------------- */
const C = {
  taralli_salame: (N, o) => { const n = o.pezzi || finger(N); return [`${n} porzioni finger`, [['taralli', 8 * n], ['salame', 8 * n]], ['Q01 +30%']] },
  ricotta_grape_balls: (N, o) => { const n = o.pezzi || finger(N); return [`${n} palline`, [['ricotta', 8 * n], ['parm_grated', 2 * n], ['potato_flakes', n], ['grape_green', 7 * n], ['skewer', n]], ['Q16']] },
  meatballs: (N, o) => { const n = o.pezzi || ('quota' in o ? ceil(N * o.quota) : finger(N))
    const rows = [['meatball_mix', 25 * n], ['breadcrumbs', 25 * n * 820 / 9012], ['meatball_sauce', 10 * n]]
    if (o.skewer !== false) rows.push(['skewer', n]); return [`${n} polpette da 25 g`, rows, ['Q04']] },
  watermelon_tomato: (N, o) => { const n = o.pezzi || finger(N); const m = o.cocomeri || (n <= 104 ? 0.5 : ceil(n / 208 * 2) / 2)
    const w = n <= 104 ? [] : ['CONF: oltre 104 pezzi il numero di cocomeri è da confermare (1 cocomero > 200 cubi)']
    return [`${n} pezzi (` + (m === 0.5 ? '1/2' : g(m)) + ' cocomero)', [['watermelon', m], ['cherry_tomato', 7.5 * n], ['skewer', n]], ['Q17', ...w]] },
  caprese_skewer: (N, o) => { const n = o.pezzi || finger(N); return [`${n} spiedini`, [['cherry_tomato', 15 * n], ['mozz_pearl', 2 * n], ['skewer', n]], ['Q03']] },
  caprese: (N, o) => { const n = o.fette || finger(N); return [`${n} fette pomodoro + ${n} fette mozzarella`, [['beefsteak', n * 48.333 / 333.3], ['mozz_slice', 23.333 * n], ['basil', 2 * n / 5], ['basil_oil', 10 * n / 5]], ['Q02 (1+1 fetta, +30%)']] },
  bruschetta: (N, o) => { const n = o.fette || finger(N); return [`${n} fette (${f2(n / 25)} filoni)`, [['bru_topping', 30 * n], ['french_bread', n / 25]], ['Q15']] },
  // Chef 29/10: 1 vassoio fino a 40 persone, 2 da 41 a 80 → 1 ogni 40; sopra 80 stessa regola, da confermare
  fruit_tray: (N, o) => { const w = []; const t = 'vassoi' in o ? o.vassoi : ceil(N / 40)
    if (!('vassoi' in o) && N > 80) w.push(`CONF: fruit tray sopra 80 persone (${N}): calcolati ${t} vassoi, 1 ogni 40 — da confermare`)
    const rows = [['fruit_tray_lot', t]]
    if (o.spiedini) rows.push(['skewer', o.pezzi || finger(N)])
    return [t <= 1 ? `${g(t)} vassoio (ricetta Fruit Tray)` : `${g(t)} vassoi (ricetta Fruit Tray)`, rows, ['Chef 29/10: 1 vassoio ogni 40 persone', ...w]] },
  focaccia: (N, o) => { const f = o.focacce || ceil(N / 20); const rows = [['flour00', 700 * f], ['evo', 1450 / 12 * f + 2 * OZ_FL * f]]
    if (o.ripiena) rows.push(['mortadella_2f', f / 2]); return [`${f} focacce${o.ripiena ? ' ripiene' : ''}`, rows, ['Q19']] },
  pizza: (N, o) => { const t = o.teglie || ceil(N / 20); return [`${t} teglie`, [['flour00', 700 * t / 2], ['evo', 1450 / 24 * t], ['pizza_sauce', 350 * t], ['mozz_shred', 500 * t]], ['Q20/R31']] },
  ny_strip: (N, o) => { const s = o.bistecche || ceil(N / 4); const rows = [['steak', s]]
    if (o.contorno !== false) rows.push(['arugula', 30 * s], ['parm_grated', 10 * s], ['glaze', 10 * s]); return [`${s} bistecche`, rows, ['S07/C01/Q27']] },
  chicken: (N, o) => { const cov = ceil(N * ('quota' in o ? o.quota : 1)), cooked = cov / 3 * 100, raw = cooked / 0.75
    return [`${cov} persone: ${f0(cooked)} g cotto = ${f0(raw)} g crudo`, [[o.premium ? 'chicken_premium' : 'chicken_grill', raw / LB], ['evo', raw * 150 / 3000]], ['Q05']] },
  chicken_piccata: (N, o) => [`${N} x 150 g crudo`, [[o.premium !== false ? 'chicken_premium' : 'chicken_grill', 150 * N / LB], ['piccata_sauce10', N / 10]], ['Q06']],
  risotto: (N) => { const r = 50 * N; return [`${r} g riso crudo`, [['carnaroli', r], ['butter', r * 0.3], ['reggiano', r * 0.5]], ['Q12 (Knorr nel buffer)']] },
  caesar: (N) => { const p = N / 3; return [`${f2(p)} porzioni ristorante`, [['romaine', 100 * p], ['parm_grated', 30 * p], ['caesar_dress', 30 * N]], ['Q13']] },
  house_salad_caesar: (N) => { const p = N / 3; return [`${f2(p)} porzioni ristorante`, [['spring_mix', 40 * p], ['cherry_tomato', 20 * p], ['carrots', 20 * p], ['seed_mix', 10 * p], ['caesar_dress', 30 * N]], ['Q14']] },
  asparagus: (N) => [`${30 * N} g`, [['asparagus', 30 * N]], ['Q08']],
  potatoes: (N) => [`${50 * N} g crude`, [['potatoes', 50 * N], ['evo', 50 * N * 320 / 8000]], ['Q07']],
  penne_arrabbiata: (N) => [`${40 * N} g penne`, [['penne', 40 * N], ['arrabbiata', 50 * N]], ['Q10']],
  penne_cacio_pepe: (N) => [`${N} persone`, [['cacio_pp', N]], ['Q09']],
  mini_pannacotta: (N, o) => { const m = o.pezzi || finger(N); return [`${m} mini`, [['pannacotta_lot', m / 2 / 10], o.cioccolato ? ['nutella', 5 * m] : ['coulis', 20 * m]], ['S08/Q21 (PK85 nel buffer)']] },
  mini_tiramisu: (N, o) => { const m = o.pezzi || finger(N); return [`${m} mini`, [['mascarpone', 50 * m / 3], ['lady_finger', ceil(m * 0.5)]], ['S09/Q22']] },
  cake: (N, o) => { const q = 'qty' in o ? o.qty : 1; return [`${g(q)} ${q === 1 ? 'torta' : 'torte'}`, [['cake', q]], []] },
  special_meal: (N, o) => { const q = 'qty' in o ? o.qty : 1; return [`${g(q)} ${q === 1 ? 'pasto speciale' : 'pasti speciali'}`, [['special_meal', q]], []] },
  mint_bavarese: (N, o) => { const t = o.torte || ceil(N / 12); return [`${t} torte`, [['mint_bavarese', t]], ['Q24']] },
  cremino: (N, o) => { const t = o.torte || ceil(N / 12); return [`${t} torte`, [['cremino', t]], ['Q25']] },
  salmon_cake: (N) => { const p = N / 2; return [`${f1(p)} porzioni ristorante`, [['salmon_cake', p]], ['Q23']] },
  lasagna: (N, o) => { const t = o.teglie || ceil(N / 18); return [`${t} teglie (18 persone a teglia)`, [['lasagna_pan', t]], ['Chef 29/10: 18 persone a teglia']] },   // B-88: regola data dallo Chef
  melon_parma: (N, o) => { const n = o.pezzi || finger(N); return [`${n} pezzi`, [['cantaloupe', n / 50], ['parma', 7.5 * n], ['skewer', n]], ['Q26']] },
}
export const NOT_AUTOMATED = { charcuterie: 'C08: non standard — chiedere allo chef', tramezzini: 'R28: nessuna ricetta', tiramisu_truffle_balls: 'C09: costo fisso provvisorio da chiedere' }

// etichetta, categoria, numero modificabile [campo, etichetta], opzioni sì/no [campo, etichetta, predefinito]
export const META = {
  taralli_salame: ['Taralli & salame', 'Finger', ['pezzi', 'Porzioni'], []],
  ricotta_grape_balls: ['Palline ricotta & uva', 'Finger', ['pezzi', 'Palline'], []],
  meatballs: ['Polpette', 'Finger', ['pezzi', 'Polpette'], [['skewer', 'Su spiedino', true]]],
  watermelon_tomato: ['Cocomero & pomodorino', 'Finger', ['pezzi', 'Pezzi'], []],
  caprese_skewer: ['Spiedino caprese', 'Finger', ['pezzi', 'Spiedini'], []],
  bruschetta: ['Bruschetta al pomodoro', 'Finger', ['fette', 'Fette'], []],
  melon_parma: ['Melone & Parma', 'Finger', ['pezzi', 'Pezzi'], []],
  caprese: ['Caprese a fette', 'Antipasti', ['fette', 'Fette'], []],
  focaccia: ['Focaccia', 'Pane & pizza', ['focacce', 'Focacce'], [['ripiena', 'Ripiena (mortadella)', false]]],
  pizza: ['Pizza in teglia', 'Pane & pizza', ['teglie', 'Teglie'], []],
  risotto: ['Risotto nella forma', 'Primi', null, []],
  penne_arrabbiata: ['Penne arrabbiata', 'Primi', null, []],
  penne_cacio_pepe: ['Penne cacio e pepe', 'Primi', null, []],
  lasagna: ['Lasagna (teglia da 18)', 'Primi', ['teglie', 'Teglie'], []],
  caesar: ['Caesar salad', 'Insalate', null, []],
  house_salad_caesar: ['House salad', 'Insalate', null, []],
  ny_strip: ['NY Strip', 'Secondi', ['bistecche', 'Bistecche'], [['contorno', 'Rucola, grana, glassa', true]]],
  chicken: ['Pollo grigliato', 'Secondi', null, []],
  chicken_piccata: ['Chicken piccata', 'Secondi', null, []],
  salmon_cake: ['Salmon cake', 'Secondi', null, []],
  asparagus: ['Asparagi', 'Contorni', null, []],
  potatoes: ['Patate al forno', 'Contorni', null, []],
  fruit_tray: ['Fruit tray (vassoio di frutta)', 'Frutta & dolci', ['vassoi', 'Vassoi'], [['spiedini', 'A spiedini', false]]],
  mini_pannacotta: ['Mini panna cotta', 'Frutta & dolci', ['pezzi', 'Mini'], [['cioccolato', 'Al cioccolato (Nutella)', false]]],
  mini_tiramisu: ['Mini tiramisù', 'Frutta & dolci', ['pezzi', 'Mini'], []],
  cremino: ['Cremino', 'Frutta & dolci', ['torte', 'Torte'], []],
  mint_bavarese: ['Mint bavarese', 'Frutta & dolci', ['torte', 'Torte'], []],
  cake: ['Torta (costo fisso $20)', 'Frutta & dolci', ['qty', 'Torte'], []],
  special_meal: ['Pasto speciale ($7)', 'Altro', ['qty', 'Pasti'], []],
  charcuterie: ['Tagliere salumi & formaggi', 'Da chiedere', null, []],
  tramezzini: ['Tramezzini', 'Da chiedere', null, []],
  tiramisu_truffle_balls: ['Tiramisù truffle balls', 'Da chiedere', null, []],
}
const STATUS_IT = { CONFIRMED: 'Confermato', RECIPE: 'Ricetta Brigade', VERIFIED: 'Verificato', 'CHEF STANDARD': 'Regola chef', PROVISIONAL: 'Provvisorio', UNKNOWN: 'Mancante', BRIGADE: 'Fattura Brigade', 'CHEF ESTIMATE': 'Stima Chef (Brigade)', 'CHEF TEMP': 'Prezzo Chef' }

export const up = (x) => Math.ceil(x * 100 - 1e-9) / 100

// B-99c: le regole di quantità (stesse funzioni usate da quote()), per costruire le tabelle della pagina «Food cost catering»
export const hasRule = (key) => Object.prototype.hasOwnProperty.call(C, key)
export const ruleRows = (key, N, opts = {}) => C[key](N, opts)

function fmtQty(q, u) {
  if (u === 'g') return q >= 1000 ? `${f2(q / 1000)} kg` : `${f0(q)} g`
  if (u === 'ml') return q >= 1000 ? `${f2(q / 1000)} L` : `${f0(q)} ml`
  if (u === 'lb') return `${f2(q)} lb (${f2(q * LB / 1000)} kg)`
  const n = { pz: 'pz', conf: 'conf.', filone: 'filoni', lotto: 'lotti', pers: 'persone', fisso: 'quota' }[u]
  if (n) return Math.abs(q - Math.round(q)) < 1e-9 ? `${g(q)} ${n}` : `${f2(q)} ${n}`
  return `${f2(q)} ${u}`
}

export const catalog = () => Object.entries(META).map(([key, [label, cat, ov, tg]]) => ({ key, label, cat, ov: ov ? { field: ov[0], label: ov[1] } : null, toggles: tg.map(([field, label, def]) => ({ field, label, default: def })) }))

/* ---------------- PREVENTIVO (= server.quote) ----------------
   live: { pid: { price, vendor, source, status: 'BRIGADE'|'CHEF ESTIMATE', date } } prezzi vivi da Brigade (facoltativo) */
export function quote(ev, live = {}) {
  const N = parseInt(ev.guests, 10)
  if (!(N > 0) || N > 2000) throw new Error('bad_guests')
  const R = ev.revenue ? Number(ev.revenue) : null
  const row = (pid) => {
    if (pid === 'pizza_sauce') { const pr = (k) => (row(k).price || 0); return { desc: 'Salsa pizza (R31)', unit: 'g', price: pizzaSauce(pr), vendor: 'mix', source: 'pelati GG + olio + rosmarino + basilico', status: 'CHEF STANDARD' } }
    const [d, u, price, vend, src, st] = P[pid], L = live[pid]
    if (L && L.price != null) {
      const ratio = price ? L.price / price : null
      return { desc: d, unit: u, price: L.price, vendor: L.vendor || vend, source: L.source, status: L.status || 'BRIGADE', ref_price: price, ref_source: src, date: L.date || null,
        far: ratio != null && (ratio > 2 || ratio < 0.5) && !L.confirmed && !L.warn, old: !!L.old && !L.confirmed, warn: L.warn, confirmed: !!L.confirmed }
    }
    // nessun prezzo vivo: riferimento dei consuntivi (L può portare «confermato dallo Chef» o «ricetta incompleta: mancano …»)
    return { desc: d, unit: u, price, vendor: vend, source: src, status: L && L.confirmed && price != null ? 'CONFIRMED' : st, ref: true, warn: L && L.warn, confirmed: !!(L && L.confirmed) }
  }
  const items = [], shop = {}, attention = []
  let total = 0
  for (const it of ev.items || []) {
    const key = it.item, label = (META[key] || [key])[0]
    if (NOT_AUTOMATED[key]) {
      items.push({ key, label, qty: '—', cost: null, lines: [], rules: [], ask: NOT_AUTOMATED[key] })
      attention.push({ kind: 'ask', item: label, text: NOT_AUTOMATED[key].split(': ').slice(1).join(': ') }); continue
    }
    if (!C[key]) throw new Error('bad_item')
    const [qlabel, rows, notes] = C[key](N, it)
    const lines = []; let sub = 0
    for (const [pid, q] of rows) {
      const r = row(pid), cost = r.price == null ? null : q * r.price
      if (cost != null) { sub += cost; const v = (shop[r.vendor] = shop[r.vendor] || {}); const s = (v[r.desc] = v[r.desc] || [0, r.unit]); s[0] += q }
      lines.push({ pid, desc: r.desc, qty: fmtQty(q, r.unit), q, price: r.price, unit: r.unit, cost, vendor: r.vendor, source: r.source, status: r.status, status_it: STATUS_IT[r.status] || r.status, ref_price: r.ref_price ?? null, date: r.date || null })
      if (r.warn && !r.confirmed) attention.push({ kind: 'partial', item: label, text: `${r.desc}: ${r.warn}` })
      if (r.confirmed) { /* prezzo confermato dallo Chef: niente da segnalare */ }
      else if (r.status === 'PROVISIONAL' || r.status === 'UNKNOWN')
        attention.push({ kind: r.status.toLowerCase(), item: label, text: `${r.desc}: ` + (r.price == null ? 'prezzo mancante → coperto dal buffer 10%' : `prezzo provvisorio (${r.source})`) })
      else if (r.ref && !r.warn && r.vendor !== '—' && r.status !== 'CHEF STANDARD')
        attention.push({ kind: 'reference', item: label, text: `${r.desc}: prezzo di riferimento (${r.source}), non collegato a una fattura Brigade` })
      if (r.status === 'CHEF TEMP') attention.push({ kind: 'chef_temp', item: label, text: `${r.desc}: prezzo Chef provvisorio (${r.source})` })
      if (r.old) attention.push({ kind: 'old', item: label, text: `${r.desc}: ultima fattura del ${String(r.date).slice(8, 10)}/${String(r.date).slice(5, 7)}, più di 3 mesi fa — confermare o cambiare` })
      if (r.far) attention.push({ kind: 'far', item: label, text: `${r.desc}: prezzo Brigade $${r.price.toFixed(4)}/${r.unit} molto diverso dal riferimento $${r.ref_price.toFixed(4)} — controllare` })
    }
    for (const n of notes) if (n.startsWith('CONF')) attention.push({ kind: 'conf', item: label, text: n.replace('CONF: ', '') })
    total += sub
    items.push({ key, label, qty: qlabel, cost: sub, lines, rules: notes.filter((n) => !n.startsWith('CONF')) })
  }
  const seen = new Set(), att = attention.filter((a) => { const k = a.kind + '|' + a.text; if (seen.has(k)) return false; seen.add(k); return true })
  const buf = total * 0.10, fin = total + buf
  const vendors = Object.keys(shop).sort((a, b) => ((a === 'mix' || a === '—') - (b === 'mix' || b === '—')) || (a < b ? -1 : a > b ? 1 : 0))
  const shopping = vendors.map((v) => ({ vendor: v, items: Object.keys(shop[v]).sort().map((d) => ({ desc: d, qty: fmtQty(shop[v][d][0], shop[v][d][1]) })) }))
  const real = att.filter((a) => a.kind !== 'reference' && a.kind !== 'chef_temp')
  return { event: ev.event || '', date: ev.date || '', guests: N, revenue: R, items, analytic: total, buffer: buf, final: fin,
    analytic_up: up(total), buffer_up: up(buf), final_up: up(fin), per_person: fin / N, per_person_up: up(fin / N),
    pct: R ? fin / R * 100 : null, approved: ev.approved_total ?? null, shopping, attention: att,
    status: real.length ? `Da verificare ${real.length} ${real.length === 1 ? 'cosa' : 'cose'}` : 'Pronto' }
}

/* ---------------- RICONOSCIMENTO MENU TRIPLESEAT (= event_plan.py) ---------------- */
const Pr = (match, kind, items, label, why = null, ref = null) => ({ re: new RegExp(match), kind, items, label, why, ref })
export const PROFILES = [
  Pr('bruschetta.*mushroom|mushroom.*bruschetta', 'NO_PROFILE', [['bruschetta', {}]], 'Bruschetta pomodoro o funghi', 'Calcolata al pomodoro (Q15); versione ai funghi senza profilo: quale sceglie il cliente?'),
  Pr('bruschetta', 'RECOGNIZED', [['bruschetta', {}]], 'Bruschetta', null, 'Q15'),
  Pr('caprese.*skewer', 'RECOGNIZED', [['caprese_skewer', {}]], 'Caprese skewer', null, 'Q03'),
  Pr('caprese', 'RECOGNIZED', [['caprese', {}]], 'Caprese', null, 'Q02'),
  Pr('cantal|melon(?!.*water)', 'RECOGNIZED', [['melon_parma', {}]], 'Cantaloupe/Parma', null, 'Q26'),
  Pr('watermelon', 'RECOGNIZED', [['watermelon_tomato', {}]], 'Watermelon & tomato', null, 'Q17'),
  Pr('taralli', 'RECOGNIZED', [['taralli_salame', {}]], 'Taralli & salame', null, 'Q01'),
  Pr('cheese (balls|and grape)|grape', 'RECOGNIZED', [['ricotta_grape_balls', {}]], 'Cheese & grape balls', null, 'Q16'),
  Pr('mix of fruit|fruit tray|fruits?\\b', 'RECOGNIZED', [['fruit_tray', {}]], 'Fruit tray', null, 'Q18'),
  Pr('cacio e pepe.*(shrimp|gamber)', 'NO_PROFILE', [['penne_cacio_pepe', {}]], 'Penne cacio e pepe + gamberi', 'Penne cacio e pepe calcolata (Q09); gamberi: nessun profilo né prezzo'),
  Pr('cacio e pepe.*chicken', 'RECOGNIZED', [['penne_cacio_pepe', {}], ['chicken', {}]], 'Penne cacio e pepe + pollo', null, 'Q09+Q05'),
  Pr('cacio e pepe', 'RECOGNIZED', [['penne_cacio_pepe', {}]], 'Penne cacio e pepe', null, 'Q09'),
  Pr('meatballs? in marinara', 'NO_PROFILE', [], 'Meatballs in marinara (main)', 'Profilo solo per meatball finger da 25 g (Q04), non come secondo'),
  Pr('marinara|arrabbiata', 'RECOGNIZED', [['penne_arrabbiata', {}]], 'Penne marinara', null, 'Q10'),
  Pr('house salad|salad bar', 'RECOGNIZED', [['house_salad_caesar', {}]], 'House salad', null, 'Q14'),
  Pr('nets? of parmigiano|parmesan nest', 'NO_PROFILE', [['caesar', {}]], 'Caesar in nidi di parmigiano', 'Caesar calcolata (Q13); nidi di parmigiano: nessun profilo'),
  Pr('caesar', 'RECOGNIZED', [['caesar', {}]], 'Caesar salad', null, 'Q13'),
  Pr('mini tiramis|tiramisu shot', 'RECOGNIZED', [['mini_tiramisu', {}]], 'Mini tiramisù', null, 'S09/Q22'),
  Pr('pannacotta|panna cotta', 'RECOGNIZED', [['mini_pannacotta', {}]], 'Mini panna cotta ai frutti di bosco', null, 'S08/Q21'),
  Pr('cremino', 'RECOGNIZED', [['cremino', {}]], 'Cremino', null, 'Q25'),
  Pr('birthday.*cake|\\bcake\\b(?!.*cheese)', 'RECOGNIZED', [['cake', { qty: 1 }]], 'Torta', null, 'C02'),
  Pr('meat ?balls?.*skewer|metballs.*skewer', 'RECOGNIZED', [['meatballs', { skewer: true }]], 'Meatball skewer', null, 'Q04'),
  Pr('meat ?balls?|metballs', 'RECOGNIZED', [['meatballs', { skewer: false }]], 'Meatballs', null, 'Q04'),
  Pr('focaccia', 'RECOGNIZED', [['focaccia', {}]], 'Focaccia', null, 'Q19'),
  Pr('ny strip|strip|tagliata', 'RECOGNIZED', [['ny_strip', {}]], 'NY strip', null, 'S07/C01/Q27'),
  Pr('potato', 'RECOGNIZED', [['potatoes', {}]], 'Patate al forno', null, 'Q07'),
  Pr('asparag', 'RECOGNIZED', [['asparagus', {}]], 'Asparagi', null, 'Q08'),
  Pr('piccata', 'RECOGNIZED', [['chicken_piccata', {}]], 'Chicken piccata', null, 'Q06'),
  Pr('lemon.*cap', 'RECOGNIZED', [['chicken_piccata', {}]], 'Chicken piccata (lemon & capers)', 'Abbinamento documentato: nel menu standard Zeno\'s la voce è «Chicken Piccata Lemon and Capers»', 'Q06'),
  Pr('risotto', 'NO_PROFILE', [['risotto', {}]], 'Risotto nella forma', 'Risotto calcolato (Q12); aggiunte a scelta (funghi/gamberi/pollo/polpette): quali e quante da confermare'),
  Pr('charcuterie', 'ASK', [], 'Charcuterie', 'Non standard (C08): quantità e costo dallo chef'),
  Pr('lasagn', 'RECOGNIZED', [['lasagna', {}]], 'Beef lasagna', null, 'Chef 29/10: 18 a teglia'),
  Pr('parmigiana|chicken parmesan|chicken parm', 'NO_PROFILE', [], 'Chicken parmigiana', 'Mancano i grammi di pollo crudo a persona in catering (domanda allo Chef)'),
  Pr('salmon', 'NO_PROFILE', [], 'Salmone al forno', 'Nessun profilo catering (Q23 vale solo per salmon cake)'),
  Pr('calamari', 'NO_PROFILE', [], 'Calamari fritti', 'Nessun profilo catering'),
  Pr('scaloppin', 'NO_PROFILE', [], 'Scaloppina ai funghi', 'Nessun profilo catering'),
  Pr('cheesecake', 'NO_PROFILE', [], 'Italian cheesecake', 'Nessun profilo catering'),
  Pr('veg|brussel', 'NO_PROFILE', [], 'Verdure al forno', 'Nessun profilo catering'),
  Pr('nina|eggplant', 'NO_PROFILE', [], 'Penne Nina (melanzane)', 'Nessun profilo catering'),
  Pr('ravioli', 'NO_PROFILE', [], 'Ravioli di filetto', 'Nessun profilo catering'),
  Pr('coccoli', 'NO_PROFILE', [], 'Coccoli con Parma', 'Nessun profilo catering'),
  Pr('vodka', 'NO_PROFILE', [], 'Fettuccine alla vodka + pollo', 'Nessun profilo catering'),
  Pr('toscany|tuscany road', 'ASK', [], '«Toscany road trip» family style', 'Composizione non scritta nel BEO'),
  Pr('cannoli', 'ASK', [], 'Cannoli', 'Nessun profilo: acquistati o fatti in casa?'),
]
const NOT_FOOD = /^(water|beverage|open tab)|iced tea|alcol|bottle of|beers?:|cocktail|dring/
const TEMPLATE = /\bpick \d|to be chos|to be choose|as choose|choose from below/
const HEADER = /:\s*$/
const PACKAGE = /menu|regular|dinner|lunch|rehearsal|rehersal|option|full|wedding|fingher|finger|standard/

function splitLong(text) {
  const low = text.toLowerCase(), starts = new Set()
  for (const pr of PROFILES) { const re = new RegExp(pr.re.source, 'g'); let m; while ((m = re.exec(low))) { starts.add(m.index); if (m[0] === '') re.lastIndex++ } }
  const keep = []; for (const s of [...starts].sort((a, b) => a - b)) if (!keep.length || s - keep[keep.length - 1] > 8) keep.push(s)
  if (keep.length < 3) return [text]
  const ends = [...keep.slice(1), text.length]
  return keep.map((a, i) => text.slice(a, ends[i]).replace(/^[ ,;]+|[ ,;]+$/g, '')).map((p) => p.split(/\s+(?:water|iced tea)\b/i)[0].trim()).filter((p) => p && !NOT_FOOD.test(p.toLowerCase()))
}
function splitLine(text) {
  const t = text.trim(), m = t.match(/^\s*tuscan board\s*(with|:)\s*(.*)$/i)
  if (m) return [m[2].split(/,| and /).map((p) => p.trim()).filter(Boolean), 'Tuscan board']
  if (t.length > 90) return [splitLong(t), 'Riga unica con più piatti']
  return [[t], null]
}
export function matchLine(text) {
  const [parts, group] = splitLine(text)
  return { line: text, group, parts: parts.map((p) => {
    const low = p.toLowerCase()
    if (/to be chos/.test(low)) return { text: p, kind: 'ASK', label: p.trim()[0].toUpperCase() + p.trim().slice(1).toLowerCase(), items: [], why: 'Scelta non ancora fatta in Tripleseat', ref: null }
    const pr = PROFILES.find((x) => x.re.test(low))
    return pr ? { text: p, kind: pr.kind, label: pr.label, items: pr.items, why: pr.why, ref: pr.ref } : { text: p, kind: 'ASK', label: p, items: [], why: 'Voce non riconosciuta', ref: null }
  }) }
}

/* Bozza dell'evento dalle righe del menu Tripleseat già in Brigade (event_document_versions, solo righe cucina).
   sels: [{ name, qty, price? }] · S03: persone = menu fatturati (riga pacchetto con quantità) se diversi dagli ospiti */
export function draftFromLines(sels, guestCount) {
  const pkg = sels.find((s) => s.qty && PACKAGE.test(String(s.name || '').toLowerCase()) && (s.price || /^(regular|standard|menu|dinner|lunch)/i.test(String(s.name || '').trim()))) || null
  const lines = []; let template = false
  for (const s of sels) {
    const name = String(s.name || '').trim(), low = name.toLowerCase()
    if (!name || HEADER.test(name) || (name.length < 90 && NOT_FOOD.test(low))) continue
    if (/\bpick \d|choose from below|as choose/.test(low) || (s !== pkg && /to be choose\b/.test(low) && s.qty)) { template = true; continue }
    if (!s.qty && /^(light )?rehe?a?rs/.test(low)) continue
    if (s === pkg && name.length < 90 && !/fingh?er|d'ovres/.test(low)) continue
    if (/full menu for bride/.test(low)) continue
    lines.push(name)
  }
  const billed = pkg && pkg.qty > 1 ? parseInt(pkg.qty, 10) : null
  if (!lines.length || lines.every((l) => TEMPLATE.test(l.toLowerCase()))) { template = true }
  return { guests: billed || guestCount || null, guests_field: guestCount ?? null, billed, menu: template ? [] : lines, template, all_lines: lines }
}

// righe riconosciute → voci del preventivo (RECOGNIZED e NO_PROFILE con parti costate)
export function itemsFromMenu(menu) {
  const lines = menu.map(matchLine), items = []
  for (const l of lines) for (const p of l.parts) if (p.kind === 'RECOGNIZED' || p.kind === 'NO_PROFILE') for (const [key, opt] of p.items) items.push({ item: key, ...opt })
  return { lines, items }
}

/* ---------------- PREZZI: unità «naturale» per scriverli a mano (Chef) ---------------- */
// prezzo del listino è per g / ml / lb / pezzo…; lo Chef scrive $/kg, $/L, $/lb o $ a pezzo/confezione
export const NATURAL = { g: ['kg', 1000], ml: ['L', 1000], lb: ['lb', 1], pz: ['pezzo', 1], conf: ['confezione', 1], filone: ['filone', 1], lotto: ['lotto', 1], pers: ['persona', 1], fisso: ['quota', 1] }
export const toNatural = (unit, price) => price == null ? null : price * (NATURAL[unit] || ['', 1])[1]
export const fromNatural = (unit, price) => price / (NATURAL[unit] || ['', 1])[1]
// data scritta nella fonte del riferimento («26/08», «foto 27/03») → 2026-08-26
const refDate = (src) => { const m = String(src || '').match(/\b(\d{1,2})\/(\d{2})\b/); return m ? `2026-${m[2]}-${m[1].padStart(2, '0')}` : null }
const OLD_DAYS = 90
// elenco prezzi per lo Chef: perché va guardato (reason) detto in chiaro, e cosa può fare (Confermo / Cambia)
export const priceList = (live = {}, today = new Date().toISOString().slice(0, 10)) => Object.entries(P).map(([pid, [d, u, price, vend, src, st]]) => {
  const L = live[pid] || {}, cur = L.price != null
  const status = cur ? (L.status || 'BRIGADE') : (L.confirmed && price != null ? 'CONFIRMED' : st)
  const date = cur ? (L.date || null) : refDate(src)
  const age = date ? Math.round((Date.parse(today) - Date.parse(date)) / 86400000) : null
  let reason = null
  if (status === 'CHEF TEMP') reason = null
  else if (!cur && price == null) reason = 'missing'
  else if (L.confirmed) reason = null
  else if (L.warn) reason = 'partial'
  else if (cur && status === 'BRIGADE' && age != null && age > OLD_DAYS) reason = 'old'
  else if (!cur && st === 'PROVISIONAL') reason = 'provisional'
  else if (!cur && vend !== '—' && st !== 'CHEF STANDARD') reason = 'reference'
  return { pid, desc: d, unit: u, nat: (NATURAL[u] || [u])[0], price: toNatural(u, cur ? L.price : price), status, status_it: STATUS_IT[status] || status,
    source: cur ? L.source : src, ref: toNatural(u, price), vendor: cur ? (L.vendor || vend) : vend, date, age, reason, check: reason != null,
    warn: L.warn || null, missing: L.missing || null, confirmed: L.confirmed || null, chef: status === 'CHEF TEMP' ? L.source : null, prep: vend === 'mix' }
})
