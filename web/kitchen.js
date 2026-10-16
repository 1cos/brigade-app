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
    // Knowledge Engine (B-51 phase 1)
    kn_v: ['Verified', 'Verificato', 'Verificado'], kn_e: ['Estimated', 'Stima', 'Estimado'], kn_m: ['Missing', 'Manca', 'Falta'],
    kn_buy: ['Buying', 'Acquisto', 'Compra'], kn_pack: ['Pack', 'Confezione', 'Empaque'], kn_pack_price: ['Pack price', 'Prezzo confezione', 'Precio del empaque'],
    kn_each: ['Price each', 'Prezzo al pezzo', 'Precio por pieza'], kn_cost_price: ['Price used for cost', 'Prezzo usato per il costo', 'Precio usado para el costo'],
    kn_per_g: ['per 100 g', 'per 100 g', 'por 100 g'], kn_conv: ['Conversions', 'Conversioni', 'Conversiones'], kn_piece: ['One piece', 'Un pezzo', 'Una pieza'], kn_density: ['Density', 'Densità', 'Densidad'],
    kn_recipes: ['In recipes', 'Nelle ricette', 'En recetas'], kn_lot: ['per batch', 'per lotto', 'por lote'], kn_portion: ['per portion', 'a porzione', 'por porción'],
    kn_dishes: ['Dishes sold · last {n} days', 'Piatti venduti · ultimi {n} giorni', 'Platos vendidos · últimos {n} días'], kn_sold: ['{n} sold', '{n} venduti', '{n} vendidos'],
    kn_use: ['Use and purchases · last {n} days', 'Consumo e acquisti · ultimi {n} giorni', 'Consumo y compras · últimos {n} días'],
    kn_theo: ['Used, from sales × recipes', 'Usato, da vendite × ricette', 'Usado, de ventas × recetas'], kn_bought: ['Bought, from invoices', 'Comprato, da fatture', 'Comprado, de facturas'],
    kn_stock: ['Stock', 'Scorta', 'Stock'], kn_inv: ['Recent invoices', 'Ultime fatture', 'Últimas facturas'], kn_no_number: ['no number', 'senza numero', 'sin número'],
    kn_amount: ['= {q}', '= {q}', '= {q}'], kn_policy: ['Cost rule', 'Regola di costo', 'Regla de costo'], kn_nodish: ['No dish that uses it has a POS name.', 'Nessun piatto che lo usa ha un nome POS.', 'Ningún plato que lo usa tiene nombre POS.'],
    kn_ro: ['Read only. Every value shows where it comes from; nothing is filled in by guess.', 'Sola lettura. Ogni valore dice da dove viene; niente è riempito a caso.', 'Solo lectura. Cada valor dice de dónde viene; nada se rellena adivinando.'],
    kn_gaps: ['Ingredients to complete', 'Ingredienti da completare', 'Ingredientes por completar'], kn_gaps_sub: ['Packs, weights, vendors, prices, POS links', 'Confezioni, pesi, fornitori, prezzi, collegamenti POS', 'Empaques, pesos, proveedores, precios, enlaces POS'],
    kn_g_no_vendor: ['Used in recipes, no vendor', 'Usati nelle ricette, senza fornitore', 'Usados en recetas, sin proveedor'],
    kn_g_pack_unclear: ['Pack not readable as a number', 'Confezione non leggibile come numero', 'Empaque no legible como número'],
    kn_g_unit_mismatch: ['Purchase unit does not match the pack', 'Unità d\'acquisto diversa dalla confezione', 'Unidad de compra distinta del empaque'],
    kn_g_piece_estimate: ['Piece weight present, not approved', 'Peso a pezzo presente, non approvato', 'Peso por pieza presente, no aprobado'],
    kn_g_piece_missing: ['Used in pieces, no piece weight', 'Usati a pezzi, senza peso a pezzo', 'Usados por pieza, sin peso'],
    kn_g_density_missing: ['Used by volume, no density', 'Usati a volume, senza densità', 'Usados por volumen, sin densidad'],
    kn_g_price_missing: ['Vendor present, no usable price', 'Fornitore presente, nessun prezzo usabile', 'Proveedor presente, sin precio usable'],
    kn_g_inv: ['Invoice lines without ingredient · last 60 days', 'Righe di fattura senza ingrediente · ultimi 60 giorni', 'Líneas de factura sin ingrediente · últimos 60 días'],
    kn_g_nonum: ['{n} invoice lines have no number on the line (the number is often in the original document).', '{n} righe di fattura non hanno il numero sulla riga (spesso è nel documento originale).', '{n} líneas de factura no tienen número en la línea (a menudo está en el documento original).'],
    kn_g_pos: ['POS dishes without a recipe · last {n} days', 'Piatti POS senza ricetta · ultimi {n} giorni', 'Platos POS sin receta · últimos {n} días'],
    kn_g_pos_sub: ['{u} of {t} portions sold', '{u} di {t} porzioni vendute', '{u} de {t} porciones vendidas'],
    kn_g_ro: ['Nothing here is changed by the app. Fixes need the Chef\'s OK, one at a time.', 'L\'app qui non cambia niente. Le correzioni richiedono l\'OK dello Chef, una alla volta.', 'Aquí la app no cambia nada. Las correcciones requieren el OK del Chef, una a la vez.'],
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
    ing: { title: p => { const d = H.peek('knowledge', { id: p.id }); return d ? d.ingredient.name : (p.name || t('k_ing')); }, c: '--rest', render(p) {
      const { esc } = H, d = H.need('knowledge', { id: p.id }, 10 * 60000);
      if (!d) return `<div class="page">${H.backBtn()}${H.waiting('knowledge')}</div>`;
      const i = d.ingredient, sub = local(i);
      const st = x => x ? `<span class="kn ${x.s === 'verified' ? 'v' : x.s === 'estimated' ? 'e' : 'm'}">${t(x.s === 'verified' ? 'kn_v' : x.s === 'estimated' ? 'kn_e' : 'kn_m')}</span>` : '';
      const src = x => x && (x.src || x.why) ? `<div class="meta">${esc([x.src, x.why].filter(Boolean).join(' · '))}</div>` : '';
      const kv = (label, val, x, extra) => `<div class="row kvr"><span class="main"><div class="name">${esc(label)}</div>${src(x)}${extra || ''}</span><span class="right"><b class="num">${val == null || val === '' ? '—' : esc(String(val))}</b>${st(x)}</span></div>`;
      const sect = (h, body, n) => body ? `<section><div class="chap"><h2>${esc(h)}</h2><span>${n || ''}</span></div><div class="list">${body}</div></section>` : '';
      const q = (v, u) => v == null ? null : `${fmt(v)} ${u || ''}`.trim();
      // buying (Chef only: the server sends vendors, invoices and prices only to the Chef)
      const buy = (d.vendors_k || []).map(v => `<div class="row kvr kvstack"><span class="main"><div class="name">${esc(v.vendor)}${v.sku ? ` <span class="muted" style="font-size:14px">#${esc(v.sku)}</span>` : ''}</div>
          <div class="kvvals"><span>${t('kn_pack')} <b class="num">${esc(v.pack.v || v.pack_text || '—')}</b>${st(v.pack)}</span>${v.unit_price != null ? `<span>${t('kn_pack_price')} <b class="num">${money(v.unit_price)}</b></span>` : ''}${v.price_each ? `<span>${t('kn_each')} <b class="num">${money(v.price_each.v)}</b>${st(v.price_each)}</span>` : ''}</div>
          <div class="meta">${esc([v.pack_text && v.pack.v ? `“${v.pack_text}”` : '', v.pack.why, v.price_each ? v.price_each.src : '', v.last_invoice_date ? t('k_last_inv', { d: H.shortDay(v.last_invoice_date) }) : ''].filter(Boolean).join(' · '))}</div>
          ${v.checks.map(c => `<div class="meta knw">${esc(c.msg)}</div>`).join('')}${v.do_not_order ? `<div class="meta wtx">${t('k_dno')}</div>` : ''}</span></div>`).join('')
      // price used for cost (FC05): the price each and the per-gram price can have different trust, so two rows
      const pr = d.price ? (d.price.per_each != null ? kv(t('kn_cost_price') + ' · ' + t('kn_each').toLowerCase(), money(d.price.per_each), Object.assign({}, d.price, { why: null })) : '')
        + (d.price.per_g != null ? kv(t('kn_cost_price') + ' · ' + t('kn_per_g'), money(d.price.per_g * 100), d.price.per_g_status === 'estimated' ? { s: 'estimated', src: d.price.src, why: 'rests on a piece weight that is not approved' } : d.price) : '')
        + (d.price.per_each == null && d.price.per_g == null ? kv(t('kn_cost_price'), d.price.per_ml != null ? money(d.price.per_ml) + '/ml' : null, d.price) : '') : ''
      const pol = d.policy ? kv(t('kn_policy'), d.policy.v, d.policy) : ''
      const cv = d.conversions, conv = [(cv.needed.piece || cv.piece_g.v != null) ? kv(t('kn_piece'), q(cv.piece_g.v, 'g'), cv.piece_g) : '', (cv.needed.volume || cv.density.v != null) ? kv(t('kn_density'), cv.density.v != null ? cv.density.v + ' g/ml' : null, cv.density) : ''].join('')
      const recs = d.recipes.map(r => `<button class="row kvr" data-a="openRecipe" data-r="${esc(r.recipe_id)}"><span class="main"><div class="name">${esc(r.title)}</div>${r.unit_ok ? `<div class="meta wtx">${esc(r.unit_ok)}</div>` : src(r.per_portion.s !== 'verified' ? r.per_portion : null)}</span>
        <span class="right kvcol"><span><b class="num">${esc(q(r.qty, r.unit) || '—')}</b> <span class="muted">${t('kn_lot')}</span></span><span><b class="num">${esc(q(r.per_portion.v, r.unit) || '—')}</b> <span class="muted">${t('kn_portion')}</span>${r.per_portion.s !== 'verified' ? st(r.per_portion) : ''}</span></span><span class="chev">›</span></button>`).join('')
      const dishes = d.dishes.filter(x => x.sold).concat(d.dishes.filter(x => !x.sold)).map(x => `<button class="row kvr" data-a="openRecipe" data-r="${esc(x.recipe_id)}"><span class="main"><div class="name">${esc(x.title)}</div><div class="meta">${esc(x.paths[0] || '')}${x.why.length ? ' · ' + esc(x.why[0]) : ''}</div></span>
        <span class="right kvcol"><span><b class="num">${t('kn_sold', { n: fmt(x.sold) })}</b></span><span><b class="num">${esc(q(x.per_portion, x.unit) || '—')}</b> <span class="muted">${t('kn_portion')}</span>${x.status !== 'verified' ? st({ s: x.status }) : ''}</span></span><span class="chev">›</span></button>`).join('')
      const use = kv(t('kn_theo'), d.theoretical.v != null ? (d.theoretical.partial ? '≥ ' : '') + q(d.theoretical.v, d.theoretical.unit) : null, d.theoretical) + (d.bought ? kv(t('kn_bought'), d.bought.v != null ? q(d.bought.v, d.bought.unit) : null, d.bought) : '')
      const invAll = d.invoices || [], invShown = p.m_inv ? invAll : invAll.slice(0, 3)
      const inv = invShown.map(l => `<div class="row kvr"><span class="main"><div class="name">${H.shortDay(l.date)} · ${esc(l.number || t('kn_no_number'))}</div><div class="meta">${esc([l.vendor, l.description, l.number_src === 'original document' ? 'no. from the original document' : ''].filter(Boolean).join(' · '))}</div>
        <div class="meta">${esc(`${fmt(l.qty)} ${l.unit || ''} · ${l.pack || '—'}`)}${l.amount ? ' ' + esc(t('kn_amount', { q: q(l.amount.qty, l.amount.unit) })) + ` <span class="muted">(${esc(l.amount.rule)})</span>` : l.amount_why ? ` · <span class="wtx">${esc(l.amount_why)}</span>` : ''}</div></span>
        <span class="right"><b class="num">${money(l.total)}</b></span></div>`).join('') + (invShown.length < invAll.length ? `<button class="more" data-a="kMore" data-k="m_inv">${t('k_show_all', { n: invAll.length })}</button>` : '')
      return `<div class="page" style="--c:var(--rest)">${H.backBtn()}${H.head(t('k_ing') + (i.category ? ' · ' + esc(H.cat(i.category)) : ''), esc(i.name), sub ? esc(sub) : '')}
        ${i.notes ? `<p class="note">${esc(i.notes)}</p>` : ''}
        ${d.can_price ? sect(t('kn_buy'), (buy || `<div class="row"><span class="main"><div class="meta">${t('k_no_vend')}</div></span></div>`) + pr + pol) : pol ? sect(t('kn_policy'), pol) : ''}
        ${sect(t('kn_conv'), conv)}
        ${sect(t('kn_recipes'), recs || `<div class="row"><span class="main"><div class="meta">${t('k_not_used')}</div></span></div>`, d.recipes.length)}
        ${d.recipes.length ? sect(t('kn_dishes', { n: d.days }), dishes || `<div class="row"><span class="main"><div class="meta">${t('kn_nodish')}</div></span></div>`, d.dishes.length) : ''}
        ${sect(t('kn_use', { n: d.days }), use)}
        ${sect(t('kn_stock'), kv(t('kn_stock'), d.stock.v != null ? q(d.stock.v, d.stock.unit) : null, d.stock))}
        ${d.preps.length ? sect(t('k_prep'), d.preps.map(x => `<button class="row" data-a="openPrep" data-id="${x.id}"><span class="main"><div class="name">${esc(x.name)}</div></span><span class="chev">›</span></button>`).join('')) : ''}
        ${inv ? sect(t('kn_inv'), inv, (d.invoices || []).length) : ''}
        <p class="note" style="font-size:14px">${t('kn_ro')}</p>${roNote('k_ro')}</div>`;
    } },
    kgaps: { title: () => t('kn_gaps'), c: '--office', render(p) {
      const { esc } = H;
      if (!H.isChef()) return `<div class="page">${H.backBtn()}<p class="note">${t('chef_only')}</p></div>`;
      const d = H.need('knowledge_gaps', null, 10 * 60000);
      if (!d) return `<div class="page">${H.backBtn()}${H.waiting('knowledge_gaps')}</div>`;
      const sec = (k, l, rowf, sub) => { if (!l.length) return '';
        return `<section><div class="chap"><h2>${esc(t('kn_g_' + k, { n: d.days }))}</h2><span>${l.length}</span></div>${sub ? `<p class="note" style="margin:0 0 8px">${esc(sub)}</p>` : ''}<div class="list">${p['m_' + k] ? l.map(rowf).join('') : `<button class="more" data-a="kMore" data-k="m_${k}">${t('k_show', { n: l.length })}</button>`}</div></section>`; };
      const ingRow = x => `<button class="row" data-a="openIng" data-id="${esc(x.id)}"><span class="main"><div class="name" style="font-weight:500;font-size:17px">${esc(x.name)}</div><div class="meta">${esc(x.note)}</div></span><span class="chev">›</span></button>`;
      const L = d.lists;
      return `<div class="page" style="--c:var(--office)">${H.backBtn()}${H.head(t('w_office'), t('kn_gaps'), t('kn_gaps_sub'))}
        ${['unit_mismatch', 'piece_estimate', 'pack_unclear', 'price_missing', 'piece_missing', 'density_missing', 'no_vendor'].map(k => sec(k, L[k], ingRow)).join('')}
        ${sec('pos', d.pos_unmapped, x => `<div class="row"><span class="main"><div class="name" style="font-weight:500;font-size:17px">${esc(x.name)}</div></span><span class="right"><b class="num">${fmt(x.qty)}</b></span></div>`, t('kn_g_pos_sub', { u: fmt(d.pos_unmapped_qty), t: fmt(d.pos_total) }))}
        ${sec('inv', d.invoices_unmatched, x => `<div class="row"><span class="main"><div class="name" style="font-weight:500;font-size:17px">${esc(x.raw_description || '—')}</div><div class="meta">${esc([x.vendor, x.vendor_sku ? '#' + x.vendor_sku : '', H.shortDay(x.invoice_date)].filter(Boolean).join(' · '))}</div></span></div>`)}
        ${d.invoices_no_number ? `<p class="note">${t('kn_g_nonum', { n: d.invoices_no_number })}</p>` : ''}
        <p class="note" style="font-size:14px">${t('kn_g_ro')}</p></div>`;
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
  const gapsRow = () => `<div class="list"><button class="row" data-a="openGaps"><span class="main"><div class="name">${t('kn_gaps')}</div><div class="meta">${t('kn_gaps_sub')}</div></span><span class="chev">›</span></button></div>`;
  window.KitchenUI = { init(h) { H = h; }, screens, completeRow, ingsRow, gapsRow, fixBox, FOCUS };
})();
