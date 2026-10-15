/* Brigade 2.0 — Recipe completeness + ingredient cards (B-25 module 2, from Shell V020). Read only.
   Grouping and the Chef-only filter of vendors/prices are done on the server (supabase/functions/_shared/kitchen_core.js).
   Screens: 'ings' (all ingredients), 'ing' (one ingredient), 'complete' (Chef only, in the Ufficio). */
(function () {
  const I = window.I18N, t = I.t;
  I.extend({
    k_ings: ['Ingredients', 'Ingredienti', 'Ingredientes'], k_ing: ['Ingredient', 'Ingrediente', 'Ingrediente'],
    k_in_brigade: ['{n} in Brigade', '{n} in Brigade', '{n} en Brigade'], k_find: ['Find an ingredient', 'Cerca un ingrediente', 'Buscar un ingrediente'],
    k_show_all: ['Show all {n}', 'Mostra tutti ({n})', 'Mostrar todos ({n})'], k_show: ['Show {n}', 'Mostra {n}', 'Mostrar {n}'],
    k_vendors: [['vendor', 'vendors'], ['fornitore', 'fornitori'], ['proveedor', 'proveedores']], k_no_vendor: ['no vendor', 'nessun fornitore', 'sin proveedor'],
    k_dno: ['Do not order', 'Non ordinare', 'No pedir'], k_inactive: ['Inactive', 'Non attivo', 'Inactivo'],
    k_base_unit: ['Base unit', 'Unità base', 'Unidad base'], k_measured: ['Measured by', 'Si misura a', 'Se mide por'], k_each: ['Each ≈', 'Un pezzo ≈', 'Una pieza ≈'], k_yield: ['Yield', 'Resa', 'Rendimiento'],
    k_m_weight: ['weight', 'peso', 'peso'], k_m_volume: ['volume', 'volume', 'volumen'], k_m_count: ['pieces', 'pezzi', 'piezas'], k_m_each: ['pieces', 'pezzi', 'piezas'],
    k_vend_prices: ['Vendors and prices', 'Fornitori e prezzi', 'Proveedores y precios'], k_no_vend: ['No vendor in Brigade.', 'Nessun fornitore in Brigade.', 'Ningún proveedor en Brigade.'],
    k_last_inv: ['last invoice {d}', 'ultima fattura {d}', 'última factura {d}'], k_each_price: ['{p} each', '{p} al pezzo', '{p} la pieza'],
    k_used_in: ['Used in', 'Usato in', 'Usado en'], k_prep: ['Prep', 'Prep', 'Prep'], k_not_used: ['No recipe in Brigade uses it.', 'Nessuna ricetta di Brigade lo usa.', 'Ninguna receta de Brigade lo usa.'],
    k_ro: ['Read only: ingredients and prices are edited in Brigade.', 'Sola lettura: ingredienti e prezzi si modificano in Brigade.', 'Solo lectura: ingredientes y precios se editan en Brigade.'],
    k_open_brigade: ['Open Brigade', 'Apri Brigade', 'Abrir Brigade'], k_nf: ['Ingredient not found in Brigade.', 'Ingrediente non trovato in Brigade.', 'Ingrediente no encontrado en Brigade.'],
    k_nothing: ['Nothing for “{q}”.', 'Niente per “{q}”.', 'Nada para “{q}”.'],
    // completeness (V020 r-complete)
    k_complete: ['Recipe completeness', 'Completezza ricette', 'Completitud de recetas'],
    k_complete_sub: ['Not urgent. Nothing here counts as a decision.', 'Non urgente. Niente qui conta come decisione.', 'No es urgente. Nada aquí cuenta como decisión.'],
    k_complete_row: ['{n} recipes to complete: photos, procedures, portions', '{n} ricette da completare: foto, procedimenti, porzioni', '{n} recetas por completar: fotos, procedimientos, porciones'],
    k_c_deferred: ['Deferred by Chef — to complete', 'Rimandate dallo Chef — da completare', 'Pospuestas por Chef — por completar'],
    k_c_photo: ['Missing photo', 'Manca la foto', 'Falta la foto'], k_c_procedure: ['Missing procedure', 'Manca il procedimento', 'Falta el procedimiento'], k_c_portions: ['Portions per batch not set', 'Porzioni per lotto non impostate', 'Porciones por lote sin definir'],
    k_w_deferred: ['Known and still open: the yield is not decided yet. Kept out of Today on purpose; nothing was filled in.', 'Note e ancora aperte: la resa non è ancora decisa. Tenute fuori da Oggi apposta; non è stato compilato nulla.', 'Conocidas y aún abiertas: el rendimiento no está decidido. Fuera de Hoy a propósito; no se rellenó nada.'],
    k_w_photo: ['Helps the team recognise the plate.', 'Aiuta la brigata a riconoscere il piatto.', 'Ayuda al equipo a reconocer el plato.'],
    k_w_procedure: ['Helps a new cook make it the same way.', 'Aiuta un cuoco nuovo a farlo allo stesso modo.', 'Ayuda a un cocinero nuevo a hacerlo igual.'],
    k_w_portions: ['Optional. The batch size is set; portions help plan prep from sales.', 'Facoltativo. Il peso del lotto c\'è; le porzioni aiutano a pianificare la prep dalle vendite.', 'Opcional. El lote está definido; las porciones ayudan a planificar la prep según ventas.'],
    k_photo: ['Photo', 'Foto', 'Foto'], k_no_photo: ['No photo in Brigade yet.', 'Ancora nessuna foto in Brigade.', 'Aún no hay foto en Brigade.'],
    k_fix_deferred: ['To complete: yield deferred by Chef', 'Da completare: resa rimandata dallo Chef', 'Por completar: rendimiento pospuesto por Chef'],
    k_fix_photo: ['To complete: the photo is missing', 'Da completare: manca la foto', 'Por completar: falta la foto'],
    k_fix_procedure: ['To complete: the procedure is missing', 'Da completare: manca il procedimento', 'Por completar: falta el procedimiento'],
    k_fix_portions: ['To complete: portions per batch not set', 'Da completare: porzioni per lotto non impostate', 'Por completar: porciones por lote sin definir'],
    k_fix_edit: ['Edit (test copy)', 'Modifica (copia di prova)', 'Editar (copia de prueba)'], k_fix_photo_where: ['Photos are added in Brigade.', 'Le foto si aggiungono in Brigade.', 'Las fotos se añaden en Brigade.'],
    k_c_ro: ['Add photos and procedures in Brigade.', 'Foto e procedimenti si aggiungono in Brigade.', 'Fotos y procedimientos se añaden en Brigade.'],
  });
  const BRIGADE_URL = 'https://1cos.github.io/back-of-house/';
  let H = null;   // helpers from app.js: { esc, need, waiting, backBtn, head, shortDay, isChef, cat }
  const money = v => v == null ? '' : '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmt = v => v == null ? '' : (Math.round(v * 100) / 100).toLocaleString(I.locale(), { maximumFractionDigits: 2 });
  const local = i => (I.lang === 'it' && i.name_it) || (I.lang === 'es' && i.name_es) || '';
  const roNote = k => `<p class="note" style="font-size:14px">${t(k)} <a class="lnk" href="${BRIGADE_URL}" target="_blank" rel="noopener">${t('k_open_brigade')} ↗</a></p>`;

  const screens = {
    ings: { title: () => t('k_ings'), c: '--rest', render(p) {
      const { esc } = H, d = H.need('ingredients', null, 10 * 60000);
      if (!d) return `<div class="page">${H.backBtn()}${H.waiting('ingredients')}</div>`;
      const q = (p.q || '').trim().toLowerCase(), all = d.ingredients;
      const list = all.filter(i => !q || [i.name, i.name_it, i.name_es].some(x => String(x || '').toLowerCase().includes(q)));
      const shown = p.all || q ? list : list.slice(0, 80);
      const row = i => { const sub = local(i), meta = [sub, H.cat(i.category), H.isChef() ? (i.vendors ? I.plural(i.vendors, 'k_vendors') : t('k_no_vendor')) : '', i.active ? '' : t('k_inactive')].filter(Boolean);
        return `<button class="row" data-a="openIng" data-id="${esc(i.id)}"><span class="main"><div class="name">${esc(i.name)}</div><div class="meta">${esc(meta.join(' · '))}</div></span>${i.dno ? `<span class="right wtx">${t('k_dno')}</span>` : ''}<span class="chev">›</span></button>`; };
      return `<div class="page" style="--c:var(--rest)">${H.backBtn()}${H.head(t('w_rest'), t('k_ings'), t('k_in_brigade', { n: all.length }))}
        <input id="q" class="search" type="search" placeholder="${esc(t('k_find'))}" value="${esc(p.q || '')}" autocomplete="off" enterkeyhint="search">
        <div class="list">${shown.map(row).join('') || `<div class="row"><span class="main"><div class="meta">${esc(t('k_nothing', { q }))}</div></span></div>`}
        ${shown.length < list.length ? `<button class="more" data-a="kMore" data-k="all">${t('k_show_all', { n: list.length })}</button>` : ''}</div>
        ${roNote('k_ro')}</div>`;
    }, search: true },
    ing: { title: p => { const d = H.peek('ingredient', { id: p.id }); return d ? d.ingredient.name : (p.name || t('k_ing')); }, c: '--rest', render(p) {
      const { esc } = H, d = H.need('ingredient', { id: p.id }, 10 * 60000);
      if (!d) return `<div class="page">${H.backBtn()}${H.waiting('ingredient')}</div>`;
      const i = d.ingredient, sub = local(i);
      const facts = [i.base_unit && `<span>${t('k_base_unit')} <b>${esc(i.base_unit)}</b></span>`, i.measure_type && `<span>${t('k_measured')} <b>${esc(t('k_m_' + i.measure_type) === 'k_m_' + i.measure_type ? i.measure_type : t('k_m_' + i.measure_type))}</b></span>`,
        i.avg_unit_weight_g && `<span>${t('k_each')} <b>${fmt(i.avg_unit_weight_g)} g</b></span>`, i.yield_factor && `<span>${t('k_yield')} <b>${fmt(i.yield_factor)}</b></span>`, !i.active && `<span class="wtx">${t('k_inactive')}</span>`].filter(Boolean).join('');
      const vend = d.can_price ? `<section><h2>${t('k_vend_prices')}</h2><div class="list">${(d.vendors || []).map(v => `<div class="row"><span class="main"><div class="name">${esc(v.vendor)}${v.sku ? ` <span class="muted" style="font-size:14px">#${esc(v.sku)}</span>` : ''}</div><div class="meta">${[v.pack ? esc(v.pack) : '', v.last_invoice_date ? t('k_last_inv', { d: H.shortDay(v.last_invoice_date) }) : '', v.price_per_100g != null ? money(v.price_per_100g) + '/100 g' : '', v.price_per_each != null ? t('k_each_price', { p: money(v.price_per_each) }) : ''].filter(Boolean).join(' · ')}</div>${v.do_not_order ? `<div class="meta wtx">${t('k_dno')}${v.do_not_order_reason ? ': ' + esc(v.do_not_order_reason) : ''}</div>` : ''}</span><span class="qty num" style="font-size:20px">${money(v.unit_price)}</span></div>`).join('') || `<div class="row"><span class="main"><div class="meta">${t('k_no_vend')}</div></span></div>`}</div></section>` : '';
      return `<div class="page" style="--c:var(--rest)">${H.backBtn()}${H.head(t('k_ing') + (i.category ? ' · ' + esc(H.cat(i.category)) : ''), esc(i.name), sub ? esc(sub) : '')}
        ${facts ? `<div class="facts">${facts}</div>` : ''}${i.notes ? `<p class="note">${esc(i.notes)}</p>` : ''}
        ${vend}
        <section><div class="chap"><h2>${t('k_used_in')}</h2><span>${d.used_in.length || ''}</span></div><div class="list">${d.used_in.map(r => `<button class="row" data-a="openRecipe" data-r="${esc(r.id)}"><span class="main"><div class="name">${esc(r.title)}</div></span><span class="chev">›</span></button>`).join('') || `<div class="row"><span class="main"><div class="meta">${t('k_not_used')}</div></span></div>`}</div></section>
        ${d.preps.length ? `<section><h2>${t('k_prep')}</h2><div class="list">${d.preps.map(x => `<button class="row" data-a="openPrep" data-id="${x.id}"><span class="main"><div class="name">${esc(x.name)}</div></span><span class="chev">›</span></button>`).join('')}</div></section>` : ''}
        ${roNote('k_ro')}</div>`;
    } },
    complete: { title: () => t('k_complete'), c: '--office', render(p) {
      const { esc } = H;
      if (!H.isChef()) return `<div class="page">${H.backBtn()}<p class="note">${t('chef_only')}</p></div>`;
      const d = H.need('completeness', null, 5 * 60000);
      if (!d) return `<div class="page">${H.backBtn()}${H.waiting('completeness')}</div>`;
      const sec = k => { const l = d.groups[k] || []; if (!l.length) return '';
        return `<section><div class="chap"><h2>${t('k_c_' + k)}</h2><span>${l.length}</span></div><p class="note" style="margin:0 0 8px">${t('k_w_' + k)}</p><div class="list">${p['m_' + k] ? l.map(x => `<button class="row" data-a="openRecipe" data-r="${esc(x.id)}" data-focus="${FOCUS[k]}" data-fix="complete:${k}"><span class="main"><div class="name" style="font-weight:500;font-size:17px">${esc(x.title)}</div><div class="meta">${esc(H.cat(x.category))}</div></span><span class="chev">›</span></button>`).join('') : `<button class="more" data-a="kMore" data-k="m_${k}">${t('k_show', { n: l.length })}</button>`}</div></section>`; };
      return `<div class="page" style="--c:var(--office)">${H.backBtn()}${H.head(t('w_office'), t('k_complete'), t('k_complete_sub'))}
        ${['deferred', 'photo', 'procedure', 'portions'].map(sec).join('')}${roNote('k_c_ro')}</div>`;
    } },
  };
  /* completeness kind → the part of the recipe card to open and mark */
  const FOCUS = { procedure: 'procedure', photo: 'photo', portions: 'yield', deferred: 'yield' };
  /* box on top of the recipe opened from Completeness: what is missing, why, and Edit (not for photos) */
  function fixBox(kind, id, editing) {
    const { esc } = H;
    return `<div class="fixbox amber"><div class="h">${t('k_fix_' + kind)}</div><div>${t('k_w_' + kind)}</div>
      ${kind === 'photo' ? `<div>${t('k_fix_photo_where')}</div><div><a class="btn ghost" href="${BRIGADE_URL}" target="_blank" rel="noopener">${t('k_open_brigade')} ↗</a></div>`
        : editing ? '' : `<div><button class="btn" data-a="editRecipe" data-r="${esc(id)}">${t('k_fix_edit')}</button></div>`}</div>`;
  }
  /* Ufficio row (Chef) and Recipes row (everyone) */
  const completeRow = d => d && d.total ? `<div class="list"><button class="row" data-a="openComplete"><span class="main"><div class="name">${t('k_complete')}</div><div class="meta">${t('k_complete_row', { n: d.total })}</div></span><span class="chev">›</span></button></div>` : '';
  const ingsRow = d => `<div class="list"><button class="row" data-a="openIngs"><span class="main"><div class="name">${t('k_ings')}</div><div class="meta">${d ? t('k_in_brigade', { n: d.ingredients.length }) : '…'}</div></span><span class="chev">›</span></button></div>`;
  window.KitchenUI = { init(h) { H = h; }, screens, completeRow, ingsRow, fixBox, FOCUS };
})();
