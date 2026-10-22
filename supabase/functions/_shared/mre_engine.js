// MRE — Master Recipe Engine (B-49). ONE engine for: free scaling, unit conversion, kitchen rounding,
// sub-recipes, food cost, production consumption and sale consumption.
// Pure functions, no I/O: the server (Deno, brigade-app-api) and the app (browser) load THIS SAME FILE.
// Single source: supabase/functions/_shared/mre_engine.js — the Pages build copies it into web/.
//
// A recipe document ("doc") is one lot with one yield:
//   { schema:1, title, category, yield:{ g, portions, label }, has_stock, lines:[...], steps:[{it,en,es}], notes }
//   R1.17 (Chef 21/10 "STANDARD DI RESA"), all optional, absent = exactly as before:
//     yield.portion_g    standard weight of ONE portion (e.g. 80 g cooked spinach per cup) — the portioning standard
//     yield.portions     EXPECTED yield of one lot (e.g. 15 cups): what the cost and the plan use; a real lot may give 14 or 16
//     yield.portion_unit what a portion is called when a parent recipe counts it (e.g. 'cup': "1 cup" of Spinach Cup = 1 portion, not a volume)
//     yield.g            weight of the whole lot ONLY when it is its own standard (sauces in kg). With portion_g it is derived, never typed twice.
//     yield.label        descriptive text only: NEVER read for a number (kept as history)
//     line.per = 'portion'  the quantity is per portion (1 container per cup): the lot uses qty × expected portions
//     step { src, it, en, es, tr:{ en|it|es: 'auto'|'chef'|'stale'|'check' }, h }  src = language the Chef actually wrote in;
//       numbers are tokens {{lineId}} / {{y:portion_g}} / {{y:portions}}, so the three languages always show the same structured value
//   line: { id, kind:'ingredient'|'recipe', ref:<uuid>, qty, unit, role:'produzione'|'al_piatto'|'imballo', note, group }
// Ingredient facts (read live from Brigade, never copied): { name, piece_g:{v}, density:{v}, policy, price:{basis_dim,cost_per_base,cost_per_each,cost_per_ml} }
// Nothing here ever invents a number: when a conversion, a price or a yield is missing the result says so (status), value null.

const MASS = { g: 1, kg: 1000, mg: 0.001, oz: 28.3495, lb: 453.592 };
const VOL = { ml: 1, cl: 10, dl: 100, l: 1000, tsp: 4.92892, tbsp: 14.7868, cup: 236.588, fl_oz: 29.5735, pt: 473.176, qt: 946.353, gal: 3785.41 };
const COUNT = { pz: 'pz', nest: 'nest', portion: 'portion', case: 'case' };
const SYN = {
  gr: 'g', grs: 'g', gram: 'g', grams: 'g', grammi: 'g', grammo: 'g', kgs: 'kg', kilo: 'kg', lbs: 'lb', '#': 'lb', pound: 'lb', pounds: 'lb',
  ounce: 'oz', ounces: 'oz', 'fl oz': 'fl_oz', floz: 'fl_oz', 'fl.oz': 'fl_oz', lt: 'l', ltr: 'l', liter: 'l', litre: 'l', litri: 'l', litro: 'l', L: 'l',
  gallon: 'gal', gallone: 'gal', galloni: 'gal', quart: 'qt', pint: 'pt', cups: 'cup',
  pezzi: 'pz', pezzo: 'pz', pc: 'pz', pcs: 'pz', each: 'pz', ea: 'pz', n: 'pz', piece: 'pz', pieces: 'pz', pieza: 'pz', piezas: 'pz', unit: 'pz', units: 'pz',
  nests: 'nest', nidi: 'nest', nido: 'nest', porzioni: 'portion', porzione: 'portion', portions: 'portion', porciones: 'portion', 'porz.': 'portion', porz: 'portion', 'porc.': 'portion', porción: 'portion',
  cs: 'case', fogli: 'foglio', sheet: 'foglio', sheets: 'foglio', pizzichi: 'pizzico',
};
// MR-05 (Chef Max 22/10 «unità libere»): the units as the Chef says them (it/es/en), always SAVED in the standard form that bots
// and FC05 read (food_cost.unit_info). Only these words are rewritten: every other unit on an existing line stays as it is.
export const UNIT_WORDS = {
  once: 'oz', oncia: 'oz', onza: 'oz', onzas: 'oz', libbra: 'lb', libbre: 'lb', libra: 'lb', libras: 'lb',
  chilo: 'kg', chili: 'kg', chilogrammo: 'kg', chilogrammi: 'kg', kilos: 'kg', kilogrammi: 'kg',
  cucchiaio: 'tbsp', cucchiai: 'tbsp', cucharada: 'tbsp', cucharadas: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp',
  cucchiaino: 'tsp', cucchiaini: 'tsp', cucharadita: 'tsp', cucharaditas: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp',
  tazza: 'cup', tazze: 'cup', taza: 'cup', tazas: 'cup',
  'oncia fluida': 'fl_oz', 'once fluide': 'fl_oz', 'onza líquida': 'fl_oz', 'onzas líquidas': 'fl_oz', 'fl. oz': 'fl_oz', 'fl oz.': 'fl_oz',
  millilitri: 'ml', millilitro: 'ml', mililitros: 'ml', litros: 'l', gramos: 'g', kilogramos: 'kg',
};
Object.assign(SYN, UNIT_WORDS);
/** The unit to SAVE on a line: a spoken word becomes its standard form; on a liquid («liquido» approved by the Chef) an ounce is a
 *  fluid ounce. Weight ↔ volume is never converted here: that needs a known density, and the engine says when it is missing. */
export function standardUnit(u, facts) {
  if (u == null) return u;
  const s = String(u).trim(), w = UNIT_WORDS[s.toLowerCase()];
  let out = w || s;
  if (facts && facts.liquid && normUnit(out) === 'oz') out = 'fl_oz';
  return out;
}
/** How a saved unit is written on screen (fl_oz → «fl oz»). */
export const unitLabel = u => u === 'fl_oz' ? 'fl oz' : u;
/* ---------------- R1.17: derived values (one number, one place) ---------------- */
const RES = new WeakMap(), DONE = new WeakSet();
/** The document as the engine reads it: per-portion lines become lot quantities (qty × expected portions) and, with a standard
 *  portion weight, the expected lot weight = portions × portion_g. Documents without these fields come back UNCHANGED (same object). */
export function resolveDoc(doc) {
  if (!doc || typeof doc !== 'object' || DONE.has(doc)) return doc;                 // already resolved: never multiplied twice
  const y = doc.yield || {}, pg = Number(y.portion_g), P = Number(y.portions);
  const per = (doc.lines || []).some(l => l.per === 'portion');
  if (!per && !(pg > 0)) return doc;
  // the editor changes its working copy in place: the memo is valid only while the numbers it depends on are the same
  const sig = JSON.stringify([y, (doc.lines || []).map(l => [l.id, l.qty, l.per, l.unit, l.ref, l.role, l.kind])]);
  const hit = RES.get(doc); if (hit && hit.sig === sig) return hit.out;
  const ny = Object.assign({}, y);
  if (pg > 0 && P > 0 && !(Number(y.g) > 0)) { ny.g = pg * P; ny.g_derived = true; }
  const lines = (doc.lines || []).map(l => l.per === 'portion' ? Object.assign({}, l, { per_qty: l.qty, qty: l.qty == null || !(P > 0) ? null : Number(l.qty) * P }) : l);
  const out = Object.assign({}, doc, { yield: ny, lines });
  DONE.add(out); RES.set(doc, { sig, out }); return out;
}
const D = (ctx, id) => resolveDoc(ctx.doc(id));

/** Canonical unit key, or null when unknown / "to be defined". */
export function normUnit(u) {
  if (u == null) return null;
  let s = String(u).trim();
  if (!s || /^da definire$/i.test(s)) return null;
  if (SYN[s]) return SYN[s];
  s = s.toLowerCase();
  if (SYN[s]) s = SYN[s];
  return s;
}
export function dimOf(u) {
  const k = normUnit(u);
  if (k == null) return null;
  if (k in MASS) return 'm';
  if (k in VOL) return 'v';
  if (k in COUNT) return 'c';
  return 'k';                                           // kitchen measure (pinch, foglio, spicchi…): grams from the kitchen table, as an estimate
}

/** Amount of an ingredient line in base units. Returns { dim, val, g, status }.
 *  dim m → val in g; v → val in ml; c → val in pieces. g = grams when derivable (density / piece weight / kitchen measure). */
export function ingredientAmount(qty, unit, facts, measures) {
  const k = normUnit(unit), q = Number(qty);
  if (k == null) return { dim: null, val: null, g: null, status: 'da_definire' };
  if (!isFinite(q)) return { dim: null, val: null, g: null, status: 'quantita_mancante' };
  const d = facts && facts.density && Number(facts.density.v) > 0 ? Number(facts.density.v) : null;
  const pg = facts && facts.piece_g && Number(facts.piece_g.v) > 0 ? Number(facts.piece_g.v) : null;
  if (k in MASS) { const g = q * MASS[k]; return { dim: 'm', val: g, g, ml: d ? g / d : null, status: 'ok' }; }
  if (k in VOL) { const ml = q * VOL[k]; return { dim: 'v', val: ml, ml, g: d ? ml * d : null, status: d ? 'ok' : 'densita_mancante' }; }
  // R1.14 (Chef 21/10): a count is a complete amount (22 cups = 22 cups). Grams only when a piece weight is known; whether the
  // weight is NEEDED is decided where it is needed (the cost, when the price is per gram) — never asked for nothing.
  if (k in COUNT) return { dim: 'c', val: q, count: q, ckey: COUNT[k], g: pg && COUNT[k] === 'pz' ? q * pg : null, status: 'ok' };
  const m = measures && Number(measures[k]) > 0 ? Number(measures[k]) : null;
  if (m) return { dim: 'm', val: q * m, g: q * m, status: 'stima' };
  return { dim: null, val: null, g: null, status: 'unita_sconosciuta' };
}

/** Which part of a sub-recipe lot a line uses (0..n). null + status when it cannot be known. */
export function subFraction(qty, unit, sub) {
  sub = resolveDoc(sub);
  const k = normUnit(unit), q = Number(qty), y = (sub && sub.yield) || {};
  if (k == null || !isFinite(q)) return { f: null, status: 'quantita_mancante' };
  if (k in MASS) return Number(y.g) > 0 ? { f: q * MASS[k] / Number(y.g), status: 'ok' } : { f: null, status: 'resa_mancante' };
  if (y.portion_unit && Number(y.portions) > 0 && normUnit(y.portion_unit) === k) return { f: q / Number(y.portions), status: 'ok' };   // R1.17 CD-071
  if (k in COUNT || k === 'cup') {
    if (k === 'cup') return { f: null, status: 'unita_sospetta' };
    if (Number(y.count) > 0 && normUnit(y.count_unit) === k) return { f: q / Number(y.count), status: 'ok' };   // e.g. 50 nests per lot
    // R1.14 (Chef 21/10): portions are counted against portions only. Pieces / nests / cases of a sub-recipe need the lot's
    // count in that same unit — a case is never read as a portion.
    if (k === 'portion' && Number(y.portions) > 0) return { f: q / Number(y.portions), status: 'ok' };
    // "1 pz" of a prep whose yield is only in portions (e.g. Thaw Salmon, Meatballs): read as 1 portion as before, but marked
    // 'pezzo_come_porzione' so that it shows as a point to confirm in the recipe, never silently
    if (k === 'pz' && Number(y.portions) > 0) return { f: q / Number(y.portions), status: 'pezzo_come_porzione' };
    return { f: null, status: 'resa_mancante' };
  }
  if (k in VOL) return { f: null, status: 'densita_mancante' };
  return { f: null, status: 'unita_sconosciuta' };
}

/* ---------------- free scaling ---------------- */
/** Factor that makes the line read newQty newUnit. Any compatible unit (5 uova, 12 oz, 0,35 kg). */
export function factorFromLine(doc, lineId, newQty, newUnit, ctx) {
  doc = resolveDoc(doc);
  const ln = (doc.lines || []).find(l => l.id === lineId);
  if (!ln || !(Number(newQty) > 0)) return null;
  if (ln.kind === 'recipe') {
    const sub = D(ctx, ln.ref);
    const a = subFraction(ln.qty, ln.unit, sub), b = subFraction(newQty, newUnit || ln.unit, sub);
    if (a.f > 0 && b.f > 0) return b.f / a.f;
    const ka = normUnit(ln.unit), kb = normUnit(newUnit || ln.unit);
    return ka === kb && Number(ln.qty) > 0 ? Number(newQty) / Number(ln.qty) : null;
  }
  const f = ctx.facts(ln.ref), a = ingredientAmount(ln.qty, ln.unit, f, ctx.measures), b = ingredientAmount(newQty, newUnit || ln.unit, f, ctx.measures);
  if (a.dim && a.dim === b.dim && a.val > 0) return b.val / a.val;
  if (a.g > 0 && b.g > 0) return b.g / a.g;
  return null;
}
export const factorFromPortions = (doc, p) => Number(doc.yield && doc.yield.portions) > 0 && Number(p) > 0 ? Number(p) / Number(doc.yield.portions) : null;
export const factorFromBatches = b => Number(b) > 0 ? Number(b) : null;
export function factorFromYield(doc, qty, unit) {
  doc = resolveDoc(doc);
  const k = normUnit(unit), q = Number(qty);
  if (!(q > 0) || !(Number(doc.yield && doc.yield.g) > 0) || !(k in MASS)) return null;
  return q * MASS[k] / Number(doc.yield.g);
}

/* ---------------- kitchen display ---------------- */
const nf = (x, d, loc) => Number(x).toLocaleString(loc || 'it-IT', { maximumFractionDigits: d, useGrouping: false });
/** Weight for reading: g under 1 kg, kg above; ounces/pounds on request. */
export function showMass(g, pref, loc) {
  if (g == null || !isFinite(g)) return null;
  if (pref === 'imperial') { const oz = g / MASS.oz; return oz >= 16 ? { n: nf(oz / 16, 2, loc), u: 'lb' } : { n: nf(oz, oz < 10 ? 1 : 0, loc), u: 'oz' }; }
  if (g >= 1000) return { n: nf(g / 1000, 2, loc), u: 'kg' };
  return { n: nf(g, g < 10 ? 1 : 0, loc), u: 'g' };
}
export function showVol(ml, pref, loc) {
  if (ml == null || !isFinite(ml)) return null;
  if (pref === 'imperial') { const fo = ml / VOL.fl_oz; return fo >= 128 ? { n: nf(fo / 128, 2, loc), u: 'gal' } : { n: nf(fo, 1, loc), u: 'fl oz' }; }
  if (ml >= 1000) return { n: nf(ml / 1000, 2, loc), u: 'l' };
  return { n: nf(ml, ml < 10 ? 1 : 0, loc), u: 'ml' };
}
const COUNT_LABEL = { pz: 'pz', nest: 'nidi', portion: 'porz.', case: 'case' };
/** What the cook reads for one line at a factor: { n, u, theo } — theo = exact value when a whole number was rounded. */
export function showLine(ln, factor, ctx, pref, loc) {
  const q = Number(ln.qty) * factor, k = normUnit(ln.unit);
  if (k == null || !isFinite(q)) return { n: '—', u: ln.unit || '', status: 'da_definire' };
  if (k in MASS) return Object.assign(showMass(q * MASS[k], pref, loc), { status: 'ok' });
  if (k in VOL) return Object.assign(showVol(q * VOL[k], pref, loc), { status: 'ok' });
  if (k in COUNT) {
    const r = q >= 1 ? Math.round(q) : Math.round(q * 4) / 4;   // whole pieces; under one piece, quarters
    return { n: nf(r, 2, loc), u: COUNT_LABEL[COUNT[k]] || k, theo: Math.abs(r - q) > 0.04 ? nf(q, 1, loc) : null, status: 'ok' };
  }
  const fixed = ['pinch', 'pizzico', 'drops', 'q.b.', 'qb'].includes(k);   // a pinch stays a pinch
  return { n: nf(fixed ? Number(ln.qty) : q, 2, loc), u: ln.unit, status: fixed ? 'non_scalato' : 'ok' };
}
/** Number inside a step: same unit the Chef wrote, only the number changes. */
export function stepNumber(ln, factor, loc) {
  const q = Number(ln.qty) * factor, k = normUnit(ln.unit);
  if (!isFinite(q)) return '—';
  if (k in COUNT) return nf(q >= 1 ? Math.round(q) : Math.round(q * 4) / 4, 2, loc);
  return nf(q, q < 10 ? 1 : 0, loc);
}
/** Step text with tokens {{lineId}} resolved for a factor. Returns [{t:'txt'|'q', v, id}] so the screen keeps number+unit together. */
export function stepParts(text, doc, factor, loc) {
  doc = resolveDoc(doc);
  const out = [], re = /\{\{([A-Za-z0-9_:-]+)\}\}/g; let m, last = 0;
  const s = String(text || '');
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ t: 'txt', v: s.slice(last, m.index) });
    const y = (doc && doc.yield) || {};
    if (m[1] === 'y:portion_g') out.push(Number(y.portion_g) > 0 ? { t: 'q', v: nf(y.portion_g, 1, loc), id: m[1], fixed: true } : { t: 'txt', v: '?' });   // a portion stays a portion when the lot scales
    else if (m[1] === 'y:portions') out.push(Number(y.portions) > 0 ? { t: 'q', v: nf(Number(y.portions) * factor, 1, loc), id: m[1] } : { t: 'txt', v: '?' });
    else { const ln = (doc.lines || []).find(l => l.id === m[1]);
      out.push(ln ? { t: 'q', v: stepNumber(ln, factor, loc), id: ln.id } : { t: 'txt', v: '?' }); }
    last = re.lastIndex;
  }
  if (last < s.length) out.push({ t: 'txt', v: s.slice(last) });
  return out;
}

/* ---------------- explosion: cost, production, sale ---------------- */
/** Walk a recipe for a purpose. Leaves:
 *   { kind:'ingredient', ref, g, ml, count, dim, role, path, status }   or   { kind:'prep', ref (recipe id), fraction, g, portions, path }
 *  purpose 'costo'      → every line down to ingredients (sub-recipes always opened, divided by their yield)
 *  purpose 'produzione' → making `factor` lots of a recipe WITH stock: its 'produzione' + 'imballo' lines; stocked sub-recipes stop as prep consumption
 *  purpose 'vendita'    → selling `factor` lots of a dish: stocked sub-recipes stop as prep consumption (never their ingredients again);
 *                         if the dish itself has stock, the dish prep is consumed and only its 'al_piatto' lines are added. */
export function explode(rootId, factor, purpose, ctx) {
  const out = [];
  const root = D(ctx, rootId);
  if (!root) return [{ kind: 'error', ref: rootId, status: 'ricetta_mancante' }];
  if (purpose === 'vendita' && root.has_stock) {
    out.push({ kind: 'prep', ref: rootId, fraction: factor, g: Number(root.yield && root.yield.g) > 0 ? factor * root.yield.g : null, portions: Number(root.yield && root.yield.portions) > 0 ? factor * root.yield.portions : null, path: [rootId], status: 'ok' });
    walk(root, rootId, factor, [rootId], l => l.role === 'al_piatto', out, 'vendita', ctx);
    return out;
  }
  const keep = purpose === 'produzione' ? (l => l.role !== 'al_piatto') : (() => true);
  walk(root, rootId, factor, [rootId], keep, out, purpose, ctx);
  return out;
}
function walk(doc, id, factor, path, keep, out, purpose, ctx) {
  for (const ln of doc.lines || []) {
    if (!keep(ln)) continue;
    const p = path.concat(ln.id);
    if (ln.kind === 'ingredient') {
      const a = ingredientAmount(Number(ln.qty) * factor, ln.unit, ctx.facts(ln.ref), ctx.measures);
      out.push({ kind: 'ingredient', ref: ln.ref, line: ln.id, from: id, role: ln.role, dim: a.dim, g: a.g, ml: a.ml != null ? a.ml : (a.dim === 'v' ? a.val : null), count: a.dim === 'c' ? a.val : null, ckey: a.ckey, status: a.status, path: p, ...(ln.est ? { est: ln.est } : {}) });
      continue;
    }
    if (path.includes(ln.ref)) { out.push({ kind: 'error', ref: ln.ref, line: ln.id, from: id, status: 'ciclo', path: p }); continue; }
    const sub = D(ctx, ln.ref);
    if (!sub) { out.push({ kind: 'error', ref: ln.ref, line: ln.id, from: id, status: 'sotto_ricetta_mancante', path: p }); continue; }
    if (!(sub.lines || []).length) { out.push({ kind: 'error', ref: ln.ref, line: ln.id, from: id, status: 'sotto_ricetta_vuota', path: p }); continue; }
    const fr = subFraction(Number(ln.qty) * factor, ln.unit, sub);
    if (fr.f == null) { out.push({ kind: 'error', ref: ln.ref, line: ln.id, from: id, status: fr.status, path: p }); continue; }
    if (purpose !== 'costo' && sub.has_stock) {
      out.push({ kind: 'prep', ref: ln.ref, line: ln.id, from: id, fraction: fr.f, g: Number(sub.yield.g) > 0 ? fr.f * sub.yield.g : null, portions: Number(sub.yield.portions) > 0 ? fr.f * sub.yield.portions : null, status: 'ok', path: p });
      continue;
    }
    walk(sub, ln.ref, fr.f, p.concat(ln.ref), () => true, out, purpose, ctx);
  }
}

/** Price of one ingredient leaf with the FC05 price row. null + status when not computable. */
export function leafCost(leaf, facts) {
  if (!facts) return { cost: null, status: 'ingrediente_mancante' };
  if (facts.policy === 'non_food') return { cost: null, status: 'escluso_non_alimentare' };
  if (facts.policy === 'zero_cost') return { cost: 0, status: 'ok' };
  const p = facts.price;
  if (!p) return { cost: null, status: 'prezzo_mancante' };
  const N = v => v == null || v === '' || !isFinite(Number(v)) ? null : Number(v);   // a missing price is missing, never 0
  const perG = p.basis_dim === 'mass' ? N(p.cost_per_base) : null;
  const perMl = N(p.cost_per_ml) != null ? N(p.cost_per_ml) : (p.basis_dim === 'volume' ? N(p.cost_per_base) : null);
  const perEach = N(p.cost_per_each) != null ? N(p.cost_per_each) : (p.basis_dim === 'each' || p.basis_dim === 'count' ? N(p.cost_per_base) : null);
  if (leaf.dim === 'c' && perEach != null && isFinite(perEach)) return { cost: leaf.count * perEach, status: 'ok' };
  if (leaf.dim === 'v' && perMl != null && isFinite(perMl)) return { cost: leaf.ml * perMl, status: 'ok' };
  if (leaf.g != null && perG != null && isFinite(perG)) return { cost: leaf.g * perG, status: leaf.status === 'stima' ? 'stima' : 'ok' };
  if (leaf.ml != null && perMl != null && isFinite(perMl)) return { cost: leaf.ml * perMl, status: 'ok' };
  const pg = facts.piece_g && Number(facts.piece_g.v);
  if (leaf.g != null && perEach != null && pg > 0) return { cost: leaf.g / pg * perEach, status: 'ok' };
  if (leaf.count != null && perG != null && pg > 0) return { cost: leaf.count * pg * perG, status: 'ok' };
  if (leaf.dim === 'c' && perG != null) return { cost: null, status: 'peso_pezzo_mancante' };        // used by the piece, bought by weight
  if (leaf.dim === 'v' && perG != null) return { cost: null, status: 'densita_mancante' };          // used by volume, bought by weight
  return { cost: null, status: leaf.status !== 'ok' ? leaf.status : 'conversione_mancante' };
}

/** R1.19 (Chef 22/10, Wheel Pasta rum): "prezzo di fiducia" — a price the Chef estimates for an ingredient that has NO invoice price
 *  (e.g. bought by the front of house). Stored on the recipe line only: { usd, qty, unit } = usd for qty unit. Used only when the
 *  invoice price is missing, never over a real one, and always marked 'stima_chef' — an indication, not an invoice. */
export function estPrice(est, facts, measures) {
  if (!est || !(Number(est.usd) > 0) || !(Number(est.qty) > 0)) return null;
  const a = ingredientAmount(Number(est.qty), est.unit, facts, measures), usd = Number(est.usd);
  if (a.dim === 'm' && a.status === 'ok') return { basis_dim: 'mass', cost_per_base: usd / a.g, cost_per_ml: a.ml ? usd / a.ml : null };
  if (a.dim === 'v') return { basis_dim: 'volume', cost_per_base: usd / a.ml, cost_per_ml: usd / a.ml };
  if (a.dim === 'c') return { basis_dim: 'each', cost_per_base: usd / a.val, cost_per_each: usd / a.val };
  return null;
}
/** leafCost with the Chef's estimated price when the invoice price is missing. status 'stima_chef' when the estimate was used. */
export function leafCostEst(leaf, facts, measures) {
  const c = leafCost(leaf, facts);
  if (c.cost != null || !leaf.est || !facts || c.status !== 'prezzo_mancante') return c;
  const p = estPrice(leaf.est, facts, measures);
  if (!p) return { cost: null, status: 'stima_non_valida' };
  const e = leafCost(leaf, Object.assign({}, facts, { policy: null, price: p }));
  if (e.cost != null) return { cost: e.cost, status: 'stima_chef' };
  // price per ml with the line in grams (or the reverse) and no verified density: said, never guessed
  if ((leaf.dim === 'm' && p.basis_dim === 'volume') || (leaf.dim === 'v' && p.basis_dim === 'mass')) return { cost: null, status: 'densita_mancante' };
  return e;
}

/** Food cost of one lot × factor. Per top line and total. Missing parts are counted, never treated as zero. */
export function cost(rootId, factor, ctx) {
  const doc = D(ctx, rootId), leaves = explode(rootId, factor, 'costo', ctx);
  const byLine = {}; let food = 0, pack = 0, missing = 0, estimated = 0, packMissing = 0, chefEst = 0;
  for (const lf of leaves) {
    const top = lf.path[1];
    const b = byLine[top] || (byLine[top] = { cost: 0, missing: 0, status: 'ok' });
    if (lf.kind !== 'ingredient') { b.missing++; b.status = lf.status; missing++; continue; }
    const f = ctx.facts(lf.ref), c = leafCostEst(lf, f, ctx.measures);
    const isPack = lf.role === 'imballo' || (f && f.policy === 'non_food');
    if (c.cost == null) { if (!isPack) { b.missing++; b.status = c.status; missing++; } else packMissing++; continue; }
    if (isPack) pack += c.cost; else { food += c.cost; b.cost += c.cost; }
    if (c.status === 'stima') { estimated++; if (b.status === 'ok') b.status = 'stima'; }
    if (c.status === 'stima_chef') { chefEst++; b.status = 'stima_chef'; }
  }
  const portions = doc && Number(doc.yield && doc.yield.portions) > 0 ? doc.yield.portions * factor : null;
  return { food, pack, missing, pack_missing: packMissing, estimated, chef_est: chefEst, complete: missing === 0, state: missing === 0 ? 'completo' : 'parziale', per_portion: portions ? food / portions : null, portions, byLine };
}

/* ---------------- one number for every module (B-49, Chef 20/10) ----------------
 * Sale, production, cancellation and partial lots all come from explode() on ONE version of the recipe.
 * The lot/portion rule lives only here: n portions = n / yield.portions lots. No caller divides on its own. */
/** Lots for a number of portions. null + status when the recipe has no portions. */
export function lotsFromPortions(doc, portions) {
  doc = resolveDoc(doc);
  const p = Number(doc && doc.yield && doc.yield.portions), n = Number(portions);
  if (!(p > 0)) return { lots: null, status: 'porzioni_mancanti' };
  if (!isFinite(n)) return { lots: null, status: 'quantita_mancante' };
  return { lots: n / p, status: 'ok' };
}
const mvRow = (x, sign) => ({ target: x.kind === 'prep' ? 'prep' : x.kind === 'ingredient' ? 'ingrediente' : 'errore', ref: x.ref, line: x.line || null, from: x.from || null, role: x.role || null,
  g: x.g != null ? sign * x.g : null, ml: x.ml != null ? sign * x.ml : null, count: x.count != null ? sign * x.count : null, ckey: x.ckey || null,
  portions: x.portions != null ? sign * x.portions : null, lots: x.kind === 'prep' && x.fraction != null ? sign * x.fraction : null, status: x.status })
/** Inventory movements of one event. ev: { kind:'vendita'|'produzione', recipe, version, portions | lots, ref }.
 *  Consumption is negative; a production also adds the made lot to the recipe's own stock (positive).
 *  The rows are computed once and stored with the version: a later recipe change never alters them. */
export function movements(ev, ctx) {
  const doc = D(ctx, ev.recipe);
  if (!doc) return { event: ev, lots: null, rows: [], errors: ['ricetta_mancante'] };
  let lots = ev.lots != null ? Number(ev.lots) : null, errors = [];
  if (lots == null) { const r = lotsFromPortions(doc, ev.portions); lots = r.lots; if (r.status !== 'ok') errors.push(r.status) }
  if (!(lots > 0)) return { event: ev, lots: null, rows: [], errors: errors.length ? errors : ['quantita_mancante'] };
  const rows = []
  if (ev.kind === 'produzione') {
    if (!doc.has_stock) errors.push('ricetta_senza_scorta');
    rows.push({ target: 'prep', ref: ev.recipe, line: null, from: null, role: 'prodotto', g: Number(doc.yield.g) > 0 ? lots * doc.yield.g : null, ml: null, count: null, ckey: null,
      portions: Number(doc.yield.portions) > 0 ? lots * doc.yield.portions : null, lots, status: 'ok' });
  }
  for (const x of explode(ev.recipe, lots, ev.kind === 'produzione' ? 'produzione' : 'vendita', ctx)) {
    const r = mvRow(x, -1); rows.push(r); if (r.target === 'errore') errors.push(x.status);
  }
  return { event: Object.assign({}, ev), version: ev.version != null ? ev.version : null, engine: MRE_ENGINE_VERSION, lots, rows, errors: [...new Set(errors)] };
}
/** Cancellation: the same stored rows with the opposite sign (never recomputed from today's recipe). */
export function reverseMovements(m, reason) {
  return { event: Object.assign({}, m.event, { kind: 'annullamento', reverses: m.event, reason: reason || null }), version: m.version, engine: m.engine, lots: m.lots,
    rows: m.rows.map(r => Object.assign({}, r, { g: r.g != null ? -r.g : null, ml: r.ml != null ? -r.ml : null, count: r.count != null ? -r.count : null, portions: r.portions != null ? -r.portions : null, lots: r.lots != null ? -r.lots : null })), errors: m.errors };
}
/** Net total per stock item ('prep:<recipe id>' / 'ingrediente:<id>'). */
export function sumMovements(list) {
  const t = {};
  for (const m of list) for (const r of m.rows) {
    if (r.target === 'errore') continue;
    const k = r.target + ':' + r.ref, o = t[k] || (t[k] = { target: r.target, ref: r.ref, g: 0, ml: 0, count: 0, portions: 0, lots: 0 });
    for (const f of ['g', 'ml', 'count', 'portions', 'lots']) if (r[f] != null) o[f] += r[f];
  }
  for (const o of Object.values(t)) for (const f of ['g', 'ml', 'count', 'portions', 'lots']) o[f] = Math.round(o[f] * 1e6) / 1e6;
  return t;
}
/* ---- CD-066 (Chef 20/10): PREP and POS ITEM linked, three separate ledgers ----
 * physical stock (only from counts — never invented) · registered production · theoretical consumption (always). */
/** Theoretical consumption of selling `portions` of a recipe: every sub-recipe opened down to raw ingredients (rule 5),
 *  whether or not anyone registered the production. Same walk as the food cost (rule 4). */
export function theoretical(rootId, portions, ctx, lotsIn, onlyPrep) {
  let lots = lotsIn;
  if (lots == null) { const r = lotsFromPortions(D(ctx, rootId), portions); if (r.lots == null) return { rows: [], errors: [r.status] }; lots = r.lots }
  const rows = [], errors = [], root = D(ctx, rootId), leaves = [];
  // onlyPrep: what MAKING the prep uses (its 'al_piatto' lines are added at service and counted at the sale, never twice)
  if (!root) leaves.push({ kind: 'error', ref: rootId, status: 'ricetta_mancante' });
  else walk(root, rootId, lots, [rootId], onlyPrep ? (l => l.role !== 'al_piatto') : (() => true), leaves, 'costo', ctx);
  for (const x of leaves) { const m = mvRow(x, -1); if (m.target === 'errore') errors.push(x.status); else rows.push(m); }
  return { lots, rows, errors: [...new Set(errors)] };
}
/** A quantity of a prep ({portions} or {g}) as lots of its recipe; null when the recipe cannot say. */
export function prepLots(doc, q) {
  doc = resolveDoc(doc);
  if (!doc || !q) return null;
  if (q.lots != null) return Number(q.lots);
  if (q.portions != null && Number(doc.yield && doc.yield.portions) > 0) return Number(q.portions) / doc.yield.portions;
  if (q.g != null && Number(doc.yield && doc.yield.g) > 0) return Number(q.g) / doc.yield.g;
  return null;
}
/** Period reconciliation (rule 6). sales: [{recipe, portions}], productions: [{recipe, lots, version}],
 *  counts: {<prep recipe id>: {portions|g}} counted at the start (optional — without a count the stock is unknown, never invented).
 *  Raw materials are taken ONCE: from registered productions for what they cover; what was sold without a registered production
 *  is reported as theoretical-only (not a stock movement): moving raw stock for it is a separate Chef decision (B-56 A1/A2). */
export function reconcile({ sales = [], productions = [], counts = {} }, ctx) {
  const saleMv = sales.map(s => movements({ kind: 'vendita', recipe: s.recipe, portions: s.portions, version: s.version }, ctx));
  const prodMv = productions.map(p => movements({ kind: 'produzione', recipe: p.recipe, lots: p.lots, version: p.version }, ctx));
  const preps = {}, y = id => (D(ctx, id) || {}).yield || {};
  const P = id => preps[id] || (preps[id] = { prep: id, sold_lots: 0, produced_lots: 0, start_lots: counts[id] ? prepLots(D(ctx, id), counts[id]) : null });
  for (const m of saleMv) for (const r of m.rows) if (r.target === 'prep' && r.lots != null) P(r.ref).sold_lots += -r.lots;
  for (const m of prodMv) for (const r of m.rows) if (r.target === 'prep' && r.role === 'prodotto') P(r.ref).produced_lots += r.lots;
  const uncoveredMv = [];
  for (const p of Object.values(preps)) {
    const avail = p.produced_lots + (p.start_lots || 0), Y = y(p.prep);
    p.covered_lots = Math.min(p.sold_lots, avail);
    p.uncovered_lots = Math.max(0, p.sold_lots - avail);
    p.stock_known = p.start_lots != null;
    p.end_lots = p.stock_known ? p.start_lots + p.produced_lots - p.sold_lots : null;          // only when counted
    for (const k of ['sold', 'produced', 'covered', 'uncovered', 'start', 'end']) {
      const v = p[k + '_lots'];
      p[k + '_portions'] = v == null || !(Number(Y.portions) > 0) ? null : Math.round(v * Y.portions * 1e6) / 1e6;
      p[k + '_g'] = v == null || !(Number(Y.g) > 0) ? null : Math.round(v * Y.g * 1e6) / 1e6;
    }
    if (p.uncovered_lots > 1e-9) { const t = theoretical(p.prep, null, ctx, p.uncovered_lots, true); uncoveredMv.push({ rows: t.rows }); if (t.errors.length) p.uncovered_errors = t.errors }
  }
  const theo = sales.map(s => theoretical(s.recipe, s.portions, ctx));
  return {
    preps: Object.values(preps),
    registered: sumMovements(prodMv),                      // raw consumed by registered productions (+ preps made)
    at_sale: sumMovements(saleMv),                         // prep used + ingredients added at service
    uncovered_theoretical: sumMovements(uncoveredMv),      // raw for what was sold without a registered production (theoretical only)
    theoretical: sumMovements(theo),                       // full theoretical consumption of the sales (always)
    errors: [...new Set([...saleMv, ...prodMv].flatMap(m => m.errors).concat(theo.flatMap(t => t.errors)))],
  };
}
/** Structure check against CD-066 for one recipe (no judgement on culinary values): copies, mixed prep/POS item, missing links. */
export function modelCheck(rootId, ctx, opt = {}) {
  const doc = D(ctx, rootId), out = [];
  if (!doc) return [{ code: 'ricetta_mancante' }];
  const direct = new Set((doc.lines || []).filter(l => l.kind === 'ingredient').map(l => l.ref));
  for (const l of doc.lines || []) {
    if (l.kind !== 'recipe') continue;
    const inner = new Set(explode(l.ref, 1, 'costo', ctx).filter(x => x.kind === 'ingredient').map(x => x.ref));
    for (const i of direct) if (inner.has(i)) out.push({ code: 'ingrediente_anche_nella_sotto_ricetta', ingredient: i, sub: l.ref, line: (doc.lines.find(x => x.ref === i) || {}).id });
  }
  if (opt.sold && doc.has_stock && (doc.lines || []).length) out.push({ code: 'prep_e_piatto_nella_stessa_ricetta', note: 'venduta al POS e prodotta in anticipo con la stessa distinta: da separare in PREP + POS ITEM solo se sono operazioni diverse (revisione Chef)' });
  for (const x of explode(rootId, 1, 'costo', ctx)) if (x.kind === 'error') out.push({ code: x.status, ref: x.ref, line: x.line });
  return out;
}

/** R1.14 (Chef 21/10): the open problems of a recipe, shown and kept apart from the Chef's review (a reviewed recipe can still have them).
 *  [{ code, ref, line, sub }] — code: prezzo_mancante · conversione (status) · imballo_senza_prezzo · pezzo_come_porzione · procedimento_mancante · resa_mancante.
 *  Nothing is guessed: every item comes from the same walk as the food cost. */
export function issues(rootId, ctx) {
  const doc = D(ctx, rootId), out = [];
  if (!doc) return [{ code: 'ricetta_mancante', ref: rootId }];
  const y = doc.yield || {};
  if (!(Number(y.g) > 0) && !(Number(y.portions) > 0) && !(Number(y.count) > 0)) out.push({ code: 'resa_mancante' });
  if (!(doc.steps || []).some(st => String(st.it || st.en || st.es || '').trim())) out.push({ code: 'procedimento_mancante' });
  const seen = new Set(), add = o => { const k = o.code + ':' + (o.ref || '') + ':' + (o.status || ''); if (!seen.has(k)) { seen.add(k); out.push(o) } };
  const subs = (d, path) => { for (const l of d.lines || []) { if (l.kind !== 'recipe' || path.includes(l.ref)) continue; const sd = D(ctx, l.ref); if (!sd) continue
      const fr = subFraction(l.qty, l.unit, sd); if (fr.status === 'pezzo_come_porzione') add({ code: 'pezzo_come_porzione', ref: l.ref, line: path.length === 1 ? l.id : path[1], sub: d.id !== rootId ? d.id : null })
      subs(sd, path.concat(l.ref)) } };
  subs(doc, [rootId]);
  for (const lf of explode(rootId, 1, 'costo', ctx)) {
    const top = lf.path[1];
    if (lf.kind !== 'ingredient') { add({ code: 'conversione', status: lf.status, ref: lf.ref, line: top, sub: lf.from !== rootId ? lf.from : null }); continue; }
    const f = ctx.facts(lf.ref), c = leafCostEst(lf, f, ctx.measures), pack = lf.role === 'imballo' || (f && f.policy === 'non_food');
    if (c.status === 'stima_chef') { add({ code: 'prezzo_stima_chef', ref: lf.ref, line: top, sub: lf.from !== rootId ? lf.from : null }); continue; }
    if (c.cost != null) continue;
    const sub = lf.from !== rootId ? lf.from : null;
    if (pack) add({ code: 'imballo_senza_prezzo', ref: lf.ref, line: top, sub });
    else if (c.status === 'prezzo_mancante' || c.status === 'ingrediente_mancante') add({ code: 'prezzo_mancante', ref: lf.ref, line: top, sub });
    else add({ code: 'conversione', status: c.status, ref: lf.ref, line: top, sub });
  }
  return out;
}

/** What a change does BEFORE it is published: 1 portion sold, 1 lot produced, food cost. Only items that change are listed. */
export function consequences(id, ctxOld, ctxNew) {
  const one = (ctx, kind) => { const d = D(ctx, id); if (!d) return null; return kind === 'vendita' ? movements({ kind, recipe: id, portions: 1 }, ctx) : (d.has_stock ? movements({ kind, recipe: id, lots: 1 }, ctx) : null) };
  const diff = (a, b) => {
    const A = a ? sumMovements([a]) : {}, B = b ? sumMovements([b]) : {}, out = [];
    for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) {
      const x = A[k] || { g: 0, ml: 0, count: 0, portions: 0 }, y = B[k] || { g: 0, ml: 0, count: 0, portions: 0 };
      const ch = ['g', 'ml', 'count', 'portions'].filter(f => Math.abs((x[f] || 0) - (y[f] || 0)) > 1e-6);
      if (ch.length) out.push({ key: k, target: (A[k] || B[k]).target, ref: (A[k] || B[k]).ref, before: x, after: y, fields: ch });
    }
    return out;
  };
  const so = one(ctxOld, 'vendita'), sn = one(ctxNew, 'vendita'), po = one(ctxOld, 'produzione'), pn = one(ctxNew, 'produzione');
  const co = cost(id, 1, ctxOld), cn = cost(id, 1, ctxNew);
  const tOf = ctx => { const d = D(ctx, id); if (!d) return null; const t = Number(d.yield && d.yield.portions) > 0 ? theoretical(id, 1, ctx) : theoretical(id, null, ctx, 1); return { rows: t.rows } };
  return { theoretical: diff(tOf(ctxOld), tOf(ctxNew)), sale: diff(so, sn), sale_errors: sn ? sn.errors : ['ricetta_mancante'], production: diff(po, pn), production_errors: pn ? pn.errors : [],
    cost: { lot_before: co.food, lot_after: cn.food, portion_before: co.per_portion, portion_after: cn.per_portion, missing_after: cn.missing } };
}

/* ---------------- validation (editor / publish) ---------------- */
export function validate(doc, ctx, strict) {
  const err = [];
  if (!doc || typeof doc !== 'object') return ['documento_non_valido'];
  if (!String(doc.title || '').trim()) err.push('titolo_mancante');
  const y = doc.yield || {};
  if (strict && !(Number(y.g) > 0) && !(Number(y.portions) > 0)) err.push('resa_mancante');
  const ids = new Set();
  for (const l of doc.lines || []) {
    if (!l.id || ids.has(l.id)) err.push('riga_id_doppio'); ids.add(l.id);
    if (!['ingredient', 'recipe'].includes(l.kind)) err.push('riga_tipo:' + l.id);
    if (!/^[0-9a-f-]{36}$/.test(String(l.ref || ''))) err.push('riga_collegamento:' + l.id);
    if (!['produzione', 'al_piatto', 'imballo'].includes(l.role)) err.push('riga_ruolo:' + l.id);
    if (l.qty != null && !(Number(l.qty) >= 0)) err.push('riga_quantita:' + l.id);
    if (strict && dimOf(l.unit) == null) err.push('riga_unita:' + l.id);
    if (l.per != null && l.per !== 'portion') err.push('riga_per:' + l.id);
    if (l.per === 'portion' && !(Number(y.portions) > 0)) err.push('riga_per_senza_porzioni:' + l.id);
    if (l.est != null && (l.kind !== 'ingredient' || !(Number(l.est.usd) > 0) || !(Number(l.est.qty) > 0) || !['m', 'v', 'c'].includes(dimOf(l.est.unit)))) err.push('riga_stima:' + l.id);
  }
  // R1.17: one number, one place — a lot weight typed next to a portion weight that says something else is refused
  if (Number(y.portion_g) > 0 && Number(y.g) > 0 && Number(y.portions) > 0 && Math.abs(y.portion_g * y.portions - y.g) > 0.02 * y.g) err.push('resa_doppia');
  for (const st of doc.steps || []) for (const k of ['it', 'en', 'es']) {
    const re = /\{\{([A-Za-z0-9_:-]+)\}\}/g; let m;
    while ((m = re.exec(String(st[k] || '')))) if (!ids.has(m[1]) && !['y:portion_g', 'y:portions'].includes(m[1])) err.push('passo_collegamento:' + m[1]);
  }
  if (ctx && doc.id) { const cyc = explode(doc.id, 1, 'costo', ctx).filter(x => x.status === 'ciclo'); if (cyc.length) err.push('ciclo'); }
  return [...new Set(err)];
}

/* ---------------- R1.17: steps in three languages ---------------- */
export const LANGS = ['en', 'it', 'es'];
const STOP = {
  it: ['il', 'lo', 'la', 'gli', 'le', 'di', 'del', 'della', 'dei', 'delle', 'nel', 'nella', 'con', 'per', 'senza', 'che', 'e', 'un', 'una', 'si', 'sono', 'ogni', 'gli', 'mettere', 'scaldare', 'cuocere', 'lasciare', 'aggiungere', 'tutti', 'insieme', 'sul', 'sulla', 'poi', 'fino', 'minuti', 'affinché', 'eventualmente', 'piatto', 'servire', 'subito', 'ben', 'caldo', 'caldi', 'freddo', 'tagliare', 'mescolare', 'versare', 'formare', 'mettere', 'spinaci', 'burro', 'sale', 'pepe', 'contenitore', 'leggermente', 'raffreddare'],
  en: ['the', 'of', 'and', 'with', 'for', 'without', 'in', 'on', 'each', 'into', 'add', 'cook', 'let', 'put', 'until', 'minutes', 'all', 'together', 'then', 'a', 'an', 'to', 'is', 'are', 'heat', 'place', 'from', 'it', 'plate', 'serve', 'hot', 'cold', 'cut', 'mix', 'pour', 'form', 'spinach', 'butter', 'salt', 'container', 'slightly', 'cool'],
  es: ['el', 'los', 'las', 'de', 'del', 'con', 'para', 'sin', 'que', 'y', 'un', 'una', 'cada', 'poner', 'cocinar', 'dejar', 'añadir', 'agregar', 'todos', 'juntos', 'luego', 'hasta', 'minutos', 'en', 'la', 'se', 'calentar', 'plato', 'espinacas', 'servir', 'caliente', 'frío', 'cortar', 'mezclar', 'verter', 'formar', 'mantequilla', 'recipiente', 'ligeramente', 'enfriar'],
};
/** Language the text is ACTUALLY written in (never the language of the screen). { lang, sure } — sure=false when the words do not decide. */
export function langOf(text) {
  const w = String(text || '').toLowerCase().replace(/\{\{[^}]*\}\}/g, ' ').match(/[a-zàèéìòóùñü']+/g) || [];
  const sc = { it: 0, en: 0, es: 0 };
  for (const x of w) for (const k of LANGS) if (STOP[k].includes(x)) sc[k]++;
  if (/[ñ¿¡]/.test(text)) sc.es += 2;
  if (/\b\w+zione\b|\b\w+mente\b|à\b|è\b|ù\b/.test(text)) sc.it += 1;
  const o = LANGS.slice().sort((a, b) => sc[b] - sc[a]);
  return { lang: o[0], sure: sc[o[0]] >= 2 && sc[o[0]] >= 2 * sc[o[1]], score: sc };
}
/** Before translating: structured numbers become markers the translator cannot change; after: put them back and check. */
export function protectTokens(text) {
  const map = []; const t = String(text || '').replace(/\{\{([A-Za-z0-9_:-]+)\}\}/g, (m) => { map.push(m); return `[[${map.length}]]`; });
  return { text: t, map };
}
const digits = t => (String(t || '').replace(/\[\[\d+\]\]|\{\{[^}]*\}\}/g, ' ').match(/\d+(?:[.,]\d+)?/g) || []).map(x => x.replace(',', '.')).sort().join('|');
/** { text, ok, why } — ok=false when a linked number got lost/duplicated or a written number (temperature, minutes) changed. */
export function restoreTokens(translated, map, source) {
  let t = String(translated || ''), ok = true, why = null;
  map.forEach((m, i) => { const k = `[[${i + 1}]]`, n = t.split(k).length - 1; if (n !== 1) { ok = false; why = 'numero_collegato_perso'; } t = t.split(k).join(m); });
  if (/\[\[\d+\]\]/.test(t)) { ok = false; why = 'numero_collegato_perso'; }
  if (source != null && digits(source) !== digits(t)) { ok = false; why = why || 'numeri_diversi'; }
  // the service gave back the original (out of quota, error): it is NOT a translation — never stored as one
  if (source != null && String(translated || '').replace(/\s+/g, ' ').trim().toLowerCase() === String(source).replace(/\s+/g, ' ').trim().toLowerCase()) return { text: null, ok: false, why: 'non_tradotto' };
  return { text: t.trim(), ok, why };
}
/** The Chef writes "80 g": when it is EXACTLY the standard portion weight (or one line's quantity, only one), it becomes the structured value. */
export function linkNumbers(text, doc) {
  doc = resolveDoc(doc) || {};
  const y = doc.yield || {}, lines = doc.lines || [];
  return String(text || '').replace(/(\d+(?:[.,]\d+)?)(\s?)(kg|g|gr|grammi|grams|ml|l|oz|lb|lbs|pz|pcs)\b/gi, (m, num, sp, u) => {
    const q = Number(num.replace(',', '.')), ku = normUnit(u);
    if (ku === 'g' && Number(y.portion_g) > 0 && q === Number(y.portion_g)) return `{{y:portion_g}}${sp}${u}`;
    const c = lines.filter(l => Number(l.per === 'portion' ? l.per_qty : l.qty) === q && normUnit(l.unit) === ku);
    return c.length === 1 ? `{{${c[0].id}}}${sp}${u}` : m;
  });
}
/** Text of a step for a language: the language if present and current, otherwise the original (marked). */
export function stepIn(st, lang) {
  if (!st) return { text: '', lang: null, kind: 'none' };
  const tr = st.tr || {}, src = st.src || null;
  if (String(st[lang] || '').trim() && tr[lang] !== 'stale') return { text: st[lang], lang, kind: src === lang ? 'original' : (tr[lang] || (src ? 'auto' : 'imported')) };
  const o = src && String(st[src] || '').trim() ? src : LANGS.concat(['it']).find(k => String(st[k] || '').trim());
  return o ? { text: st[o], lang: o, kind: 'fallback' } : { text: '', lang: null, kind: 'none' };
}

export const MRE_ENGINE_VERSION = 'mre-1.3';
