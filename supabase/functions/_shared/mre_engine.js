// MRE — Master Recipe Engine (B-49). ONE engine for: free scaling, unit conversion, kitchen rounding,
// sub-recipes, food cost, production consumption and sale consumption.
// Pure functions, no I/O: the server (Deno, brigade-app-api) and the app (browser) load THIS SAME FILE.
// Single source: supabase/functions/_shared/mre_engine.js — the Pages build copies it into web/.
//
// A recipe document ("doc") is one lot with one yield:
//   { schema:1, title, category, yield:{ g, portions, label }, has_stock, lines:[...], steps:[{it,en,es}], notes }
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
  nests: 'nest', nidi: 'nest', nido: 'nest', porzioni: 'portion', porzione: 'portion', portions: 'portion', porciones: 'portion',
  cs: 'case', fogli: 'foglio', sheet: 'foglio', sheets: 'foglio', pizzichi: 'pizzico',
};
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
  if (k in COUNT) return { dim: 'c', val: q, count: q, ckey: COUNT[k], g: pg && COUNT[k] === 'pz' ? q * pg : null, status: pg || COUNT[k] !== 'pz' ? 'ok' : 'peso_pezzo_mancante' };
  const m = measures && Number(measures[k]) > 0 ? Number(measures[k]) : null;
  if (m) return { dim: 'm', val: q * m, g: q * m, status: 'stima' };
  return { dim: null, val: null, g: null, status: 'unita_sconosciuta' };
}

/** Which part of a sub-recipe lot a line uses (0..n). null + status when it cannot be known. */
export function subFraction(qty, unit, sub) {
  const k = normUnit(unit), q = Number(qty), y = (sub && sub.yield) || {};
  if (k == null || !isFinite(q)) return { f: null, status: 'quantita_mancante' };
  if (k in MASS) return Number(y.g) > 0 ? { f: q * MASS[k] / Number(y.g), status: 'ok' } : { f: null, status: 'resa_mancante' };
  if (k in COUNT || k === 'cup') {
    if (k === 'cup') return { f: null, status: 'unita_sospetta' };
    if (Number(y.count) > 0 && normUnit(y.count_unit) === k) return { f: q / Number(y.count), status: 'ok' };   // e.g. 50 nests per lot
    if (Number(y.portions) > 0) return { f: q / Number(y.portions), status: 'ok' };
    return { f: null, status: 'resa_mancante' };
  }
  if (k in VOL) return { f: null, status: 'densita_mancante' };
  return { f: null, status: 'unita_sconosciuta' };
}

/* ---------------- free scaling ---------------- */
/** Factor that makes the line read newQty newUnit. Any compatible unit (5 uova, 12 oz, 0,35 kg). */
export function factorFromLine(doc, lineId, newQty, newUnit, ctx) {
  const ln = (doc.lines || []).find(l => l.id === lineId);
  if (!ln || !(Number(newQty) > 0)) return null;
  if (ln.kind === 'recipe') {
    const sub = ctx.doc(ln.ref);
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
  const out = [], re = /\{\{([A-Za-z0-9_-]+)\}\}/g; let m, last = 0;
  const s = String(text || '');
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ t: 'txt', v: s.slice(last, m.index) });
    const ln = (doc.lines || []).find(l => l.id === m[1]);
    out.push(ln ? { t: 'q', v: stepNumber(ln, factor, loc), id: ln.id } : { t: 'txt', v: '?' });
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
  const root = ctx.doc(rootId);
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
      out.push({ kind: 'ingredient', ref: ln.ref, line: ln.id, from: id, role: ln.role, dim: a.dim, g: a.g, ml: a.ml != null ? a.ml : (a.dim === 'v' ? a.val : null), count: a.dim === 'c' ? a.val : null, ckey: a.ckey, status: a.status, path: p });
      continue;
    }
    if (path.includes(ln.ref)) { out.push({ kind: 'error', ref: ln.ref, line: ln.id, from: id, status: 'ciclo', path: p }); continue; }
    const sub = ctx.doc(ln.ref);
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
  return { cost: null, status: leaf.status !== 'ok' ? leaf.status : 'conversione_mancante' };
}

/** Food cost of one lot × factor. Per top line and total. Missing parts are counted, never treated as zero. */
export function cost(rootId, factor, ctx) {
  const doc = ctx.doc(rootId), leaves = explode(rootId, factor, 'costo', ctx);
  const byLine = {}; let food = 0, pack = 0, missing = 0, estimated = 0;
  for (const lf of leaves) {
    const top = lf.path[1];
    const b = byLine[top] || (byLine[top] = { cost: 0, missing: 0, status: 'ok' });
    if (lf.kind !== 'ingredient') { b.missing++; b.status = lf.status; missing++; continue; }
    const f = ctx.facts(lf.ref), c = leafCost(lf, f);
    const isPack = lf.role === 'imballo' || (f && f.policy === 'non_food');
    if (c.cost == null) { if (!isPack) { b.missing++; b.status = c.status; missing++; } continue; }
    if (isPack) pack += c.cost; else { food += c.cost; b.cost += c.cost; }
    if (c.status === 'stima') { estimated++; if (b.status === 'ok') b.status = 'stima'; }
  }
  const portions = doc && Number(doc.yield && doc.yield.portions) > 0 ? doc.yield.portions * factor : null;
  return { food, pack, missing, estimated, complete: missing === 0, per_portion: portions ? food / portions : null, portions, byLine };
}

/* ---------------- one number for every module (B-49, Chef 20/10) ----------------
 * Sale, production, cancellation and partial lots all come from explode() on ONE version of the recipe.
 * The lot/portion rule lives only here: n portions = n / yield.portions lots. No caller divides on its own. */
/** Lots for a number of portions. null + status when the recipe has no portions. */
export function lotsFromPortions(doc, portions) {
  const p = Number(doc && doc.yield && doc.yield.portions), n = Number(portions);
  if (!(p > 0)) return { lots: null, status: 'porzioni_mancanti' };
  if (!isFinite(n)) return { lots: null, status: 'quantita_mancante' };
  return { lots: n / p, status: 'ok' };
}
const mvRow = (x, sign) => ({ target: x.kind === 'prep' ? 'prep' : x.kind === 'ingredient' ? 'ingrediente' : 'errore', ref: x.ref, line: x.line || null, from: x.from || null, role: x.role || null,
  g: x.g != null ? sign * x.g : null, ml: x.ml != null ? sign * x.ml : null, count: x.count != null ? sign * x.count : null, ckey: x.ckey || null,
  portions: x.portions != null ? sign * x.portions : null, status: x.status })
/** Inventory movements of one event. ev: { kind:'vendita'|'produzione', recipe, version, portions | lots, ref }.
 *  Consumption is negative; a production also adds the made lot to the recipe's own stock (positive).
 *  The rows are computed once and stored with the version: a later recipe change never alters them. */
export function movements(ev, ctx) {
  const doc = ctx.doc(ev.recipe);
  if (!doc) return { event: ev, lots: null, rows: [], errors: ['ricetta_mancante'] };
  let lots = ev.lots != null ? Number(ev.lots) : null, errors = [];
  if (lots == null) { const r = lotsFromPortions(doc, ev.portions); lots = r.lots; if (r.status !== 'ok') errors.push(r.status) }
  if (!(lots > 0)) return { event: ev, lots: null, rows: [], errors: errors.length ? errors : ['quantita_mancante'] };
  const rows = []
  if (ev.kind === 'produzione') {
    if (!doc.has_stock) errors.push('ricetta_senza_scorta');
    rows.push({ target: 'prep', ref: ev.recipe, line: null, from: null, role: 'prodotto', g: Number(doc.yield.g) > 0 ? lots * doc.yield.g : null, ml: null, count: null, ckey: null,
      portions: Number(doc.yield.portions) > 0 ? lots * doc.yield.portions : null, status: 'ok' });
  }
  for (const x of explode(ev.recipe, lots, ev.kind === 'produzione' ? 'produzione' : 'vendita', ctx)) {
    const r = mvRow(x, -1); rows.push(r); if (r.target === 'errore') errors.push(x.status);
  }
  return { event: Object.assign({}, ev), version: ev.version != null ? ev.version : null, engine: MRE_ENGINE_VERSION, lots, rows, errors: [...new Set(errors)] };
}
/** Cancellation: the same stored rows with the opposite sign (never recomputed from today's recipe). */
export function reverseMovements(m, reason) {
  return { event: Object.assign({}, m.event, { kind: 'annullamento', reverses: m.event, reason: reason || null }), version: m.version, engine: m.engine, lots: m.lots,
    rows: m.rows.map(r => Object.assign({}, r, { g: r.g != null ? -r.g : null, ml: r.ml != null ? -r.ml : null, count: r.count != null ? -r.count : null, portions: r.portions != null ? -r.portions : null })), errors: m.errors };
}
/** Net total per stock item ('prep:<recipe id>' / 'ingrediente:<id>'). */
export function sumMovements(list) {
  const t = {};
  for (const m of list) for (const r of m.rows) {
    if (r.target === 'errore') continue;
    const k = r.target + ':' + r.ref, o = t[k] || (t[k] = { target: r.target, ref: r.ref, g: 0, ml: 0, count: 0, portions: 0 });
    for (const f of ['g', 'ml', 'count', 'portions']) if (r[f] != null) o[f] += r[f];
  }
  for (const o of Object.values(t)) for (const f of ['g', 'ml', 'count', 'portions']) o[f] = Math.round(o[f] * 1e6) / 1e6;
  return t;
}
/** What a change does BEFORE it is published: 1 portion sold, 1 lot produced, food cost. Only items that change are listed. */
export function consequences(id, ctxOld, ctxNew) {
  const one = (ctx, kind) => { const d = ctx.doc(id); if (!d) return null; return kind === 'vendita' ? movements({ kind, recipe: id, portions: 1 }, ctx) : (d.has_stock ? movements({ kind, recipe: id, lots: 1 }, ctx) : null) };
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
  return { sale: diff(so, sn), sale_errors: sn ? sn.errors : ['ricetta_mancante'], production: diff(po, pn), production_errors: pn ? pn.errors : [],
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
  }
  for (const st of doc.steps || []) for (const k of ['it', 'en', 'es']) {
    const re = /\{\{([A-Za-z0-9_-]+)\}\}/g; let m;
    while ((m = re.exec(String(st[k] || '')))) if (!ids.has(m[1])) err.push('passo_collegamento:' + m[1]);
  }
  if (ctx && doc.id) { const cyc = explode(doc.id, 1, 'costo', ctx).filter(x => x.status === 'ciclo'); if (cyc.length) err.push('ciclo'); }
  return [...new Set(err)];
}

export const MRE_ENGINE_VERSION = 'mre-1.0';
