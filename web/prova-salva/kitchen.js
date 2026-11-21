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
    // R1.15 suggested purchase match
    pm_title: ['Suggested purchase match', 'Acquisto suggerito', 'Compra sugerida'], pm_strong: ['Strong match', 'Corrispondenza forte', 'Coincidencia fuerte'], pm_possible: ['Possible', 'Possibile', 'Posible'], pm_weak: ['Weak — check', 'Debole — da controllare', 'Débil — revisar'], pm_done: ['Linked', 'Collegato', 'Vinculado'],
    pm_ambiguous: ['ambiguous, choose', 'ambiguo, scegli tu', 'ambiguo, elige'], pm_last: ['last invoice {d}', 'ultima fattura {d}', 'última factura {d}'], pm_each: ['each', 'al pezzo', 'c/u'],
    pm_link: ['Link to the draft', 'Collega alla bozza', 'Vincular al borrador'], pm_no: ['Not a match', 'Non corrisponde', 'No corresponde'], pm_more: ['Search more', 'Cerca altri', 'Buscar más'], pm_less: ['Fewer', 'Meno', 'Menos'],
    pm_none: ['No compatible purchase found in the invoices (all history).', 'Nessun acquisto compatibile nelle fatture (tutto lo storico).', 'Ninguna compra compatible en las facturas (todo el historial).'],
    pm_rejected_n: ['{n} rejected', '{n} scartati', '{n} descartados'], pm_open_from_recipe: ['Open the ingredient from a recipe to link it there.', 'Apri l\'ingrediente da una ricetta per collegarlo lì.', 'Abre el ingrediente desde una receta para vincularlo.'],
    pm_not_in_brigade: ['Purchase not yet an ingredient in Brigade (creating it needs a GO).', 'Acquisto non ancora ingrediente in Brigade (crearlo richiede un GO).', 'Compra aún no es ingrediente en Brigade (crearlo requiere un GO).'],
    pm_w_name: ['similar name ({v})', 'nome simile ({v})', 'nombre parecido ({v})'], pm_w_inv1: ['1 invoice ({a})', '1 fattura ({a})', '1 factura ({a})'], pm_w_unit_c: ['by the piece, as in the recipe', 'a pezzi, come nella ricetta', 'por pieza, como en la receta'], pm_w_unit_m: ['by weight, as in the recipe', 'a peso, come nella ricetta', 'por peso, como en la receta'], pm_w_unit_v: ['by volume, as in the recipe', 'a volume, come nella ricetta', 'por volumen, como en la receta'],
    pm_w_unit_diff: ['bought in another unit (needs a conversion)', 'comprato in un\'altra unità (serve una conversione)', 'comprado en otra unidad (requiere conversión)'], pm_w_inv: ['{n} invoice(s) {a} → {b}', '{n} fatture {a} → {b}', '{n} facturas {a} → {b}'],
    pm_w_canon: ['in Brigade as “{v}”', 'in Brigade come «{v}»', 'en Brigade como «{v}»'], pm_w_sku: ['same product code {v}', 'stesso codice prodotto {v}', 'mismo código {v}'], pm_w_alias: ['confirmed vendor alias', 'alias del fornitore confermato', 'alias confirmado'], pm_w_kind: ['different kind of product ({v})', 'altro tipo di prodotto ({v})', 'otro tipo de producto ({v})'],
    pm_linked: ['Linked in the draft (v{v}): {n}. The recipe in use has not changed.', 'Collegato nella bozza (v{v}): {n}. La ricetta in uso non è cambiata.', 'Vinculado en el borrador (v{v}): {n}. La receta en uso no cambió.'],
    pm_rejected: ['Noted: not proposed again.', 'Registrato: non verrà più proposto.', 'Anotado: no se propondrá de nuevo.'],
    pm_err_serve_ricetta: ['Open it from a recipe to link it.', 'Aprilo da una ricetta per collegarlo.', 'Ábrelo desde una receta.'], pm_err_riga_non_trovata: ['The recipe line has changed: reopen the recipe.', 'La riga della ricetta è cambiata: riapri la ricetta.', 'La línea cambió: vuelve a abrir la receta.'],
    pm_in_recipe: ['In {r}', 'In {r}', 'En {r}'], pm_draft: ['Draft v{v}', 'Bozza v{v}', 'Borrador v{v}'], pm_in_use: ['In use · {r}', 'In uso · {r}', 'En uso · {r}'], pm_now_uses: ['this line now uses “{n}”', 'questa riga ora usa «{n}»', 'esta línea ahora usa «{n}»'],
    pm_buy_none_but: ['No vendor linked yet — {n} compatible purchase(s) found above.', 'Nessun fornitore collegato — {n} acquisto/i compatibile/i qui sopra.', 'Sin proveedor vinculado — {n} compra(s) compatible(s) arriba.'], pm_buy_count: ['0 · {n} suggested', '0 · {n} suggerito', '0 · {n} sugerido'],
    kn_incomplete: ['Incomplete forecast (a conversion is missing): do not use it as a quantity to order.', 'Previsione incompleta (manca una conversione): non usarla come quantità da ordinare.', 'Previsión incompleta (falta una conversión): no usarla para pedir.'],
    kn_v: ['Verified', 'Verificato', 'Verificado'], kn_e: ['Estimated', 'Stima', 'Estimado'], kn_m: ['Missing', 'Manca', 'Falta'], kn_c: ['Calculated', 'Calcolato', 'Calculado'],
    kn_vendor: ['Vendor', 'Fornitore', 'Proveedor'], kn_unit_cost: ['Unit cost', 'Costo unitario', 'Costo unitario'],
    kn_vpurchase: ['Verified purchase · {n} days', 'Acquisto verificato · {n} giorni', 'Compra verificada · {n} días'],
    kn_cusage: ['Calculated usage · {n} days', 'Consumo calcolato · {n} giorni', 'Consumo calculado · {n} días'],
    kn_cstock: ['Counted stock', 'Scorta contata', 'Stock contado'],
    kn_cusage_note: ['POS sales × recipes. A calculation, not a count.', 'Vendite POS × ricette. Un calcolo, non un conteggio.', 'Ventas POS × recetas. Un cálculo, no un conteo.'],
    kn_tech: ['technical name', 'nome tecnico', 'nombre técnico'], kn_more_v: ['+{n} more', '+{n} altri', '+{n} más'],
    kn_pack_unread: ['Pack price from the invoice; the price per piece or per gram cannot be computed from this pack.', 'Prezzo della confezione da fattura; il prezzo a pezzo o al grammo non si calcola da questa confezione.', 'Precio del empaque de la factura; el precio por pieza o por gramo no se calcula con este empaque.'],
    kn_buy_details: ['Buying details', 'Dettagli acquisto', 'Detalles de compra'], kn_not_needed: ['not needed', 'non serve', 'no hace falta'], kn_needed: ['needed', 'serve', 'hace falta'],
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
      const i = d.ingredient, sub = local(i), chef = !!d.can_price;
      const SK = { verified: ['v', 'kn_v'], estimated: ['e', 'kn_e'], missing: ['m', 'kn_m'], calculated: ['c', 'kn_c'] };
      const st = x => x && SK[x.s] ? `<span class="kn ${SK[x.s][0]}">${t(SK[x.s][1])}</span>` : '';
      const src = x => x && (x.src || x.why) ? `<div class="meta">${esc([x.src, x.why].filter(Boolean).join(' · '))}</div>` : '';
      const kv = (label, val, x, extra) => `<div class="row kvr"><span class="main"><div class="name">${esc(label)}</div>${src(x)}${extra || ''}</span><span class="right"><b class="num">${val == null || val === '' ? '—' : esc(String(val))}</b>${st(x)}</span></div>`;
      const q = (v, u) => v == null ? null : `${fmt(v)} ${u || ''}`.trim();
      // collapsible section; open/closed is remembered in the screen state (kept when you come back)
      const fold = (k, h, body, n, openDef) => body ? `<details class="kfold" data-k="${k}" ${(p['o_' + k] ?? openDef) ? 'open' : ''}><summary><span>${esc(h)}</span><span class="muted">${n != null ? n : ''}</span></summary><div class="list">${body}</div></details>` : '';
      // ---- summary: what the Chef reads first ----
      const vs = d.vendors_k || [], v0 = vs.slice().sort((a, b) => String(b.last_invoice_date || '').localeCompare(String(a.last_invoice_date || '')))[0]
      const sum = []
      if (chef) {
        sum.push(`<div class="ksum-row"><span class="k">${t('kn_vendor')}</span><span class="v">${v0 ? `<b>${esc(v0.vendor)}</b>${v0.sku ? ` <span class="muted">#${esc(v0.sku)}</span>` : ''}${vs.length > 1 ? ` <span class="muted">${t('kn_more_v', { n: vs.length - 1 })}</span>` : ''}${v0.vendor_ref ? `<div class="meta">${t('kn_tech')}: ${esc(v0.vendor_ref)}</div>` : ''}` : `<span class="muted">${t('k_no_vend')}</span> ${st({ s: 'missing' })}`}</span></div>`)
        if (v0) sum.push(`<div class="ksum-row"><span class="k">${t('kn_pack')}</span><span class="v"><b>${esc(v0.pack.v || v0.pack_text || '—')}</b>${st(v0.pack)}${v0.pack.v && v0.pack_text ? ` <span class="muted">“${esc(v0.pack_text)}”</span>` : ''}</span></div>`)
        const each = v0 && v0.price_each, cp = d.price
        const uc = each ? `<b>${money(each.v)}</b> <span class="muted">each</span>${st(each)}` : cp && cp.per_each != null ? `<b>${money(cp.per_each)}</b> <span class="muted">each</span>${st(cp)}` : cp && cp.per_g != null ? `<b>${money(cp.per_g * 100)}</b> <span class="muted">/ 100 g</span>${st(cp.per_g_status ? { s: cp.per_g_status } : cp)}` : v0 && v0.unit_price != null ? `<b>${money(v0.unit_price)}</b> <span class="muted">/ pack${v0.pack_text ? ' “' + esc(v0.pack_text) + '”' : ''}</span>${st({ s: 'verified' })}<div class="meta">${esc(t('kn_pack_unread'))}</div>` : `— ${st({ s: 'missing' })}`
        sum.push(`<div class="ksum-row"><span class="k">${t('kn_unit_cost')}</span><span class="v">${uc}</span></div>`)
        if (d.bought) sum.push(`<div class="ksum-row"><span class="k">${t('kn_vpurchase', { n: d.days })}</span><span class="v"><b>${esc(d.bought.v != null ? q(d.bought.v, d.bought.unit) : '—')}</b>${st(d.bought)}${d.bought.v == null && d.bought.why ? `<div class="meta">${esc(d.bought.why)}</div>` : ''}</span></div>`)
      }
      const th = d.theoretical
      sum.push(`<div class="ksum-row"><span class="k">${t('kn_cusage', { n: d.days })}</span><span class="v"><b>${esc(th.v != null ? (th.partial ? '≥ ' : '') + q(th.v, th.unit) : '—')}</b>${st(th)}<div class="meta">${t('kn_cusage_note')}${th.why ? ' ' + esc(th.why) : ''}</div>${th.partial || (th.s === 'missing' && th.why) ? `<div class="meta knw">${t('kn_incomplete')}</div>` : ''}</span></div>`)
      sum.push(`<div class="ksum-row"><span class="k">${t('kn_cstock')}</span><span class="v"><b>${esc(d.stock.v != null ? q(d.stock.v, d.stock.unit) : '—')}</b>${st(d.stock)}<div class="meta">${esc([d.stock.src, d.stock.why].filter(Boolean).join(' · '))}</div></span></div>`)
      // ---- R1.15: opened from a recipe line → that recipe's own numbers, draft and in use kept apart (never mixed) ----
      let ctxBox = ''
      if (p.from && p.line) { const R = H.peek('mre_recipe', { id: p.from })
        if (R) { const dr = chef && R.draft ? R.draft : null, off = R.source === 'official' ? R.doc : null
          const per = (doc, l) => { const n = Number(doc && doc.yield && doc.yield.portions); return l && l.qty != null && n > 0 ? Math.round(l.qty / n * 1000) / 1000 : null }
          const line = (doc, lab) => { const l = (doc.lines || []).find(x => x.id === p.line); if (!l) return ''
            const other = l.ref !== p.id ? `<div class="meta">${esc(t('pm_now_uses', { n: (R.facts[l.ref] || {}).name || '?' }))}</div>` : ''
            const u = ['each', 'ea', 'pz', 'pc', 'pcs'].includes(String(l.unit || '').toLowerCase()) ? 'pz' : l.unit
            return `<div class="ksum-row"><span class="k">${esc(lab)}</span><span class="v"><b>${esc(q(l.qty, u) || '—')}</b> <span class="muted">${t('kn_lot')}</span>${per(doc, l) != null ? ` · <b>${esc(q(per(doc, l), u))}</b> <span class="muted">${t('kn_portion')} (${fmt(doc.yield.portions)} ${t('m_portions')})</span>` : ''}${other}</span></div>` }
          ctxBox = `<div class="ksum pm-ctx"><div class="pm-h">${esc(t('pm_in_recipe', { r: I.dn((dr || R.doc).title) }))}</div>${dr ? line(dr, t('pm_draft', { v: dr._version })) : ''}${off ? line(off, t('pm_in_use', { r: I.dn(off.title) })) : ''}</div>` } }
      // ---- R1.15: Suggested purchase match (Chef): what the invoices already know ----
      let pmBox = '', pmCount = 0
      if (chef) { const M = H.need('mre_purchase_match', { id: p.id, more: !!p.pmMore }, 10 * 60000)
        if (M && (M.need || (M.candidates || []).some(c => c.level === 'collegato'))) {
          const cs = M.candidates || []; pmCount = cs.filter(c => c.level !== 'debole').length
          const LV = { forte: 'pm_strong', possibile: 'pm_possible', debole: 'pm_weak', collegato: 'pm_done' }
          const why = c => c.why.map(w => w.k === 'name' ? t('pm_w_name', { v: String(w.v).replace(/≈/g, ' ≈ ') }) : w.k === 'unit_ok' ? t('pm_w_unit_' + w.v) : w.k === 'unit_diff' ? t('pm_w_unit_diff') : w.k === 'invoices' ? (w.v === 1 ? t('pm_w_inv1', { a: H.shortDay(w.to) }) : t('pm_w_inv', { n: w.v, a: H.shortDay(w.from), b: H.shortDay(w.to) })) : w.k === 'canonical' ? t('pm_w_canon', { v: w.v }) : w.k === 'sku' ? t('pm_w_sku', { v: w.v }) : w.k === 'alias' ? t('pm_w_alias') : w.k === 'other_kind' ? t('pm_w_kind', { v: w.v }) : '').filter(Boolean).join(' · ')
          const pmoney = v => '$' + (v < 1 ? Number(v.toFixed(5)).toString() : Number(v).toFixed(2))   // a container at $0.13591 is not "$0.14"
          const price = c => c.price ? (c.price.each != null ? `${pmoney(c.price.each)} ${t('pm_each')}` : `${pmoney(c.price.per100g)} / 100 g`) : ''
          const canLink = c => !!(p.from && p.line && c.target)
          const card = c => `<div class="pm-c${c.ambiguous ? ' amb' : ''}"><div class="pm-top"><b>${esc(c.description)}</b><span class="kn ${c.level === 'forte' || c.level === 'collegato' ? 'v' : 'e'}">${t(LV[c.level])}${c.ambiguous ? ' · ' + t('pm_ambiguous') : ''}</span></div>
            <div class="meta">${esc(c.vendor)}${c.sku ? ' #' + esc(c.sku) : ''} · ${t('pm_last', { d: H.shortDay(c.last.date) })}${c.last.number ? ' · n. ' + esc(c.last.number) : ''}</div>
            <div class="pm-num">${esc(c.last.pack || '—')} · <b>${money(c.last.unit_price)}</b>${price(c) ? ' → <b>' + price(c) + '</b>' : ''}</div>
            <div class="meta">${esc(why(c))}</div>
            ${c.level === 'collegato' ? '' : `<div class="pm-acts">${canLink(c) ? `<button class="btn ok pm-b" data-a="pmDecide" data-d="collega" data-key="${esc(c.key)}">${t('pm_link')}</button>` : `<span class="meta">${esc(c.target ? t('pm_open_from_recipe') : t('pm_not_in_brigade'))}</span>`}<button class="btn ghost pm-b" data-a="pmDecide" data-d="non_corrisponde" data-key="${esc(c.key)}">${t('pm_no')}</button></div>`}</div>`
          pmBox = `<section class="pm"><div class="chap"><h2>${t('pm_title')}</h2>${M.rejected ? `<span>${t('pm_rejected_n', { n: M.rejected })}</span>` : ''}</div>
            ${p.pmMsg ? `<div class="mr-flash${p.pmMsg.ok ? '' : ' bad'}">${esc(p.pmMsg.t)}</div>` : ''}
            ${cs.length ? cs.map(card).join('') : `<p class="note" style="margin:0">${t('pm_none')}</p>`}
            <button class="lnk pm-more" data-a="pmMore">${p.pmMore ? t('pm_less') : t('pm_more')}</button></section>` } }
      // ---- details, collapsible ----
      const buy = vs.map(v => `<div class="row kvr kvstack"><span class="main"><div class="name">${esc(v.vendor)}${v.sku ? ` <span class="muted" style="font-size:14px">#${esc(v.sku)}</span>` : ''}</div>
          ${v.vendor_ref ? `<div class="meta">${t('kn_tech')}: ${esc(v.vendor_ref)}</div>` : ''}
          <div class="kvvals"><span>${t('kn_pack')} <b class="num">${esc(v.pack.v || v.pack_text || '—')}</b>${st(v.pack)}</span>${v.unit_price != null ? `<span>${t('kn_pack_price')} <b class="num">${money(v.unit_price)}</b></span>` : ''}${v.price_each ? `<span>${t('kn_each')} <b class="num">${money(v.price_each.v)}</b>${st(v.price_each)}</span>` : ''}</div>
          <div class="meta">${esc([v.pack_text && v.pack.v ? `“${v.pack_text}”` : '', v.pack.why, v.price_each ? v.price_each.src : '', v.last_invoice_date ? t('k_last_inv', { d: H.shortDay(v.last_invoice_date) }) : ''].filter(Boolean).join(' · '))}</div>
          ${v.checks.map(c => `<div class="meta knw">${esc(c.msg)}</div>`).join('')}${v.do_not_order ? `<div class="meta wtx">${t('k_dno')}</div>` : ''}</span></div>`).join('')
      // price used for cost (FC05): price each and per-gram price can have different trust, so two rows
      const pr = d.price ? (d.price.per_each != null ? kv(t('kn_cost_price') + ' · ' + t('kn_each').toLowerCase(), money(d.price.per_each), Object.assign({}, d.price, { why: null })) : '')
        + (d.price.per_g != null ? kv(t('kn_cost_price') + ' · ' + t('kn_per_g'), money(d.price.per_g * 100), d.price.per_g_status === 'estimated' ? { s: 'estimated', src: d.price.src, why: 'rests on a piece weight that is not approved' } : d.price) : '')
        + (d.price.per_each == null && d.price.per_g == null ? kv(t('kn_cost_price'), d.price.per_ml != null ? money(d.price.per_ml) + '/ml' : null, d.price) : '') : ''
      const pol = d.policy ? kv(t('kn_policy'), d.policy.v, d.policy) : ''
      // conversions: shown, but asked for only when buying and using do not meet
      const cv = d.conversions, need = (ok, why) => `<div class="meta">${ok ? t('kn_needed') : t('kn_not_needed')}${why ? ': ' + esc(why) : ''}</div>`
      const conv = [(cv.needed.piece_why || cv.piece_g.v != null) ? kv(t('kn_piece'), q(cv.piece_g.v, 'g'), cv.needed.piece || cv.piece_g.v != null ? cv.piece_g : null, need(cv.needed.piece, cv.needed.piece_why)) : '',
        (cv.needed.volume_why || cv.density.v != null) ? kv(t('kn_density'), cv.density.v != null ? cv.density.v + ' g/ml' : null, cv.needed.volume || cv.density.v != null ? cv.density : null, need(cv.needed.volume, cv.needed.volume_why)) : ''].join('')
      const recs = d.recipes.map(r => `<button class="row kvr" data-a="openRecipe" data-r="${esc(r.recipe_id)}"><span class="main"><div class="name">${esc(I.dn(r.title))}</div>${r.unit_ok ? `<div class="meta wtx">${esc(r.unit_ok)}</div>` : src(r.per_portion.s !== 'verified' ? r.per_portion : null)}</span>
        <span class="right kvcol"><span><b class="num">${esc(q(r.qty, r.unit) || '—')}</b> <span class="muted">${t('kn_lot')}</span></span><span><b class="num">${esc(q(r.per_portion.v, r.unit) || '—')}</b> <span class="muted">${t('kn_portion')}</span>${r.per_portion.s !== 'verified' ? st(r.per_portion) : ''}</span></span><span class="chev">›</span></button>`).join('')
      const dishes = d.dishes.filter(x => x.sold).concat(d.dishes.filter(x => !x.sold)).map(x => `<button class="row kvr" data-a="openRecipe" data-r="${esc(x.recipe_id)}"><span class="main"><div class="name">${esc(I.dn(x.title))}</div><div class="meta">${esc((x.paths[0] || '').split(' › ').map(I.dn).join(' › '))}${x.why.length ? ' · ' + esc(x.why[0]) : ''}</div></span>
        <span class="right kvcol"><span><b class="num">${t('kn_sold', { n: fmt(x.sold) })}</b></span><span><b class="num">${esc(q(x.per_portion, x.unit) || '—')}</b> <span class="muted">${t('kn_portion')}</span>${x.status !== 'verified' ? st({ s: x.status }) : ''}</span></span><span class="chev">›</span></button>`).join('')
      const invAll = d.invoices || [], invShown = p.m_inv ? invAll : invAll.slice(0, 3)
      const inv = invShown.map(l => `<div class="row kvr"><span class="main"><div class="name">${H.shortDay(l.date)} · ${esc(l.number || t('kn_no_number'))}</div><div class="meta">${esc([l.vendor, l.description, l.number_src === 'original document' ? 'no. from the original document' : ''].filter(Boolean).join(' · '))}</div>
        <div class="meta">${esc(`${fmt(l.qty)} ${l.unit || ''} · ${l.pack || '—'}`)}${l.amount ? ' ' + esc(t('kn_amount', { q: q(l.amount.qty, l.amount.unit) })) + ` <span class="muted">(${esc(l.amount.rule)})</span>` : l.amount_why ? ` · <span class="wtx">${esc(l.amount_why)}</span>` : ''}</div></span>
        <span class="right"><b class="num">${money(l.total)}</b></span></div>`).join('') + (invShown.length < invAll.length ? `<button class="more" data-a="kMore" data-k="m_inv">${t('k_show_all', { n: invAll.length })}</button>` : '')
      return `<div class="page" style="--c:var(--rest)">${H.backBtn()}${H.head(t('k_ing') + (i.category ? ' · ' + esc(H.cat(i.category)) : ''), esc(i.name), sub ? esc(sub) : '')}
        ${i.notes ? `<p class="note">${esc(i.notes)}</p>` : ''}
        ${ctxBox}${pmBox}<div class="ksum">${sum.join('')}</div>
        ${fold('recipes', t('kn_recipes'), recs || `<div class="row"><span class="main"><div class="meta">${t('k_not_used')}</div></span></div>`, d.recipes.length, true)}
        ${d.recipes.length ? fold('dishes', t('kn_dishes', { n: d.days }), dishes || `<div class="row"><span class="main"><div class="meta">${t('kn_nodish')}</div></span></div>`, d.dishes.filter(x => x.sold).length + ' / ' + d.dishes.length, false) : ''}
        ${chef ? fold('buy', t('kn_buy_details'), (buy || `<div class="row"><span class="main"><div class="meta">${pmCount ? t('pm_buy_none_but', { n: pmCount }) : t('k_no_vend')}</div></span></div>`) + pr + pol, vs.length || (pmCount ? t('pm_buy_count', { n: pmCount }) : 0), false) : pol ? fold('buy', t('kn_policy'), pol, '', false) : ''}
        ${fold('conv', t('kn_conv'), conv, (cv.needed.piece && cv.piece_g.s !== 'verified') || (cv.needed.volume && cv.density.s !== 'verified') ? '!' : '', false)}
        ${inv ? fold('inv', t('kn_inv'), inv, invAll.length, false) : ''}
        ${d.preps.length ? fold('prep', t('k_prep'), d.preps.map(x => `<button class="row" data-a="openPrep" data-id="${x.id}"><span class="main"><div class="name">${esc(x.name)}</div></span><span class="chev">›</span></button>`).join(''), d.preps.length, false) : ''}
        <p class="note" style="font-size:14px">${t('kn_ro')}</p>${roNote('k_ro')}</div>`;
    }, after(p) {
      document.querySelectorAll('#main details.kfold').forEach(el => el.addEventListener('toggle', () => { p['o_' + el.dataset.k] = el.open; H.save && H.save(); }));
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
