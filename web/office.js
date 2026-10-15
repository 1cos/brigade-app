/* Brigade 2.0 — Decisions, L'Ufficio and invoices (B-25 module 1, from Shell V020). Read only, Chef only.
   The grouping is done ONCE, on the server, by supabase/functions/_shared/office_core.js; this file only writes
   the cards in the user's language (en / it / es). Data (vendor items, team messages, recipe titles) is shown as it is. */
(function () {
  const I = window.I18N, IDX = { en: 0, it: 1, es: 2 };
  const BRIGADE_URL = 'https://1cos.github.io/back-of-house/';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = v => { const n = parseFloat(v); return isFinite(n) ? (Math.round(n * 100) / 100).toLocaleString(I.locale(), { maximumFractionDigits: 2 }) : ''; };
  const day = d => d ? new Date((String(d).length === 10 ? d : new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date(d))) + 'T12:00:00Z').toLocaleDateString(I.locale(), { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }) : '';
  const pl = (n, en, it, es) => [`${n} ${n === 1 ? en[0] : en[1]}`, `${n} ${n === 1 ? it[0] : it[1]}`, `${n} ${n === 1 ? es[0] : es[1]}`];
  const sold = p => p.sold ? [`Sold ${p.sold} times in the last 30 days. `, `Venduto ${p.sold} volte negli ultimi 30 giorni. `, `Vendido ${p.sold} veces en los últimos 30 días. `] : ['', '', ''];
  const join3 = (a, b) => a.map((x, i) => x + b[i]);

  /* every text: [en, it, es] or a function of the params returning [en, it, es] */
  const W = {
    of_recipe: ['Recipe', 'Ricetta', 'Receta'], of_invoice: ['Invoice', 'Fattura', 'Factura'], of_team: ['Team', 'Brigata', 'Equipo'],
    of_inv_unreadable: p => [`${p.v} invoice could not be read`, `Fattura ${p.v} illeggibile`, `No se pudo leer la factura de ${p.v}`],
    of_why_no_lines: ['No lines were found in the document, so prices and stock were not updated.', 'Nel documento non ci sono righe, quindi prezzi e scorte non sono stati aggiornati.', 'No se encontraron líneas en el documento, así que precios y stock no se actualizaron.'],
    of_why_unknown_doc: ['Brigade did not recognise this document, so nothing was imported.', 'Brigade non ha riconosciuto il documento, quindi non è stato importato nulla.', 'Brigade no reconoció este documento, así que no se importó nada.'],
    of_miss_readable: ['A readable copy of the invoice', 'Una copia leggibile della fattura', 'Una copia legible de la factura'],
    of_inv_subs: p => { const x = pl(p.n, ['item', 'items'], ['articolo', 'articoli'], ['artículo', 'artículos']); return [`${p.v} substituted ${x[0]}`, `${p.v} ha sostituito ${x[1]}`, `${p.v} sustituyó ${x[2]}`]; },
    of_inv_subs_short: p => [`${p.v} substituted ${p.s} and shorted ${p.n}`, `${p.v}: ${p.s} sostituiti, ${p.n} non consegnati`, `${p.v} sustituyó ${p.s} y no entregó ${p.n}`],
    of_inv_short: p => { const x = pl(p.n, ['item', 'items'], ['articolo', 'articoli'], ['artículo', 'artículos']); return [`${p.v} did not ship ${x[0]}`, `${p.v} non ha spedito ${x[1]}`, `${p.v} no envió ${x[2]}`]; },
    of_why_pending: ['The invoice is waiting for review in Brigade.', 'La fattura aspetta la revisione in Brigade.', 'La factura espera revisión en Brigade.'],
    of_why_imported: ['The invoice is already imported. Check stock and prices for these lines.', 'La fattura è già importata. Controlla scorte e prezzi di queste righe.', 'La factura ya está importada. Revisa stock y precios de estas líneas.'],
    of_excluded: p => { const x = pl(p.n, ['Walmart receipt', 'Walmart receipts'], ['scontrino Walmart', 'scontrini Walmart'], ['recibo de Walmart', 'recibos de Walmart']); return [`${x[0]} kept out of the kitchen`, `${x[1]} tenuti fuori dalla cucina`, `${x[2]} fuera de la cocina`]; },
    of_excluded_why: ['Bought by a non-kitchen buyer, so excluded on purpose.', 'Acquistati da chi non lavora in cucina: esclusi apposta.', 'Comprados por alguien que no es de cocina: excluidos a propósito.'],
    of_no_yield: p => [`${p.r} has no yield`, `${p.r} non ha la resa`, `${p.r} no tiene rendimiento`],
    of_why_no_yield: p => join3(sold(p), ['Brigade does not know how much one batch makes, so food cost and stock count it as one portion.', 'Brigade non sa quanto rende un lotto, quindi food cost e scorte lo contano come una porzione.', 'Brigade no sabe cuánto rinde un lote, así que el food cost y el stock lo cuentan como una porción.']),
    of_miss_yield: ['The yield: batch weight in kg, or number of portions', 'La resa: peso del lotto in kg oppure numero di porzioni', 'El rendimiento: peso del lote en kg o número de porciones'],
    of_no_ingr: p => [`${p.r} has no ingredients`, `${p.r} non ha ingredienti`, `${p.r} no tiene ingredientes`],
    of_why_no_ingr: p => join3(sold(p), ['Food cost and prep forecast cannot see this dish.', 'Food cost e previsione prep non vedono questo piatto.', 'El food cost y la previsión de prep no ven este plato.']),
    of_miss_ingr: ['Its ingredients and sub-recipes', 'I suoi ingredienti e le sotto-ricette', 'Sus ingredientes y subrecetas'],
    of_portions: p => [`${p.r}: one portion or a batch?`, `${p.r}: una porzione o un lotto?`, `${p.r}: ¿una porción o un lote?`],
    of_yield_now: p => {
      const parts = [[], [], []];
      if (p.portions != null) pl(p.portions, ['portion', 'portions'], ['porzione', 'porzioni'], ['porción', 'porciones']).forEach((x, i) => parts[i].push(x.replace(/^[\d.]+/, fmt(p.portions))));
      if (p.qty != null) [['batch'], ['lotto'], ['lote']].forEach((w, i) => parts[i].push(`${w[0]} ${fmt(p.qty)} ${p.dim}`));
      return parts.map((x, i) => x.join(' · ') || ['no yield', 'nessuna resa', 'sin rendimiento'][i]);
    },
    of_why_portions: p => join3(sold(p), ['It has a batch size but not how many portions it makes. If it is a batch, each sale deducts too much.', 'Ha il peso del lotto ma non quante porzioni fa. Se è un lotto, ogni vendita scarica troppo.', 'Tiene el tamaño del lote pero no cuántas porciones rinde. Si es un lote, cada venta descuenta demasiado.']),
    of_miss_portions: ['How many portions one batch makes', 'Quante porzioni fa un lotto', 'Cuántas porciones rinde un lote'],
    of_bom_few: p => { const x = pl(p.n, ['dish', 'dishes'], ['piatto', 'piatti'], ['plato', 'platos']); return [`${x[0]} list only a few ingredients`, `${x[1]} con pochi ingredienti in distinta`, `${x[2]} con pocos ingredientes en la lista`]; },
    of_why_bom_few: ['Brigade cannot tell whether these lists are complete. If something is missing, the food cost looks too low.', 'Brigade non sa se queste distinte sono complete. Se manca qualcosa, il food cost risulta troppo basso.', 'Brigade no sabe si estas listas están completas. Si falta algo, el food cost parece demasiado bajo.'],
    of_miss_bom_few: ['Check each list once and add what is missing', 'Controlla ogni distinta una volta e aggiungi ciò che manca', 'Revisa cada lista una vez y añade lo que falte'],
    of_bom_row: p => { const x = pl(p.n, ['ingredient', 'ingredients'], ['ingrediente', 'ingredienti'], ['ingrediente', 'ingredientes']); return x.map(s => `${p.r} · ${s}`); },
    of_proposal: p => [`Sous Chef proposal for ${p.r}`, `Proposta del Sous Chef per ${p.r}`, `Propuesta del Sous Chef para ${p.r}`],
    of_miss_proposal: ['Your answer. Approving switches on with protected recipe saving; until then you can read or reject it.', 'La tua risposta. L\'approvazione si attiva con il salvataggio protetto delle ricette; fino ad allora puoi leggerla o rifiutarla.', 'Tu respuesta. La aprobación se activa con el guardado protegido de recetas; hasta entonces puedes leerla o rechazarla.'],
    of_old_msgs: p => { const x = pl(p.n, ['team message', 'team messages'], ['messaggio della brigata', 'messaggi della brigata'], ['mensaje del equipo', 'mensajes del equipo']); return [`${x[0]} never closed`, `${x[1]} mai chiusi`.replace(/^1 messaggio della brigata mai chiusi$/, '1 messaggio della brigata mai chiuso'), `${x[2]} sin cerrar`]; },
    of_range: p => { const s = `${day(p.a)} – ${day(p.b)}`; return [s, s, s]; },
    of_why_old_msgs: ['Older than two weeks. Some ask for recipe changes, some report production. Archive what is already handled, answer the rest.', 'Più vecchi di due settimane. Alcuni chiedono modifiche alle ricette, altri segnalano produzioni. Archivia quello che è già fatto, rispondi al resto.', 'Más de dos semanas. Algunos piden cambios de recetas, otros reportan producción. Archiva lo ya resuelto, responde el resto.'],
    of_miss_review: ['One review', 'Una revisione', 'Una revisión'],
    of_reported_prod: p => [`${p.who} reported production`, `${p.who} ha segnalato una produzione`, `${p.who} reportó una producción`],
    of_team_says: p => { const s = `${p.who}: ${p.text}`; return [s, s, s]; },
    of_miss_prod: ['Check it is recorded as production', 'Controlla che sia registrata come produzione', 'Revisa que esté registrada como producción'],
    of_miss_answer: ['Your answer', 'La tua risposta', 'Tu respuesta'],
    of_t_invoice_stuck_in_review: p => [`${p.l} is waiting in review`, `${p.l} aspetta in revisione`, `${p.l} espera en revisión`],
    of_w_invoice_stuck_in_review: ['Some quantities differ from the order, so Brigade cannot book it on its own. Until then its cost is not counted.', 'Alcune quantità non corrispondono all\'ordine, quindi Brigade non può registrarla da sola. Fino ad allora il suo costo non viene contato.', 'Algunas cantidades no coinciden con el pedido, así que Brigade no puede registrarla sola. Hasta entonces su costo no se cuenta.'],
    of_m_invoice_stuck_in_review: ['Your check in Vendor Review', 'Il tuo controllo in Vendor Review', 'Tu revisión en Vendor Review'],
    of_t_revision_after_import: p => [`${p.l}: updated after it was imported`, `${p.l}: aggiornata dopo l'importazione`, `${p.l}: actualizada después de importarla`],
    of_w_revision_after_import: ['Walmart sent a new version of an invoice that is already booked. Nothing was changed.', 'Walmart ha mandato una nuova versione di una fattura già registrata. Non è stato cambiato nulla.', 'Walmart envió una nueva versión de una factura ya registrada. No se cambió nada.'],
    of_m_revision_after_import: ['Check whether the items differ', 'Controlla se gli articoli sono diversi', 'Revisa si los artículos cambian'],
    of_t_unreadable_invoice: p => [`${p.l} could not be read`, `${p.l} illeggibile`, `${p.l} no se pudo leer`],
    of_w_unreadable_invoice: ['No lines were found in the document, so prices and stock were not updated.', 'Nel documento non ci sono righe, quindi prezzi e scorte non sono stati aggiornati.', 'No se encontraron líneas en el documento, así que precios y stock no se actualizaron.'],
    of_m_unreadable_invoice: ['A readable copy of the invoice', 'Una copia leggibile della fattura', 'Una copia legible de la factura'],
    of_t_walmart_revision_missing: p => [`${p.l}: the updated invoice never arrived`, `${p.l}: la fattura aggiornata non è mai arrivata`, `${p.l}: la factura actualizada nunca llegó`],
    of_w_walmart_revision_missing: ['Walmart sent only the total more than a week ago.', 'Walmart ha mandato solo il totale più di una settimana fa.', 'Walmart envió solo el total hace más de una semana.'],
    of_m_walmart_revision_missing: ['The invoice with the items', 'La fattura con gli articoli', 'La factura con los artículos'],
    of_why_unknown: ['Brigade does not know how to read this alert yet.', 'Brigade non sa ancora leggere questo avviso.', 'Brigade aún no sabe leer este aviso.'],
    of_miss_look: ['Your look', 'Un tuo sguardo', 'Que le eches un vistazo'],
    of_inv_reason: p => { const s = `${p.l} · ${p.r}`; return [s, s, s]; },
    // history groups (V020 REASON_LABEL) and explanations (V020 REASON_WHY)
    of_rl_snoozed: ['Snoozed', 'Rimandati', 'Pospuestos'], of_rl_acted_on: ['Already handled in L\'Ufficio', 'Già gestiti nell\'Ufficio', 'Ya gestionados en L\'Ufficio'],
    of_rl_recipe_gone: ['Recipe no longer in Brigade', 'Ricetta non più in Brigade', 'La receta ya no está en Brigade'], of_rl_recipe_archived: ['Recipe archived', 'Ricetta archiviata', 'Receta archivada'],
    of_rl_ai_copy: ['Chef AI copies of team messages', 'Copie Chef AI dei messaggi della brigata', 'Copias de Chef AI de mensajes del equipo'], of_rl_praise: ['Team notes and praise', 'Note e complimenti della brigata', 'Notas y elogios del equipo'],
    of_rl_yield_resolved: ['Out of date: already fixed', 'Superati: già sistemati', 'Desactualizados: ya resueltos'], of_rl_bom_now_present: ['Out of date: already fixed', 'Superati: già sistemati', 'Desactualizados: ya resueltos'],
    of_rl_portion_optional: ['Portion size not set (optional)', 'Peso porzione non impostato (facoltativo)', 'Tamaño de porción sin definir (opcional)'],
    of_rl_pos_link_unknown: ['Not asked: POS link', 'Non chiesto: collegamento POS', 'No se pregunta: vínculo POS'], of_rl_stock_untrusted: ['Not asked: stock counts', 'Non chiesto: conte delle scorte', 'No se pregunta: conteos de stock'],
    of_rl_deferred_by_chef: ['Deferred by Chef', 'Rimandati dallo Chef', 'Pospuestos por Chef'], of_rl_excluded: ['Walmart receipts kept out of the kitchen', 'Scontrini Walmart tenuti fuori dalla cucina', 'Recibos de Walmart fuera de la cocina'],
    of_rl_imported_with_notes: ['Imported invoices with notes', 'Fatture importate con note', 'Facturas importadas con notas'], of_rl_legacy_record: ['Old records', 'Vecchi documenti', 'Registros antiguos'],
    of_rl_return_pickup_slip: ['Return pick-up slips (not invoices)', 'Bolle di ritiro resi (non fatture)', 'Comprobantes de retiro de devoluciones (no facturas)'],
    of_rl_walmart_waiting_revision: ['Walmart: waiting for the updated invoice', 'Walmart: si aspetta la fattura aggiornata', 'Walmart: esperando la factura actualizada'], of_rl_other: ['Other', 'Altro', 'Otros'],
    of_rw_yield_resolved: ['The yield is set now; the alert will close on its own.', 'Ora la resa c\'è; l\'avviso si chiuderà da solo.', 'Ahora el rendimiento está definido; el aviso se cerrará solo.'],
    of_rw_bom_now_present: ['The recipe has its ingredients now.', 'Ora la ricetta ha i suoi ingredienti.', 'La receta ya tiene sus ingredientes.'],
    of_rw_portion_optional: ['Optional. Only used to plan prep from sales.', 'Facoltativo. Serve solo a pianificare la prep dalle vendite.', 'Opcional. Solo sirve para planificar la prep según las ventas.'],
    of_rw_pos_link_unknown: ['Depends on whether the dish is sold on its own. Not asked until it matters.', 'Dipende se il piatto si vende da solo. Non viene chiesto finché non serve.', 'Depende de si el plato se vende solo. No se pregunta hasta que importe.'],
    of_rw_stock_untrusted: ['Depends on stock counts the team enters, which are not reliable right now. Brigade does not ask you anything.', 'Dipende dalle conte inserite dalla brigata, che ora non sono affidabili. Brigade non ti chiede nulla.', 'Depende de los conteos que hace el equipo, que ahora no son fiables. Brigade no te pregunta nada.'],
    of_rw_return_pickup_slip: ['Hardie\'s picked up a return. The credit arrives as a separate credit memo.', 'Hardie\'s ha ritirato un reso. L\'accredito arriva con una nota di credito a parte.', 'Hardie\'s retiró una devolución. El crédito llega en una nota de crédito aparte.'],
    of_rw_walmart_waiting_revision: ['Walmart sent only the total. The version with the items usually follows and replaces it.', 'Walmart ha mandato solo il totale. Di solito segue la versione con gli articoli, che la sostituisce.', 'Walmart envió solo el total. Normalmente llega después la versión con los artículos y la reemplaza.'],
    of_rw_legacy_record: ['A broken copy of an order that was already imported under the right number.', 'Una copia rotta di un ordine già importato con il numero giusto.', 'Una copia dañada de un pedido ya importado con el número correcto.'],
    // screens
    of_decisions: ['Decisions', 'Decisioni', 'Decisiones'], of_invoices: ['Invoices', 'Fatture', 'Facturas'], of_office: ['Office', 'Ufficio', 'Oficina'],
    of_head: ['L\'Ufficio and invoices', 'Ufficio e fatture', 'L\'Ufficio y facturas'], of_head_today: ['Today', 'Oggi', 'Hoy'],
    of_need_you: p => p.n ? pl(p.n, ['needs you', 'need you'], ['ti aspetta', 'ti aspettano'], ['te necesita', 'te necesitan']) : ['Nothing needs you', 'Niente ti aspetta', 'Nada te espera'],
    of_checked: p => [`Checked against Brigade's data at ${p.t}.`, `Controllato sui dati di Brigade alle ${p.t}.`, `Comprobado con los datos de Brigade a las ${p.t}.`],
    of_act_now: ['Act now', 'Da fare ora', 'Actuar ahora'], of_later: ['Your decision, not today', 'Decisione tua, non oggi', 'Tu decisión, no hoy'],
    of_more_link: p => p.n ? [`${p.n} for later, history and out-of-date alerts ›`, `${p.n} per dopo, storico e avvisi superati ›`, `${p.n} para después, historial y avisos desactualizados ›`] : ['History and out-of-date alerts ›', 'Storico e avvisi superati ›', 'Historial y avisos desactualizados ›'],
    of_completeness: ['Recipe completeness', 'Completezza ricette', 'Completitud de recetas'],
    of_completeness_sub: ['Missing photos, procedures and portions. Not urgent, kept in the Office.', 'Foto, procedimenti e porzioni mancanti. Non urgente, tenuto nell\'Ufficio.', 'Faltan fotos, procedimientos y porciones. No es urgente, está en la Oficina.'],
    of_show: p => [`Show ${p.n}`, `Mostra ${p.n}`, `Mostrar ${p.n}`],
    of_ro_note: ['Read only: decisions are made in Brigade. When Brigade changes, this list updates at the next refresh.', 'Sola lettura: le decisioni si prendono in Brigade. Quando Brigade cambia, questa lista si aggiorna al prossimo caricamento.', 'Solo lectura: las decisiones se toman en Brigade. Cuando Brigade cambia, esta lista se actualiza en la próxima carga.'],
    of_missing: ['Missing:', 'Manca:', 'Falta:'],
    of_btn_recipe: ['Open recipe', 'Apri ricetta', 'Abrir receta'], of_btn_invoices: ['Open invoices in Brigade', 'Apri le fatture in Brigade', 'Abrir facturas en Brigade'],
    of_btn_review: ['Review in Brigade', 'Rivedi in Brigade', 'Revisar en Brigade'], of_btn_office: ['Open L\'Ufficio', 'Apri l\'Ufficio', 'Abrir L\'Ufficio'], of_btn_brigade: ['Check in Brigade', 'Controlla in Brigade', 'Revisar en Brigade'],
    of_inv_sub: p => [`${p.w} open warnings in Brigade, on ${p.n} invoices`, `${p.w} avvisi aperti in Brigade, su ${p.n} fatture`, `${p.w} avisos abiertos en Brigade, en ${p.n} facturas`],
    of_needs_you: ['Needs you', 'Ti aspetta', 'Te necesita'], of_in_review: ['Waiting in review', 'In attesa di revisione', 'Esperando revisión'], of_for_info: ['For information', 'Per informazione', 'Para información'],
    of_docs30: ['Documents · last 30 days', 'Documenti · ultimi 30 giorni', 'Documentos · últimos 30 días'],
    of_st_imported: ['imported', 'importata', 'importada'], of_st_pending: ['in review', 'in revisione', 'en revisión'], of_st_error: ['error', 'errore', 'error'], of_st_ignored: ['ignored', 'ignorata', 'ignorada'],
    of_tile_dec: p => p.n ? [`<b>${p.n}</b> to decide`, `<b>${p.n}</b> da decidere`, `<b>${p.n}</b> por decidir`] : ['All clear', 'Tutto a posto', 'Todo en orden'],
    of_tile_inv: p => p.now || p.review ? [[p.now && `<b>${p.now}</b> need you`, p.review && `${p.review} in review`], [p.now && `<b>${p.now}</b> ti aspett${p.now === 1 ? 'a' : 'ano'}`, p.review && `${p.review} in revisione`], [p.now && `<b>${p.now}</b> te necesita${p.now === 1 ? '' : 'n'}`, p.review && `${p.review} en revisión`]].map(x => x.filter(Boolean).join(' · ')) : ['All clear', 'Tutto a posto', 'Todo en orden'],
    of_line_sub: p => [`${p.a} → ${p.b} (${p.got} of ${p.ord} arrived, plus ${p.n} substitute)`, `${p.a} → ${p.b} (arrivati ${p.got} su ${p.ord}, più ${p.n} in sostituzione)`, `${p.a} → ${p.b} (llegaron ${p.got} de ${p.ord}, más ${p.n} de sustituto)`],
    of_line_sub_only: p => { const s = `${p.a} → ${p.b} (${p.n})`; return [s, s, s]; },
    of_line_short: p => [`${p.a}: ${p.got} of ${p.ord} shipped`, `${p.a}: spediti ${p.got} su ${p.ord}`, `${p.a}: enviados ${p.got} de ${p.ord}`],
    of_line_none: p => [`${p.a}: none of ${p.ord} shipped`, `${p.a}: nessuno spedito su ${p.ord}`, `${p.a}: ninguno enviado de ${p.ord}`],
    of_line_extra: p => [`${p.a}: ${p.n} received, not ordered`, `${p.a}: ricevuti ${p.n}, non ordinati`, `${p.a}: recibidos ${p.n}, no pedidos`],
    w_office_eyebrow: ['Office', 'Ufficio', 'Oficina'], of_decision: ['Decision', 'Decisione', 'Decisión'], of_alerts: ['Important alerts', 'Avvisi importanti', 'Avisos importantes'],
    of_no_alerts: ['Nothing urgent right now.', 'Niente di urgente adesso.', 'Nada urgente ahora.'], of_open_all: ['All decisions ›', 'Tutte le decisioni ›', 'Todas las decisiones ›'],
    of_gone: ['This decision is no longer open: it was handled in Brigade, or it is out of date.', 'Questa decisione non è più aperta: è stata gestita in Brigade oppure è superata.', 'Esta decisión ya no está abierta: se gestionó en Brigade o está desactualizada.'],
    of_to_fix: p => [`To fix: ${p.t}`, `Da sistemare: ${p.t}`, `Por arreglar: ${p.t}`], of_now: ['Now:', 'Adesso:', 'Ahora:'], of_fix_in_brigade: ['Fix in Brigade', 'Sistema in Brigade', 'Arreglar en Brigade'],
    of_tools: ['Office tools', 'Strumenti dell\'Ufficio', 'Herramientas de oficina'],
    of_line_msg: p => { const s = `${p.from}: ${p.text}`; return [s, s, s]; },
  };

  /* text object → safe HTML in the current language. {raw} is data (escaped); {k,p} is a key with params */
  function T(x, lang) {
    if (x == null) return '';
    if (typeof x === 'string') return esc(x);
    if ('raw' in x) return esc(x.raw);
    const p = {}; Object.keys(x.p || {}).forEach(k => { const v = x.p[k]; p[k] = v && typeof v === 'object' ? T(v, lang) : typeof v === 'number' ? v : v == null ? v : esc(v); });
    const e = W[x.k]; if (!e) return esc(x.k);
    const arr = typeof e === 'function' ? e(p) : e;
    return arr[IDX[lang || I.lang]] ?? arr[0];
  }
  const w = (k, p) => T({ k, p });
  const line = l => l.t === 'msg' ? w('of_line_msg', { from: l.from ? { raw: l.from } : { k: 'of_team' }, text: { raw: l.text } }) : w('of_line_' + l.t, { a: { raw: l.a }, b: l.b != null ? { raw: l.b } : null, got: l.got, ord: l.ord, n: l.n });
  const ctaBtn = (d) => {
    if (d.cta === 'recipe' && d.rid) return `<button class="btn" data-a="openRecipe" data-r="${esc(d.rid)}" data-focus="${esc(d.focus || '')}">${w('of_btn_recipe')}</button>`;
    const k = { invoices: 'of_btn_invoices', review: 'of_btn_review', office: 'of_btn_office', brigade: 'of_btn_brigade' }[d.cta];
    const out = k ? `<a class="btn ghost" href="${BRIGADE_URL}" target="_blank" rel="noopener">${w(k)} ↗</a>` : '';
    return out + (d.area === 'team' && d.rid ? `<button class="btn" data-a="openRecipe" data-r="${esc(d.rid)}">${w('of_btn_recipe')}</button>` : '');
  };
  function card(d) {
    const now = T(d.now), dt = d.date ? day(d.date) : '';
    return `<div class="dec"><div class="top"><span class="sev ${esc(d.sev)}"></span><div style="flex:1;min-width:0"><div class="name">${T(d.title)}</div>${now || dt ? `<div class="meta">${[now, dt].filter(Boolean).join(' · ')}</div>` : ''}</div></div>
      ${d.why ? `<div class="q">${T(d.why)}</div>` : ''}
      ${d.lines && d.lines.length ? `<ul class="lines">${d.lines.map(l => `<li>${line(l)}</li>`).join('')}</ul>` : ''}
      ${d.recipes ? `<div class="list">${d.recipes.map(x => `<button class="row" data-a="openRecipe" data-r="${esc(x.id)}" data-focus="bom"><span class="main"><div class="name" style="font-weight:500;font-size:17px">${w('of_bom_row', { r: x.name, n: x.n })}</div></span><span class="chev">›</span></button>`).join('')}</div>` : ''}
      ${d.missing ? `<div class="meta"><b>${w('of_missing')}</b> ${T(d.missing)}</div>` : ''}
      ${d.cta || (d.area === 'team' && d.rid) ? `<div class="links">${ctaBtn(d)}</div>` : ''}</div>`;
  }
  const hm = iso => new Intl.DateTimeFormat(I.locale(), { timeZone: 'America/Chicago', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
  const chap = (h, n) => `<div class="chap"><h2>${h}</h2><span>${n}</span></div>`;
  const sec = (h, l, f) => l.length ? `<section>${chap(h, l.length)}<div class="list">${l.map(f || card).join('')}</div></section>` : '';

  /* Decisions: p.scope 'today' = only action_now (as V020 Today); otherwise everything + history */
  function decisions(d, p) {
    const today = p.scope === 'today', list = today ? d.decisions.filter(x => x.today) : d.decisions;
    const now = list.filter(x => x.cls === 'action_now'), later = list.filter(x => x.cls === 'needs_chef');
    const groups = {}; d.history.forEach(h => { (groups[h.group] = groups[h.group] || []).push(h); });
    const histRow = x => x.rid ? `<button class="row" data-a="openRecipe" data-r="${esc(x.rid)}"><span class="sev ${esc(x.sev)}" style="margin-top:0"></span><span class="main"><div class="name" style="font-weight:500;font-size:17px">${T(x.title)}</div>${x.why ? `<div class="meta">${T(x.why)}</div>` : ''}</span><span class="chev">›</span></button>`
      : `<div class="row"><span class="sev ${esc(x.sev)}" style="margin-top:0"></span><span class="main"><div class="name" style="font-weight:500;font-size:17px">${T(x.title)}</div><div class="meta">${[T(x.why), x.date ? day(x.date) : ''].filter(Boolean).join(' · ')}</div></span></div>`;
    const fold = (key, h, l) => `<section>${chap(h, l.length)}<div class="list">${p['m_' + key] ? l.map(histRow).join('') : `<button class="more" data-a="ofMore" data-k="m_${esc(key)}">${w('of_show', { n: l.length })}</button>`}</div></section>`;
    return {
      eyebrow: today ? w('of_head_today') : w('of_head'), title: w('of_need_you', { n: list.length }), sub: w('of_checked', { t: hm(d.checked_at) }),
      body: sec(w('of_act_now'), now) + sec(w('of_later'), later)
        + (today ? `<button class="lnk" data-a="ofAll">${w('of_more_link', { n: later.length })}</button>`
          : (d.completeness.length ? `<div class="list"><button class="row" data-a="openComplete"><span class="main"><div class="name">${w('of_completeness')}</div><div class="meta">${w('of_completeness_sub')}</div></span><span class="chev">›</span></button></div>` : '')
          + (d.stale.length ? fold('stale', w('of_rl_yield_resolved'), d.stale.map(x => Object.assign({}, x, { sev: 'green' }))) : '')
          + Object.entries(groups).sort((a, b) => b[1].length - a[1].length).map(([k, l]) => fold(k, w(k), l)).join(''))
        + `<p class="note" style="font-size:14px">${w('of_ro_note')}</p>`,
    };
  }
  function invoices(d) {
    const v = d.invoices, st = s => W['of_st_' + s] ? w('of_st_' + s) : esc(s);
    return {
      eyebrow: w('of_office'), title: w('of_invoices'), sub: w('of_inv_sub', { w: v.warnings, n: v.invoices }),
      body: sec(w('of_needs_you'), v.needs) + sec(w('of_in_review'), v.queue) + sec(w('of_for_info'), v.info)
        + (v.excluded ? `<section><div class="list">${card({ sev: 'neutral', title: { k: 'of_excluded', p: { n: v.excluded } }, why: { k: 'of_excluded_why' } })}</div></section>` : '')
        + `<section>${chap(w('of_docs30'), v.docs.length)}<div class="list">${v.docs.slice(0, 40).map(x => `<div class="row"><span class="main"><div class="name">${esc(x.vendor)} · ${esc(x.number)}</div><div class="meta">${x.date ? day(x.date) : ''} · ${st(x.status)}</div></span>${x.status === 'error' ? '<span class="dotr"></span>' : ''}</div>`).join('')}</div></section>`
        + `<p class="note" style="font-size:14px">${w('of_ro_note')}</p>`,
    };
  }
  /* My Shift row (only what needs Chef today) and the two tiles in Recipes */
  function todayRow(d) {
    const needs = d.decisions.filter(x => x.today); if (!needs.length) return '';
    const reds = needs.some(x => x.sev === 'red');
    return `<div class="list"><button class="row" data-a="openOffice" data-k="decisions" data-scope="today"><span class="${reds ? 'dotr' : 'dotw'}"></span><span class="main"><div class="name">${w('of_need_you', { n: needs.length })}</div><div class="meta">${needs.slice(0, 3).map(x => T(x.title)).join(' · ')}${needs.length > 3 ? ' · …' : ''}</div></span><span class="chev">›</span></button></div>`;
  }
  function tiles(d, icons) {
    const t = (k, ic, lbl, val, cls) => `<button class="big ${cls || ''}" data-a="openOffice" data-k="${k}">${ic}<div><div class="lbl">${lbl}</div><div class="val">${val}</div></div></button>`;
    const dec = d ? d.decisions : null, inv = d ? d.invoices.tile : null;
    return `<section><div class="chap"><h2>${w('of_tools')}</h2></div><div class="grid">
      ${t('decisions', icons.alert, w('of_decisions'), dec ? w('of_tile_dec', { n: dec.length }) : '…', dec && dec.some(x => x.cls === 'action_now') ? 'alert' : '')}
      ${t('invoices', icons.doc, w('of_invoices'), inv ? w('of_tile_inv', inv) : '…', inv && inv.now ? 'alert' : '')}</div></section>`;
  }
  /* My Shift: only the important alerts (action_now), each opens its own decision */
  function alertRows(d) {
    const needs = d.decisions.filter(x => x.today); if (!needs.length) return '';
    return `<section><div class="chap"><h2>${w('of_alerts')}</h2><span>${needs.length}</span></div><div class="list alerts">${needs.map(alertRow).join('')}</div></section>`;
  }
  const alertRow = x => `<button class="row" data-a="openDecision" data-key="${esc(x.key)}"><span class="${x.sev === 'red' ? 'dotr' : 'dotw'}"></span><span class="main"><div class="name">${T(x.title)}</div><div class="meta">${T(x.why)}</div></span><span class="chev">›</span></button>`;
  /* Ufficio world home (Chef only) */
  function home(d, icons, compRow) {
    const needs = d.decisions.filter(x => x.today);
    return `<section><div class="chap"><h2>${w('of_alerts')}</h2><span>${needs.length || ''}</span></div><div class="list alerts">${needs.map(alertRow).join('') || `<div class="row"><span class="main"><div class="meta">${w('of_no_alerts')}</div></span></div>`}</div></section>`
      + tiles(d, icons)
      + (compRow || '')
      + `<p class="note" style="font-size:14px">${w('of_checked', { t: hm(d.checked_at) })} ${w('of_ro_note')}</p>`;
  }
  function single(d, key) {
    const x = d.decisions.find(y => y.key === key);
    const body = x ? `<div class="list">${card(x)}</div>` : `<p class="note">${w('of_gone')}</p>`;
    return `<div><div class="eyebrow">${w('w_office_eyebrow')}${x ? ' · ' + w(x.cls === 'action_now' ? 'of_act_now' : 'of_later') : ''}</div><h1>${w('of_decision')}</h1></div>${body}
      <button class="lnk" data-a="openOffice" data-k="decisions" data-scope="all">${w('of_open_all')}</button>`;
  }
  /* recipe opened from a decision: which card, and the box on top of the recipe (as Shell V020) */
  function fixFor(d, rid, focus) { return d.decisions.find(x => x.focus === focus && (x.rid === rid || (x.recipes || []).some(r => r.id === rid))) || null; }
  function fixBox(f) {
    return `<div class="fixbox ${esc(f.sev)}"><div class="h">${w('of_to_fix', { t: { raw: '' } }).replace(/\s*$/, ' ')}${T(f.title)}</div>${f.why ? `<div>${T(f.why)}</div>` : ''}${f.now ? `<div><b>${w('of_now')}</b> ${T(f.now)}</div>` : ''}${f.missing ? `<div><b>${w('of_missing')}</b> ${T(f.missing)}</div>` : ''}
      <div><a class="btn ghost" href="${BRIGADE_URL}" target="_blank" rel="noopener">${w('of_fix_in_brigade')} ↗</a></div></div>`;
  }
  window.OfficeUI = { alertRows, home, single, fixFor, fixBox, T, w, card, decisions, invoices, todayRow, tiles, title: k => w(k === 'invoices' ? 'of_invoices' : 'of_decisions'), _W: W };
})();
