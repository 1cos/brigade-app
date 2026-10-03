/* Brigade 2.0 — recipe card. Port of Brigade's BR-UI02 card ("layout del primo mockup approvato da Max"):
   amount = number field + slider (synced), PREP | COST | STRUCTURE. Same rules as Brigade:
   - scale base = FC05 yield rules (_yieldBase): portions, else batch weight, else batches;
   - quantities scaled and rounded like in the kitchen (_scaleQty);
   - cost numbers ONLY from the FC05 engine (server op recipe_cost, Chef only), multiplied by the factor;
   - a missing number is shown as missing, never as 0.
   Rendered inside a V020-B tab with the app's single theme. Only reads: nothing here writes. */
(function () {
const T = window.I18N.t;
const L = () => window.I18N.lang;
const RT = {   // recipe-card texts (interface only; recipe content is never translated)
  prep: ['PREP', 'PREP', 'PREP'], cost: ['COST', 'COSTO', 'COSTO'], struct: ['STRUCTURE', 'STRUTTURA', 'ESTRUCTURA'],
  portions: ['Portions', 'Porzioni', 'Porciones'], batchKg: ['Batch kg', 'Lotto kg', 'Lote kg'], batches: ['Batches', 'Lotti', 'Lotes'],
  original: ['original', 'originale', 'original'], recipe_of: ['recipe of {x}', 'ricetta da {x}', 'receta de {x}'], batch_of: ['batch {x} kg', 'lotto {x} kg', 'lote {x} kg'],
  no_yield: ['no yield recorded', 'resa non registrata', 'sin rendimiento'], ingredients: ['Ingredients', 'Ingredienti', 'Ingredientes'], method: ['Method', 'Procedimento', 'Procedimiento'],
  no_method: ['No method written for this recipe.', 'Nessun procedimento scritto per questa ricetta.', 'No hay procedimiento escrito.'],
  no_ing: ['No ingredients listed.', 'Nessun ingrediente in distinta.', 'Sin ingredientes.'], prep_badge: ['prep', 'preparazione', 'preparación'],
  not_scaled: ['not scaled', 'non scalata', 'no escalada'], unit_unknown: ['unit not convertible: only multiplied', 'unità non convertibile: solo moltiplicata', 'unidad no convertible: solo multiplicada'],
  rounded_from: ['rounded up from {x}', 'per eccesso da {x}', 'redondeado desde {x}'], sub_noconv: ['⚠ quantity not convertible: {x}', '⚠ quantità non convertibile: {x}', '⚠ cantidad no convertible: {x}'],
  written_only: ['Written recipe only: no bill of materials linked yet.', 'Solo ricetta scritta: nessuna distinta collegata.', 'Solo receta escrita: sin lista de materiales.'],
  over_slider: ['Above the slider range: {x} is used as typed.', 'Oltre la barra: si usa {x} come scritto.', 'Fuera de la barra: se usa {x} como escrito.'],
  invalid_amt: ['Write a number above 0.', 'Scrivi un numero maggiore di 0.', 'Escribe un número mayor que 0.'],
  yield_from_weight: ['Portions calculated like FC05: batch weight ÷ portion weight.', 'Porzioni calcolate come FC05: peso del lotto ÷ peso a porzione.', 'Porciones calculadas como FC05: peso del lote ÷ peso por porción.'],
  yield_text_only: ['The yield text says "{x}", but the recipe has no portions or weight: FC05 does not use it, so here it scales by batches.', 'Il testo della resa dice "{x}", ma la ricetta non ha porzioni né peso: FC05 non lo usa, quindi qui si scala per lotti.', 'El texto dice "{x}", pero la receta no tiene porciones ni peso: FC05 no lo usa, aquí se escala por lotes.'],
  yield_none: ['This recipe has no yield recorded (portions or weight): you can only multiply it by batches.', 'Questa ricetta non ha una resa registrata (porzioni o peso): puoi solo moltiplicarla per lotti.', 'Esta receta no tiene rendimiento (porciones o peso): solo se multiplica por lotes.'],
  scaled_note: ['Scaled on this screen only. The recipe is unchanged.', 'Scalata solo a schermo. La ricetta non cambia.', 'Escalada solo en pantalla. La receta no cambia.'],
  used_in: ['Used in', 'Usata in', 'Usada en'], prep_list: ['Prep', 'Prep', 'Prep'],
  // cost
  c_loading: ['Reading costs from the FC05 engine…', 'Leggo i costi dal motore FC05…', 'Leyendo costos del motor FC05…'],
  c_error: ['Could not read costs. No number shown, so you never get a wrong cost.', 'Non riesco a leggere i costi. Nessun numero mostrato, per non darti un costo sbagliato.', 'No se pudieron leer los costos. No se muestra ningún número para no dar un costo equivocado.'],
  c_ok: ['● Reliable cost', '● Costo affidabile', '● Costo fiable'], c_ok_why: ['All prices come from invoices.', 'Tutti i prezzi vengono da fatture.', 'Todos los precios vienen de facturas.'],
  c_est: ['● Usable cost, partly estimated', '● Costo utilizzabile, con una parte stimata', '● Costo usable, en parte estimado'], c_est_part: ['Estimated part: {x}.', 'Parte stimata: {x}.', 'Parte estimada: {x}.'],
  c_bad: ['● Cost not reliable', '● Costo non affidabile', '● Costo no fiable'], c_bad_why: ['The known cost is only a part: do not use it for quotes.', 'Il costo noto è solo una parte: non usarlo per preventivi.', 'El costo conocido es solo una parte: no lo uses para presupuestos.'],
  c_total: ['Total · {x}', 'Totale · {x}', 'Total · {x}'], c_total_est: ['Estimated total · {x}', 'Totale stimato · {x}', 'Total estimado · {x}'], c_known: ['Known cost, partial · {x}', 'Costo noto, parziale · {x}', 'Costo conocido, parcial · {x}'],
  c_portion: ['Per portion', 'A porzione', 'Por porción'], c_portion_est: ['Per portion (estimate)', 'A porzione (stima)', 'Por porción (estimado)'],
  c_per_l: ['Per litre', 'Al litro', 'Por litro'], c_per_kg: ['Per kg', 'Al kg', 'Por kg'],
  c_no_portions: ['portions not defined', 'porzioni non definite', 'porciones no definidas'], c_conflict: ['portions in conflict', 'porzioni in conflitto', 'porciones en conflicto'],
  c_none_known: ['no known price', 'nessun prezzo noto', 'ningún precio conocido'], c_not_calc: ['not calculable', 'non calcolabile', 'no calculable'],
  c_cat10: ['Catering 10% markup excluded: it applies once, on the event sheet.', 'Maggiorazione catering del 10% esclusa: si applica una volta sola nel foglio dell\'evento.', 'Recargo catering del 10% excluido: se aplica una vez en la hoja del evento.'],
  c_to_fix: ['To fix · {x}', 'Da correggere · {x}', 'Por corregir · {x}'], c_where: ['Where the cost comes from · {x}', 'Da dove viene il costo · {x}', 'De dónde viene el costo · {x}'],
  c_src: ['Prices and calculation: FC05 engine', 'Prezzi e calcolo: motore FC05', 'Precios y cálculo: motor FC05'], c_src_inv: [', from the latest invoice of each ingredient', ', dall\'ultima fattura di ogni ingrediente', ', de la última factura de cada ingrediente'],
  c_unknown: ['unknown', 'sconosciuto', 'desconocido'], c_partial: ['known part only', 'solo parte nota', 'solo parte conocida'], c_zero: ['declared zero cost', 'costo zero dichiarato', 'costo cero declarado'],
  c_nonfood: ['non-food', 'non alimentare', 'no alimentario'], c_estimate: ['estimate', 'stima', 'estimado'], c_of_sub: ['{x} of the sub-recipe', '{x} della sotto-ricetta', '{x} de la sub-receta'],
  c_reliable: ['reliable', 'affidabile', 'fiable'], c_with_est: ['with estimates', 'con stime', 'con estimados'], c_unreliable: ['not reliable', 'non affidabile', 'no fiable'],
  per_each: ['each', 'pezzo', 'unidad'],
  // structure
  s_reading: ['Checking the sub-recipes…', 'Controllo le sotto-preparazioni…', 'Revisando las sub-recetas…'], s_err: ['Could not read the sub-recipes', 'Non riesco a leggere le sotto-preparazioni', 'No se pudieron leer las sub-recetas'],
  s_ok: ['● Structure complete', '● Struttura completa', '● Estructura completa'], s_ok_why: ['Yields, links and units add up at every level.', 'Rese, collegamenti e unità tornano a ogni livello.', 'Rendimientos, vínculos y unidades cuadran en cada nivel.'],
  s_fix: ['● Structure to fix · {x}', '● Struttura da correggere · {x}', '● Estructura por corregir · {x}'], s_fix_why: ['Listed at the bottom, in plain words.', 'Li trovi in fondo, in parole semplici.', 'Están abajo, en palabras simples.'],
  s_yield: ['Yield', 'Resa', 'Rendimiento'], s_batch: ['Batch yield', 'Resa del lotto', 'Rendimiento del lote'], s_portions: ['Portions', 'Porzioni', 'Porciones'], s_pw: ['Portion weight', 'Peso a porzione', 'Peso por porción'],
  s_ytext: ['Yield text', 'Testo della resa', 'Texto del rendimiento'], s_for: ['For {x}', 'Per {x}', 'Para {x}'], s_final: ['expected final weight', 'peso finale previsto', 'peso final previsto'],
  s_nr: ['not recorded', 'non registrato', 'sin registro'], s_nocalc: ['weight not calculable: no weight yield', 'peso non calcolabile: manca la resa in peso', 'peso no calculable: falta rendimiento en peso'],
  s_comp: ['Components · {x}', 'Componenti · {x}', 'Componentes · {x}'], s_todo: ['To prepare · {x}', 'Da preparare · {x}', 'Por preparar · {x}'], s_probs: ['Structure problems · {x}', 'Problemi di struttura · {x}', 'Problemas de estructura · {x}'],
  s_orig: ['original: {x}', 'originale: {x}', 'original: {x}'], s_need_lots: ['yield {y} · needs {x}', 'resa {y} · servono {x}', 'rendimiento {y} · se necesitan {x}'], s_lots_nc: ['yield {y} · batches not calculable', 'resa {y} · lotti non calcolabili', 'rendimiento {y} · lotes no calculables'],
  s_sub: ['sub-recipe', 'sotto-ricetta', 'sub-receta'], s_ing: ['ingredient', 'ingrediente', 'ingrediente'], s_none_todo: ['No linked preparation: only ingredients to weigh (see PREP).', 'Nessuna preparazione collegata: solo ingredienti da pesare (vedi PREP).', 'Sin preparaciones vinculadas: solo ingredientes para pesar (ver PREP).'],
  p_qty: ['«{n}»: quantity missing{w}.', '«{n}»: manca la quantità{w}.', '«{n}»: falta la cantidad{w}.'],
  p_unit: ['«{n}»: unit "{u}" not convertible{w}.', '«{n}»: unità "{u}" non convertibile{w}.', '«{n}»: unidad "{u}" no convertible{w}.'],
  p_prepgone: ['«{n}» links to a prep that no longer exists{w}.', '«{n}» è collegato a una prep che non esiste più{w}.', '«{n}» apunta a una prep que ya no existe{w}.'],
  p_linegone: ['A line points to a preparation that no longer exists{w}.', 'Una riga punta a una preparazione che non esiste più{w}.', 'Una línea apunta a una preparación que ya no existe{w}.'],
  p_self: ['«{n}» contains itself.', '«{n}» contiene se stessa.', '«{n}» se contiene a sí misma.'],
  p_yunk: ['«{n}»: yield unknown, batches not calculable.', '«{n}»: resa sconosciuta, lotti non calcolabili.', '«{n}»: rendimiento desconocido, lotes no calculables.'],
  p_noconv: ['«{n}»: {x}{w}.', '«{n}»: {x}{w}.', '«{n}»: {x}{w}.'],
  p_noing: ['«{n}» has no ingredients listed.', '«{n}» non ha ingredienti in distinta.', '«{n}» no tiene ingredientes en la lista.'],
  s_for_parent: ['for «{x}»', 'per «{x}»', 'para «{x}»'], lot: ['batch', 'lotto', 'lote'], lots: ['batches', 'lotti', 'lotes'], lt001: ['less than 0.01 batches', 'meno di 0,01 lotti', 'menos de 0,01 lotes'],
};
const R = (k, v) => { const e = RT[k]; let s = e ? e[{ en: 0, it: 1, es: 2 }[L()]] : k; if (v) Object.keys(v).forEach(x => { s = s.split('{' + x + '}').join(v[x]); }); return s; };
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---- units and scaling: same factors and rounding as Brigade (recipe-view.js / unit-normalizer.js) ---- */
const UNITS = {
  mg: ['mass', 0.001, 'metric'], g: ['mass', 1, 'metric'], gr: ['mass', 1, 'metric'], kg: ['mass', 1000, 'metric'],
  oz: ['mass', 28.3495, 'us'], lb: ['mass', 453.592, 'us'], lbs: ['mass', 453.592, 'us'],
  ml: ['vol', 1, 'metric'], cl: ['vol', 10, 'metric'], dl: ['vol', 100, 'metric'], l: ['vol', 1000, 'metric'], lt: ['vol', 1000, 'metric'],
  tsp: ['vol', 4.92892, 'keep'], tbsp: ['vol', 14.7868, 'keep'], cup: ['vol', 236.588, 'keep'], fl_oz: ['vol', 29.5735, 'keep'],
  'fl oz': ['vol', 29.5735, 'keep'], qt: ['vol', 946.353, 'keep'], gal: ['vol', 3785.41, 'keep'], gallone: ['vol', 3785.41, 'keep'], galloni: ['vol', 3785.41, 'keep'], gallon: ['vol', 3785.41, 'keep'],
  pz: ['count'], pezzi: ['count'], pezzo: ['count'], each: ['count'], ea: ['count'], n: ['count'], nests: ['count'], porzione: ['count'], porzioni: ['count'],
  foglio: ['count'], foglia: ['count'], fogli: ['count'], foglie: ['count'], spicchio: ['count'], spicchi: ['count'], fetta: ['count'], fette: ['count'], case: ['count'], busta: ['count'], buste: ['count'],
  pinch: ['free'], pizzico: ['free'], pizzichi: ['free'], drops: ['free'], gocce: ['free'], qb: ['free'], 'q.b.': ['free'],
};
function unit(u) { const k = String(u || '').trim().toLowerCase(), d = UNITS[k]; if (!d) return { key: k, fam: k ? 'unknown' : 'none' }; return { key: k, fam: d[0], f: d[1], sys: d[2] }; }
const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : null; };
const N = (n, dec, grouping = true) => n.toLocaleString(window.I18N.locale(), { maximumFractionDigits: dec, minimumFractionDigits: 0, useGrouping: grouping });
function scaleQty(qty, u0, factor) {
  const q = num(qty), u = unit(u0), raw = String(u0 || '').trim();
  if (q === null || q === 0) return { text: '—', flag: 'none' };
  if (u.fam === 'free') return { text: N(q, 2) + ' ' + raw, flag: 'free' };
  const v = q * factor;
  if (u.fam === 'mass' && u.sys === 'metric') { const g = v * u.f;
    if (u.key === 'mg' && g < 1) return { text: N(Math.round(g * 1000), 0) + ' mg', flag: null };
    if (g >= 999.5) return { text: N(Math.round(g / 10) / 100, 2) + ' kg', flag: null };
    return { text: (g < 10 ? N(Math.round(g * 10) / 10, 1) : N(Math.round(g), 0)) + ' g', flag: null }; }
  if (u.fam === 'mass') { const oz = v * u.f / 28.3495; if (oz >= 15.95) return { text: N(Math.round(oz / 16 * 100) / 100, 2) + ' lb', flag: null }; return { text: N(Math.round(oz * 10) / 10, 1) + ' oz', flag: null }; }
  if (u.fam === 'vol' && u.sys === 'metric') { const ml = v * u.f; if (ml >= 999.5) return { text: N(Math.round(ml / 10) / 100, 2) + ' l', flag: null }; return { text: (ml < 10 ? N(Math.round(ml * 10) / 10, 1) : N(Math.round(ml), 0)) + ' ml', flag: null }; }
  if (u.fam === 'vol') return { text: N(Math.round(v * 100) / 100, 2) + ' ' + raw, flag: null };
  if (u.fam === 'count') { const r = Math.round(v * 1000) / 1000; if (Number.isInteger(r)) return { text: N(r, 0) + ' ' + raw, flag: null }; return { text: N(Math.ceil(r), 0) + ' ' + raw, flag: 'rounded', exact: N(Math.round(v * 100) / 100, 2) }; }
  return { text: N(Math.round(v * 100) / 100, 2) + (raw ? ' ' + raw : ''), flag: 'unknown' };
}
// FC05 yield rules (food_cost.recipe_breakdown): portions = base_servings, else weight ÷ portion weight; else batch weight; else batches.
function yieldBase(rec) {
  const bs = num(rec?.base_servings), sw = num(rec?.serving_weight_g), sq = num(rec?.serving_qty);
  let yw = num(rec?.base_weight_g);
  if (!(yw > 0)) { const w = num(rec?.base_weight), u = String(rec?.weight_unit || '').toLowerCase(); yw = w > 0 && (u === 'kg' || u === 'g') ? w * (u === 'kg' ? 1000 : 1) : null; }
  if (bs > 0) return { mode: 'portions', base: bs };
  if (yw > 0 && sw > 0) return { mode: 'portions', base: yw / sw, from: 'weight' };
  if (yw > 0 && String(rec?.serving_unit || '').toLowerCase() === 'g' && sq > 0) return { mode: 'portions', base: yw / sq, from: 'weight' };
  if (yw > 0) return { mode: 'weight', base: yw };
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*(porzion|portion|porcion|serving)/i.exec(rec?.yield_text || '');
  return { mode: 'batches', base: 1, text: m ? rec.yield_text.trim() : null };
}
function subYieldLabel(sub) {
  const y = yieldBase(sub), bw = num(sub?.base_weight_g);
  if (bw > 0) return scaleQty(bw, 'g', 1).text;
  if (y.mode === 'portions') return N(Math.round(y.base * 10) / 10, 1) + ' ' + R('portions').toLowerCase();
  if (y.mode === 'weight') return scaleQty(y.base, 'g', 1).text;
  return R('no_yield');
}
function subFactor(qty, u0, factor, sub) {
  const q = num(qty), u = unit(u0);
  if (!sub) return { ok: false, why: 'sub-recipe not found' };
  if (q === null || q === 0) return { ok: false, why: 'missing quantity' };
  const need = q * factor, bw = num(sub.base_weight_g), y = yieldBase(sub);
  if (u.fam === 'mass' && bw > 0) return { ok: true, factor: need * u.f / bw };
  if (u.fam === 'count' && /^porzion/.test(u.key) && y.mode === 'portions') return { ok: true, factor: need / y.base };
  if (u.fam === 'vol' && bw > 0) return { ok: false, why: `${u0} → ${subYieldLabel(sub)} (density needed)` };
  return { ok: false, why: `${u0 || '—'} → ${subYieldLabel(sub)}` };
}
const lots = n => n > 0 && n < 0.01 ? R('lt001') : `${N(Math.round(n * 100) / 100, 2)} ${Math.round(n * 100) === 100 ? R('lot') : R('lots')}`;
function ingName(row) {
  if (row.component_type === 'RECIPE') return row.recipes?.title || '—';
  const i = row.ingredients || {}; const l = L();
  return (l === 'it' && i.name_it) || (l === 'es' && i.name_es) || i.name || '—';
}
function amountLabel(v) {
  const y = v.yb;
  if (y.mode === 'portions') return N(Math.round(y.base * v.factor * 10) / 10, 1) + ' ' + R('portions').toLowerCase();
  if (y.mode === 'weight') return N(Math.round(y.base * v.factor / 10) / 100, 2) + ' kg';
  return '× ' + N(Math.round(v.factor * 100) / 100, 2);
}
const money = (n, dec = 2) => '$' + Number(n).toLocaleString(window.I18N.locale(), { minimumFractionDigits: dec, maximumFractionDigits: dec });

/* ---- amount control: number + slider, synced; the field accepts values beyond the slider ---- */
function range(y) {
  return y.mode === 'portions' ? { min: 1, max: Math.max(200, Math.ceil(y.base * 3)), step: 1 }
    : y.mode === 'weight' ? { min: 0.1, max: Math.max(10, Math.ceil(y.base * 3 / 1000)), step: 0.1 } : { min: 0.25, max: 10, step: 0.25 };
}
const amountOf = v => v.yb.mode === 'portions' ? v.yb.base * v.factor : v.yb.mode === 'weight' ? v.yb.base * v.factor / 1000 : v.factor;
const factorFor = (y, a) => y.mode === 'portions' ? a / y.base : y.mode === 'weight' ? a * 1000 / y.base : a;
function amountHtml(v) {
  const y = v.yb, rg = range(y), a = amountOf(v), dec = y.mode === 'portions' ? 1 : 2;
  const lbl = y.mode === 'portions' ? R('portions') : y.mode === 'weight' ? R('batchKg') : R('batches');
  const over = a > rg.max ? `<div class="rc-over" id="rcOver">${R('over_slider', { x: N(Math.round(a * 100) / 100, 2) })}</div>` : '<div class="rc-over" id="rcOver" hidden></div>';
  return `<div class="rc-amt"><div class="rc-row">
      <label for="rcAmount"><b>${lbl}</b><small id="rcSub">${Math.abs(v.factor - 1) < 1e-9 ? R('original') : '× ' + N(Math.round(v.factor * 1000) / 1000, 3)}</small></label>
      <input id="rcAmount" inputmode="decimal" autocomplete="off" aria-label="${lbl}" value="${N(Math.round(a * 10 ** dec) / 10 ** dec, dec, false)}">
      <input type="range" id="rcRange" min="${rg.min}" max="${rg.max}" step="${rg.step}" value="${Math.min(rg.max, Math.max(rg.min, a))}" aria-label="${lbl}">
    </div>${over}</div>`;
}

/* ---- PREP view ---- */
function prepView(v) {
  const f = v.factor;
  const flagTxt = q => q.flag === 'free' ? `<small>${R('not_scaled')}</small>` : q.flag === 'unknown' ? `<small class="warn">${R('unit_unknown')}</small>` : q.flag === 'rounded' ? `<small>${R('rounded_from', { x: q.exact })}</small>` : '';
  let ing;
  if (v.bom.length) ing = `<div class="list">${v.bom.map((row, i) => {
    const q = scaleQty(row.quantity, row.unit, f), note = row.notes ? `<small>${esc(row.notes)}</small>` : '';
    if (row.component_type === 'RECIPE' && row.sub_recipe_id) {
      const sf = subFactor(row.quantity, row.unit, f, row.recipes);
      return `<button class="ing rc-it" data-a="openSub" data-i="${i}"><span class="rc-grow">${esc(ingName(row))}<span class="rc-badge">${R('prep_badge')}</span>${note}${sf.ok ? '' : `<small class="warn">${esc(R('sub_noconv', { x: sf.why }))}</small>`}</span><b class="num">${esc(q.text)}${flagTxt(q)}</b><span class="chev">›</span></button>`;
    }
    return `<div class="ing rc-it"><span class="rc-grow">${esc(ingName(row))}${note}</span><b class="num">${esc(q.text)}${flagTxt(q)}</b></div>`;
  }).join('')}</div>`;
  else if (v.written.length) ing = `<p class="note rc-small">${R('written_only')}</p><div class="list">${v.written.map(i => {
    if (i.type === 'section') return `<div class="rc-sechead">${esc(i.name)}</div>`;
    const q = scaleQty(i.qty, i.unit, f);
    return `<div class="ing rc-it"><span class="rc-grow">${esc(i.name)}${i.comment ? `<small>${esc(i.comment)}</small>` : ''}</span><b class="num">${esc(q.text)}${flagTxt(q)}</b></div>`;
  }).join('')}</div>`;
  else ing = `<div class="list"><div class="rc-empty">${R('no_ing')}</div></div>`;
  const l = L();
  const method = v.steps.length ? `<div class="list">${v.steps.map(s => {
      const title = (l === 'it' && s.title_it) || (l === 'es' && s.title_es) || s.title || '';
      const body = (l === 'it' && s.instruction_it) || (l === 'es' && s.instruction_es) || s.instruction_en || s.instruction_it || '';
      const tm = num(s.timer_seconds) > 0 ? `<br><span class="muted" style="font-size:15px">⏱ ${Math.floor(s.timer_seconds / 60)}:${String(s.timer_seconds % 60).padStart(2, '0')}</span>` : '';
      return `<div class="step"><span class="n">${s.step_number}</span><span>${title ? `<b>${esc(title)}</b><br>` : ''}${esc(body)}${tm}</span></div>`; }).join('')}</div>`
    : (() => { const p = (l === 'it' && v.rec.procedure) || (l === 'es' && v.rec.procedure_es) || v.rec.procedure_en || v.rec.procedure || '';
        return p ? `<div class="list"><div class="pre rc-proc">${esc(p)}</div></div>` : `<div class="list"><div class="rc-empty">${R('no_method')}</div></div>`; })();
  return `<section><div class="chap"><h2>${R('ingredients')}</h2><span>${esc(amountLabel(v))}</span></div>${ing}${f !== 1 ? `<p class="note rc-small">${R('scaled_note')}</p>` : ''}</section>
    <section><h2>${R('method')}</h2>${method}</section>
    ${v.rec.equipment ? `<section><h2>Equipment</h2><div class="list"><div class="pre rc-proc">${esc(v.rec.equipment)}</div></div></section>` : ''}`;
}

/* ---- COST view: numbers only from FC05 ---- */
const ISSUE = {
  prezzo_mancante: ['Missing price', 'Prezzo mancante', 'Falta precio'], conversione_mancante: ['Missing conversion', 'Conversione mancante', 'Falta conversión'],
  prezzo_in_conflitto: ['Price conflicts with the invoice', 'Prezzo in conflitto con la fattura', 'Precio en conflicto con la factura'], unita_sospetta: ['Unit to review', 'Unità da rivedere', 'Unidad a revisar'],
  resa_mancante: ['The sub-recipe has no yield', 'La sotto-ricetta non dichiara la resa', 'La sub-receta no declara rendimiento'], ciclo: ['The recipe contains itself', 'La ricetta contiene se stessa', 'La receta se contiene a sí misma'],
  distinta_vuota: ['Empty bill of materials', 'Distinta vuota', 'Lista vacía'], porzioni_in_conflitto: ['Portions in conflict', 'Porzioni in conflitto', 'Porciones en conflicto'],
  resa_non_dichiarata: ['Yield not declared', 'Resa non dichiarata', 'Rendimiento no declarado'], ricetta_inesistente: ['Recipe does not exist', 'Ricetta inesistente', 'Receta inexistente'],
  sotto_ricetta_incompleta: ['Sub-recipe with incomplete cost', 'Sotto-ricetta con costo incompleto', 'Sub-receta con costo incompleto'], escluso_non_alimentare: ['Excluded: non-food', 'Escluso: non alimentare', 'Excluido: no alimentario'],
};
const issue = c => ISSUE[c] ? ISSUE[c][{ en: 0, it: 1, es: 2 }[L()]] : c;
const CLASS = { A: ['a', ['invoice', 'fattura', 'factura']], B: ['b', ['chef price', 'prezzo dello chef', 'precio del chef']], C: ['c', ['no invoice', 'senza fattura', 'sin factura']] };
function costState(b) {
  const s = b.semaforo || {};
  return { colore: s.colore, complete: !!b.complete, known: num(b.totals?.known), stimato: num(s.costo_stimato), porzione: num(b.cost_per_portion),
    stimatoPorz: num(s.costo_porzione), parte: num(s.parte_stimata), motivo: s.motivo || '', yieldQty: num(b.yield?.qty), yieldDim: b.yield?.dim || null, conflict: b.portions?.conflict || null };
}
function verdict(st, v) {
  const f = v.factor, amount = amountLabel(v);
  const cat = /catering/i.test((v.rec.menu_group || '') + ' ' + (v.rec.category || ''));
  const perUnit = tot => { if (st.yieldQty > 0 && tot != null) { const u = st.yieldDim === 'volume' ? R('c_per_l') : st.yieldDim === 'mass' ? R('c_per_kg') : null; if (u) return [u, money(tot / st.yieldQty * 1000)]; } return null; };
  const motivo = st.motivo ? st.motivo.charAt(0).toUpperCase() + st.motivo.slice(1) + '. ' : '';   // FC05 reason text, as written by the engine
  let cls, lbl, why, boxes;
  if (st.colore === 'VERDE' && st.complete && st.known != null) {
    cls = 'ok'; lbl = R('c_ok'); why = R('c_ok_why');
    boxes = [[R('c_total', { x: amount }), money(st.known * f)], (st.porzione != null ? [R('c_portion'), money(st.porzione)] : perUnit(st.known)) || [R('c_portion'), null, st.conflict ? R('c_conflict') : R('c_no_portions')]];
  } else if (st.colore === 'GIALLO' && st.stimato != null) {
    cls = 'est'; lbl = R('c_est'); why = motivo + R('c_est_part', { x: money((st.parte || 0) * f) });
    boxes = [[R('c_total_est', { x: amount }), money(st.stimato * f)], (st.stimatoPorz != null ? [R('c_portion_est'), money(st.stimatoPorz)] : perUnit(st.stimato)) || [R('c_portion'), null, R('c_no_portions')]];
  } else {
    cls = 'bad'; lbl = R('c_bad'); why = motivo + R('c_bad_why');
    boxes = [[R('c_known', { x: amount }), st.known > 0 ? money(st.known * f) : null, R('c_none_known')], [R('c_portion'), null, R('c_not_calc')]];
  }
  const box = ([l, val, alt]) => `<div><span>${esc(l)}</span>${val != null ? `<b class="num">${val}</b>` : `<b class="unk">${esc(alt)}</b>`}</div>`;
  return `<div class="rc-state ${cls}"><div class="rc-lbl">${lbl}</div><div class="rc-money">${boxes.map(box).join('')}</div><div class="rc-why">${esc(why)}</div>${cat ? `<div class="rc-src">${R('c_cat10')}</div>` : ''}</div>`;
}
function priceText(l) {
  const p = l.price; if (!p) return '';
  let u;
  if (p.basis === 'count' || l.note === 'prezzo al pezzo') u = p.cost_per_each != null ? `${money(p.cost_per_each, 4)} / ${R('per_each')}` : '';
  else if (/^prezzo al ml/.test(l.note || '') && p.cost_per_100ml != null) u = `${money(p.cost_per_100ml, 4)} / 100 ml`;
  else if (p.cost_per_100 != null) u = `${money(p.cost_per_100, 4)} / 100 ${p.basis === 'volume' ? 'ml' : 'g'}`;
  const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(p.invoice_date || ''), cl = CLASS[p.class];
  return [u, p.vendor, d ? `${d[2]}/${d[3]}/${d[1].slice(2)}` : ''].filter(Boolean).map(esc).join(' · ') + (cl ? `<span class="rc-badge ${cl[0]}">${cl[1][{ en: 0, it: 1, es: 2 }[L()]]}</span>` : '');
}
function costLine(l, v) {
  const f = v.factor, q = scaleQty(l.qty, l.unit, f).text;
  const probl = l.status !== 'ok' && l.status !== 'escluso_non_alimentare' ? `<small class="bad">${esc(issue(l.status))}${l.note ? ': ' + esc(l.note) : ''}</small>` : '';
  if (l.kind === 'sotto_ricetta') {
    const idx = v.bom.findIndex(r => r.bom_id === l.bom_id);
    const right = l.status === 'ok' && l.cost != null ? `<b class="num">${money(l.cost * f)}</b>`
      : l.status === 'sotto_ricetta_incompleta' && l.cost != null ? `<b class="num unk">${money(l.cost * f)}<small>${R('c_partial')}</small></b>` : `<b class="unk">?<small>${R('c_unknown')}</small></b>`;
    const frac = num(l.fraction) != null ? `<small>${R('c_of_sub', { x: lots(l.fraction * f) })}</small>` : '';
    const sem = l.child_semaforo ? `<span class="rc-badge ${l.child_semaforo === 'VERDE' ? 'a' : l.child_semaforo === 'GIALLO' ? 'b' : 'x'}">${l.child_semaforo === 'VERDE' ? R('c_reliable') : l.child_semaforo === 'GIALLO' ? R('c_with_est') : R('c_unreliable')}</span>` : '';
    return `<${idx >= 0 ? `button data-a="openSub" data-i="${idx}"` : 'div'} class="ing rc-it"><span class="rc-grow">${esc(l.name || '—')} · ${esc(q)}<span class="rc-badge">${R('prep_badge')}</span>${sem}${frac}${probl}</span>${right}${idx >= 0 ? '<span class="chev">›</span>' : ''}</${idx >= 0 ? 'button' : 'div'}>`;
  }
  const right = l.status === 'ok' && l.class === 'zero' ? `<b class="num">${money(0)}<small>${R('c_zero')}</small></b>`
    : l.status === 'ok' && l.cost != null ? `<b class="num">${money(l.cost * f)}</b>`
    : l.status === 'escluso_non_alimentare' ? `<b>—<small>${R('c_nonfood')}</small></b>`
    : l.stima && num(l.stima.centrale) != null ? `<b class="num est">~${money(l.stima.centrale * f)}<small>${R('c_estimate')}</small></b>` : `<b class="unk">?<small>${R('c_unknown')}</small></b>`;
  const price = priceText(l), conv = l.status === 'ok' && l.note && l.note !== 'prezzo al pezzo' ? `<small>${esc(l.note)}</small>` : '';
  return `<div class="ing rc-it"><span class="rc-grow">${esc(l.name || '—')} · ${esc(q)}${price ? `<small>${price}</small>` : ''}${conv}${probl}</span>${right}</div>`;
}
function issuesHtml(b, v) {
  const root = (b.title || v.rec.title || '') + ' > ', seen = new Set(), out = [];
  (b.issues || []).forEach(i => {
    const k = [i.code, i.path, i.component, i.qty, i.unit].join('|'); if (seen.has(k)) return; seen.add(k);
    const where = i.path && i.path.startsWith(root) ? i.path.slice(root.length) : '';
    const what = i.component ? `${i.component}${i.qty != null ? ` · ${N(num(i.qty), 2)} ${i.unit || ''}` : ''}` : '';
    out.push({ bad: i.code !== 'porzioni_in_conflitto' && i.code !== 'resa_non_dichiarata', t: issue(i.code), d: [what, where, i.detail].filter(Boolean).join(' — ') });
  });
  if (!out.length) return '';
  return `<section><h2>${R('c_to_fix', { x: out.length })}</h2><div class="list">${out.map(x => `<div class="rc-issue"><div class="rc-ic${x.bad ? '' : ' w'}">!</div><div><b>${esc(x.t)}</b>${x.d ? `<span>${esc(x.d)}</span>` : ''}</div></div>`).join('')}</div></section>`;
}
function costView(v, cost) {
  if (cost === undefined) return `<p class="note">${R('c_loading')}</p>`;
  if (!cost || !cost.breakdown) return `<div class="err">${R('c_error')}</div>`;
  const b = cost.breakdown, lines = (b.lines || []).map(l => costLine(l, v)).join('');
  return `${verdict(costState(b), v)}${issuesHtml(b, v)}
    <section><div class="chap"><h2>${R('c_where', { x: '' }).replace(' · ', '')}</h2><span>${esc(amountLabel(v))}</span></div>${lines ? `<div class="list">${lines}</div>` : `<div class="list"><div class="rc-empty">${R('no_ing')}</div></div>`}</section>
    <p class="rc-src">${R('c_src')}${(b.lines || []).some(l => l.price?.invoice_date) ? R('c_src_inv') : ''}.</p>`;
}

/* ---- STRUCTURE view ---- */
function structAnalysis(v, tree) {
  const problems = [], preps = new Map();
  const addP = (t, bad = true) => { if (!problems.some(p => p.t === t)) problems.push({ t, bad }); };
  const prepName = id => (tree.preps.find(p => p.id === id) || {}).name;
  const walk = (recId, recTitle, rows, factor, path, depth) => {
    rows.forEach(row => {
      const u = unit(row.unit), where = depth ? ` («${recTitle}»)` : '';
      if (row.component_type !== 'RECIPE') {
        const name = ingName(row);
        if (num(row.quantity) === null || num(row.quantity) === 0) addP(R('p_qty', { n: name, w: where }));
        else if (u.fam === 'unknown') addP(R('p_unit', { n: name, u: row.unit, w: where }), false);
        if (row.prep_task_id != null && !prepName(row.prep_task_id)) addP(R('p_prepgone', { n: name, w: where }));
        if (depth === 0 && row.prep_task_id != null && prepName(row.prep_task_id))
          preps.set('item:' + row.bom_id, { item: true, name, need: factor != null ? scaleQty(row.quantity, row.unit, factor).text : null, prep: prepName(row.prep_task_id), depth: 0 });
        return;
      }
      const sub = row.recipes;
      if (!row.sub_recipe_id || !sub) { addP(R('p_linegone', { w: where })); return; }
      if (path.includes(row.sub_recipe_id)) { addP(R('p_self', { n: sub.title })); return; }
      const y = yieldBase(sub), sf1 = subFactor(row.quantity, row.unit, 1, sub);
      if (!sf1.ok) addP(y.mode === 'batches' ? R('p_yunk', { n: sub.title }) : R('p_noconv', { n: sub.title, x: sf1.why, w: where }));
      const lt = sf1.ok && factor != null ? sf1.factor * factor : null, prev = preps.get(row.sub_recipe_id);
      if (prev) { prev.lots = prev.lots != null && lt != null ? prev.lots + lt : null; if (depth > prev.depth) prev.depth = depth; }
      else preps.set(row.sub_recipe_id, { id: row.sub_recipe_id, name: sub.title, sub, lots: lt, depth, via: depth ? recTitle : null });
      const kids = tree.byParent[row.sub_recipe_id];
      if (kids && !kids.length) addP(R('p_noing', { n: sub.title }));
      if (kids) walk(row.sub_recipe_id, sub.title, kids, lt, [...path, row.sub_recipe_id], depth + 1);
    });
  };
  walk(v.rec.id, v.rec.title, tree.byParent[v.rec.id] || v.bom, v.factor, [v.rec.id], 0);
  if (v.yb.mode === 'batches') addP(R('yield_none'));
  if (!v.bom.length) addP(R('no_ing'));
  return { problems, preps: [...preps.values()] };
}
function structView(v, tree) {
  const f = v.factor, rec = v.rec, y = v.yb;
  const st = tree === undefined ? `<div class="rc-state"><div class="rc-lbl">${R('s_reading')}</div></div>` : !tree ? `<div class="rc-state bad"><div class="rc-lbl">● ${R('s_err')}</div></div>` : null;
  const an = tree ? structAnalysis(v, tree) : { problems: [], preps: [] };
  const state = st || (an.problems.length ? `<div class="rc-state ${an.problems.some(p => p.bad) ? 'bad' : 'est'}"><div class="rc-lbl">${R('s_fix', { x: an.problems.length })}</div><div class="rc-why">${R('s_fix_why')}</div></div>`
    : `<div class="rc-state ok"><div class="rc-lbl">${R('s_ok')}</div><div class="rc-why">${R('s_ok_why')}</div></div>`);
  const bw = num(rec.base_weight_g), bwAlt = !(bw > 0) && num(rec.base_weight) > 0 && /^(kg|g)$/i.test(rec.weight_unit || '') ? num(rec.base_weight) * (/kg/i.test(rec.weight_unit) ? 1000 : 1) : null;
  const yw = bw > 0 ? bw : bwAlt, sw = num(rec.serving_weight_g) || (String(rec.serving_unit || '').toLowerCase() === 'g' ? num(rec.serving_qty) : null);
  const kg = g => scaleQty(g, 'g', 1).text;
  const rows = [[R('s_batch'), yw > 0 ? kg(yw) : null, '', R('s_nr')], [R('s_portions'), y.mode === 'portions' ? N(Math.round(y.base * 10) / 10, 1) : null, y.from === 'weight' ? `${kg(yw)} ÷ ${kg(sw)}` : '', R('s_nr')],
    [R('s_pw'), sw > 0 ? kg(sw) : null, '', R('s_nr')]];
  if ((rec.yield_text || '').trim()) rows.push([R('s_ytext'), `«${rec.yield_text.trim()}»`, '', '']);
  rows.push([R('s_for', { x: amountLabel(v) }), yw > 0 ? kg(yw * f) : null, yw > 0 ? R('s_final') : '', R('s_nocalc')]);
  const resa = rows.map(([k, val, note, miss]) => `<div class="ing rc-it"><span class="rc-grow">${esc(k)}${note ? `<small>${esc(note)}</small>` : ''}</span>${val != null ? `<b>${esc(val)}</b>` : `<b class="unk"><small>${esc(miss)}</small></b>`}</div>`).join('');
  const comp = v.bom.map((row, i) => {
    const orig = scaleQty(row.quantity, row.unit, 1).text, now = scaleQty(row.quantity, row.unit, f).text;
    if (row.component_type === 'RECIPE' && row.sub_recipe_id) {
      const sf = subFactor(row.quantity, row.unit, f, row.recipes), yl = subYieldLabel(row.recipes);
      return `<button class="ing rc-it" data-a="openSub" data-i="${i}"><span class="rc-grow">${esc(ingName(row))}<span class="rc-badge">${R('s_sub')}</span><small>${esc(R('s_orig', { x: orig }))}</small><small${sf.ok ? '' : ' class="bad"'}>${esc(sf.ok ? R('s_need_lots', { y: yl, x: lots(sf.factor) }) : R('s_lots_nc', { y: yl }))}</small></span><b class="num">${esc(now)}</b><span class="chev">›</span></button>`;
    }
    return `<div class="ing rc-it"><span class="rc-grow">${esc(ingName(row))}<span class="rc-badge a">${R('s_ing')}</span><small>${esc(R('s_orig', { x: orig }))}</small></span><b class="num">${esc(now)}</b></div>`;
  }).join('');
  const todo = an.preps.slice().sort((a, b) => b.depth - a.depth).map(p => {
    if (p.item) return `<div class="ing rc-it"><span class="rc-grow">${esc(p.name)}<small>prep: ${esc(p.prep)}</small></span><b>${esc(p.need || '?')}</b></div>`;
    const bwS = num(p.sub.base_weight_g), yS = yieldBase(p.sub);
    const need = p.lots == null ? null : bwS > 0 ? scaleQty(p.lots * bwS, 'g', 1).text : yS.mode === 'portions' ? `${N(Math.round(p.lots * yS.base * 10) / 10, 1)} ${R('portions').toLowerCase()}` : null;
    return `<button class="ing rc-it" data-a="openSubId" data-r="${esc(p.id)}" data-f="${p.lots ?? ''}"><span class="rc-grow">${esc(p.name)}<small${p.lots == null ? ' class="bad"' : ''}>${esc(p.lots != null ? `${lots(p.lots)} · ${subYieldLabel(p.sub)}` : R('s_lots_nc', { y: subYieldLabel(p.sub) }))}</small>${p.via ? `<small>${esc(R('s_for_parent', { x: p.via }))}</small>` : ''}</span><b class="${need ? 'num' : 'unk'}">${need ? esc(need) : '?'}</b><span class="chev">›</span></button>`;
  }).join('');
  const probs = an.problems.map(p => `<div class="rc-issue"><div class="rc-ic${p.bad ? '' : ' w'}">!</div><div><b>${esc(p.t)}</b></div></div>`).join('');
  return `${state}
    <section><h2>${R('s_yield')}</h2><div class="list">${resa}</div></section>
    <section><h2>${esc(R('s_comp', { x: amountLabel(v) }))}</h2><div class="list">${comp || `<div class="rc-empty">${R('no_ing')}</div>`}</div></section>
    ${tree ? `<section><h2>${esc(R('s_todo', { x: amountLabel(v) }))}</h2><div class="list">${todo || `<div class="rc-empty">${R('s_none_todo')}</div>`}</div></section>` : ''}
    ${probs ? `<section><h2>${R('s_probs', { x: an.problems.length })}</h2><div class="list">${probs}</div></section>` : ''}`;
}

function notes(v) {
  const y = v.yb;
  return (v.subWarn ? `<div class="err rc-small">⚠ ${esc(v.subWarn)}</div>` : '') + (y.from === 'weight' ? `<p class="note rc-small">${R('yield_from_weight')}</p>`
    : y.mode === 'batches' && y.text ? `<p class="note rc-small">${esc(R('yield_text_only', { x: y.text }))}</p>` : y.mode === 'batches' ? `<p class="note rc-small">${R('yield_none')}</p>` : '');
}
function headMeta(v) {
  const y = v.yb, orig = y.mode === 'portions' ? `${N(Math.round(y.base * 10) / 10, 1)} ${R('portions').toLowerCase()}` : y.mode === 'weight' ? R('batch_of', { x: N(y.base / 1000, 2) }) : R('no_yield');
  return [v.rec.menu_group || v.rec.category || '', y.mode === 'batches' ? R('no_yield') : R('recipe_of', { x: orig })].filter(Boolean).join(' · ');
}
function written(rec) {
  const a = Array.isArray(rec.ingredients) ? rec.ingredients : [];
  return a.map(i => typeof i === 'string' ? { name: i } : i && typeof i === 'object' ? { type: i.type, name: i.name || i.title || '', qty: i.qty ?? i.quantity, unit: i.unit, comment: i.comment || i.note } : null).filter(Boolean);
}

window.RecipeCard = {
  /* model for a tab: d = server payload; p = tab params {factor, tab, subWarn} */
  model(d, p) { return { rec: d.recipe, bom: d.bom || [], steps: d.steps || [], written: written(d.recipe), yb: yieldBase(d.recipe), factor: num(p.factor) > 0 ? num(p.factor) : 1, tab: p.tab || 'prep', subWarn: p.subWarn || null, canCost: !!d.can_cost }; },
  tabs(v) { return v.canCost ? ['prep', 'cost', 'struct'] : ['prep', 'struct']; },
  segHtml(v) { const ks = this.tabs(v); return `<div class="seg rc-seg">${ks.map(k => `<button class="${v.tab === k ? 'on' : ''}" data-a="rcTab" data-k="${k}">${R(k)}</button>`).join('')}</div>`; },
  amountHtml, headMeta, notes, prepView, costView, structView, amountLabel,
  setAmount(v, value) { const a = num(value); if (!(a > 0)) return null; return Math.min(factorFor(v.yb, a), 10000); },
  subFor(v, i) { const row = v.bom[i]; if (!row || !row.sub_recipe_id) return null;
    const sf = subFactor(row.quantity, row.unit, v.factor, row.recipes), need = scaleQty(row.quantity, row.unit, v.factor).text;
    return { id: row.sub_recipe_id, name: row.recipes?.title || '', factor: sf.ok ? sf.factor : 1, warn: sf.ok ? null : `“${v.rec.title}”: ${need} — ${sf.why}` }; },
  R, _: { scaleQty, yieldBase, subFactor, range, amountOf, factorFor },
};
})();
