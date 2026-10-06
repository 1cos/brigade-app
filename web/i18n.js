/* Brigade 2.0 — one translation system for the whole interface. Languages = the three configured in Brigade
   (users.lang: en, it, es). Recipe CONTENT is never translated here: only the interface around it. */
(function () {
  const D = {
    // navigation
    w_today: ['My Shift', 'Il mio turno', 'Mi turno'], w_rest: ['Recipes', 'Ricette', 'Recetas'], w_cat: ['Catering', 'Catering', 'Catering'], w_plan: ['Planner', 'Planner', 'Agenda'],
    find: ['Find', 'Cerca', 'Buscar'], close: ['Close', 'Chiudi', 'Cerrar'], test_mode: ['Test mode', 'Prova', 'Prueba'], chef: ['Chef', 'Chef', 'Chef'],
    // generic states
    loading: ['Loading…', 'Carico…', 'Cargando…'], no_answer: ['Brigade did not answer.', 'Brigade non risponde.', 'Brigade no responde.'],
    no_conn: ['No connection.', 'Nessuna connessione.', 'Sin conexión.'], try_again: ['Try again', 'Riprova', 'Reintentar'],
    not_saved: ['Not saved. Try again.', 'Non salvato. Riprova.', 'No guardado. Reintenta.'], offline_save: ['No connection. Nothing was saved — try again.', 'Nessuna connessione. Non è stato salvato nulla: riprova.', 'Sin conexión. No se guardó nada: reintenta.'],
    check_qty: ['Check the quantity.', 'Controlla la quantità.', 'Revisa la cantidad.'], choose_unit: ['Choose a unit.', 'Scegli un\'unità.', 'Elige una unidad.'],
    signed_out: ['Signed out.', 'Sei uscito.', 'Sesión cerrada.'],
    test_note: ['Test mode: Start, Done, counts, reports and messages are saved in this app only. They do not change Brigade\'s prep, stock or costs, and nobody else is notified.',
      'Modalità prova: Start, Done, conte, segnalazioni e messaggi restano in questa app. Non cambiano prep, scorte o costi di Brigade e nessuno riceve notifiche.',
      'Modo prueba: Start, Done, conteos, reportes y mensajes quedan solo en esta app. No cambian la prep, el stock ni los costos de Brigade y nadie recibe avisos.'],
    // my shift
    gm: ['Good morning', 'Buongiorno', 'Buenos días'], ga: ['Good afternoon', 'Buon pomeriggio', 'Buenas tardes'], ge: ['Good evening', 'Buonasera', 'Buenas noches'],
    plan_old: ['Today\'s prep plan is not out yet. This is the plan of <b>{d}</b>. ', 'Il piano prep di oggi non è ancora uscito. Questo è il piano di <b>{d}</b>. ', 'El plan de prep de hoy aún no salió. Este es el plan del <b>{d}</b>. '],
    start_with: ['Start with <b>{n}</b>. {c} to make.', 'Inizia da <b>{n}</b>. {c} da fare.', 'Empieza con <b>{n}</b>. {c} por hacer.'],
    preps: [['prep', 'preps'], ['prep', 'prep'], ['prep', 'preps']],
    all_done: ['Your prep is done for now.', 'Per ora la tua prep è fatta.', 'Por ahora tu prep está hecha.'], nothing_station: ['Nothing in the plan for your station.', 'Niente nel piano per la tua postazione.', 'Nada en el plan para tu estación.'],
    do_first: ['Do first', 'Prima di tutto', 'Primero'], prep_today: ['Prep today', 'Da fare oggi', 'Prep de hoy'], count_first: ['Count first', 'Prima conta', 'Contar primero'],
    count_what: ['Count what is there', 'Conta quello che c\'è', 'Cuenta lo que hay'],
    msg_team: ['Message the team', 'Scrivi alla brigata', 'Escribir al equipo'], from_chef: ['From Chef', 'Da Chef', 'De Chef'], your_msgs: ['Your messages', 'I tuoi messaggi', 'Tus mensajes'],
    new_n: ['{n} new', '{n} nuovi', '{n} nuevos'], to_everyone: ['to everyone', 'a tutti', 'a todos'], to_you: ['to you', 'a te', 'a ti'], everyone: ['Everyone', 'Tutti', 'Todos'],
    problems: ['Problems reported', 'Problemi segnalati', 'Problemas reportados'], no_problems: ['No problems reported.', 'Nessun problema segnalato.', 'Sin problemas reportados.'],
    all: ['All', 'Tutte', 'Todas'], no_prep_station: ['No prep in the plan for this station.', 'Nessuna prep nel piano per questa postazione.', 'No hay prep en el plan para esta estación.'],
    done_today: ['Done today', 'Fatto oggi', 'Hecho hoy'], report: ['Report a problem', 'Segnala un problema', 'Reportar un problema'],
    report_sub: ['Goes straight to Chef, with your name.', 'Arriva subito a Chef, con il tuo nome.', 'Llega directo a Chef, con tu nombre.'],
    you_reported: ['You reported', 'Hai segnalato', 'Reportaste'],
    // prep
    plan: ['Plan', 'Piano', 'Plan'], not_in_plan: ['Not in the prep plan today.', 'Non è nel piano prep di oggi.', 'No está en el plan de hoy.'],
    brigade_stock: ['Brigade stock', 'Scorta in Brigade', 'Stock en Brigade'], not_recorded: ['not recorded', 'non registrata', 'sin registro'], container: ['Container', 'Contenitore', 'Recipiente'],
    recipe_sub: ['Recipe · quantities and method', 'Ricetta · quantità e procedimento', 'Receta · cantidades y método'],
    last2: ['Last 2 days', 'Ultimi 2 giorni', 'Últimos 2 días'], made: ['made', 'fatto', 'hecho'], counted: ['counted', 'contato', 'contado'], started: ['started', 'iniziato', 'empezado'],
    report_prep: ['Report a problem with this prep', 'Segnala un problema su questa prep', 'Reportar un problema con esta prep'],
    start: ['Start', 'Inizia', 'Empezar'], done: ['Done', 'Fatto', 'Hecho'], count: ['Count', 'Conta', 'Contar'],
    started_at: ['Started {t}', 'Iniziato {t}', 'Empezado {t}'], done_at: ['Done at {t} · {q}', 'Fatto alle {t} · {q}', 'Hecho a las {t} · {q}'],
    counted_at: ['Counted at {t} · {q} there', 'Contato alle {t} · {q} presenti', 'Contado a las {t} · {q} en stock'],
    pill_done: ['Done · {q}', 'Fatto · {q}', 'Hecho · {q}'], pill_counted: ['Counted {q}', 'Contato {q}', 'Contado {q}'],
    // quantity sheets
    how_made: ['How much did you make?', 'Quanto hai fatto?', '¿Cuánto hiciste?'], how_there: ['How much is there now?', 'Quanto ce n\'è adesso?', '¿Cuánto hay ahora?'],
    plan_says: [' · the plan says {q}', ' · il piano dice {q}', ' · el plan dice {q}'], recipe_makes: [' · the recipe makes about {q}', ' · la ricetta rende circa {q}', ' · la receta rinde aprox. {q}'],
    only_ref: ['. Only a reference: write what you really made.', '. Solo un riferimento: scrivi quanto hai fatto davvero.', '. Solo una referencia: escribe lo que hiciste de verdad.'],
    count_help: [' · count what is in the walk-in and on the line. This is a count, not production.', ' · conta quello che c\'è in cella e in linea. È una conta, non una produzione.', ' · cuenta lo que hay en la cámara y en la línea. Es un conteo, no producción.'],
    save_done: ['Save Done', 'Salva Fatto', 'Guardar Hecho'], save_count: ['Save count', 'Salva conta', 'Guardar conteo'],
    write_made: ['Write how much you made.', 'Scrivi quanto hai fatto.', 'Escribe cuánto hiciste.'], write_there: ['Write how much is there (0 is fine).', 'Scrivi quanto ce n\'è (anche 0).', 'Escribe cuánto hay (0 vale).'],
    t_started: ['Started.', 'Iniziato.', 'Empezado.'], t_done: ['Done · {q}', 'Fatto · {q}', 'Hecho · {q}'], t_counted: ['Counted · {q}', 'Contato · {q}', 'Contado · {q}'],
    // report / message
    report_who: ['Chef sees it with your name', 'Chef la vede con il tuo nome', 'Chef lo ve con tu nombre'], report_prep_too: [' and this prep', ' e questa prep', ' y esta prep'],
    what_wrong: ['What is wrong?', 'Cosa non va?', '¿Qué pasa?'], send_chef: ['Send to Chef', 'Invia a Chef', 'Enviar a Chef'], sent_chef: ['Sent to Chef.', 'Inviato a Chef.', 'Enviado a Chef.'],
    write_wrong: ['Write what is wrong.', 'Scrivi cosa non va.', 'Escribe qué pasa.'], message: ['Message', 'Messaggio', 'Mensaje'], write_team: ['Write to the team', 'Scrivi alla brigata', 'Escribe al equipo'],
    send: ['Send', 'Invia', 'Enviar'], msg_sent: ['Message sent.', 'Messaggio inviato.', 'Mensaje enviado.'], write_msg: ['Write a message.', 'Scrivi un messaggio.', 'Escribe un mensaje.'],
    msg_note: ['They see it in their My Shift. Test mode: only Max and Pablo use this app.', 'Lo vedono nel loro turno. Prova: solo Max e Pablo usano questa app.', 'Lo ven en su turno. Prueba: solo Max y Pablo usan esta app.'],
    // recipes list / catering / planner
    read_only: ['Read-only', 'Sola lettura', 'Solo lectura'], search_n: ['Search {n} recipes', 'Cerca tra {n} ricette', 'Buscar en {n} recetas'], nothing_for: ['Nothing found for “{q}”.', 'Niente per “{q}”.', 'Nada para “{q}”.'],
    next2: ['Next 2 weeks', 'Prossime 2 settimane', 'Próximas 2 semanas'], guests: ['{n} guests', '{n} ospiti', '{n} invitados'], dishes: [['dish', 'dishes'], ['piatto', 'piatti'], ['plato', 'platos']],
    no_events: ['No events in the next 2 weeks.', 'Nessun evento nelle prossime 2 settimane.', 'No hay eventos en las próximas 2 semanas.'],
    what_cook: ['What to cook', 'Cosa cucinare', 'Qué cocinar'], no_recipe_link: ['No recipe linked', 'Nessuna ricetta collegata', 'Sin receta vinculada'], menu_not_set: ['Menu not set yet.', 'Menu non ancora definito.', 'Menú aún no definido.'],
    ts_menu: ['Tripleseat menu', 'Menu Tripleseat', 'Menú Tripleseat'], guests_event: ['{n} event guests (Tripleseat)', '{n} ospiti evento (Tripleseat)', '{n} invitados del evento (Tripleseat)'],
    ts_updated: ['Updated by itself from Tripleseat · version {v} · {d}', 'Aggiornato da solo da Tripleseat · versione {v} · {d}', 'Actualizado solo desde Tripleseat · versión {v} · {d}'],
    ts_qty: ['qty ×{n}', 'quantità ×{n}', 'cantidad ×{n}'], ts_empty: ['The Tripleseat document has no kitchen lines yet.', 'Il documento Tripleseat non ha ancora righe di cucina.', 'El documento de Tripleseat aún no tiene líneas de cocina.'],
    old_copy: ['Old Brigade copy (not updated)', 'Vecchia copia Brigade (non aggiornata)', 'Copia vieja de Brigade (no actualizada)'],
    old_copy_note: ['Imported earlier, never updated. The menu to cook is the Tripleseat one above.', 'Importata tempo fa, mai aggiornata. Il menu da cucinare è quello Tripleseat qui sopra.', 'Importada antes, nunca actualizada. El menú a cocinar es el de Tripleseat de arriba.'],
    event_nf: ['Event not found.', 'Evento non trovato.', 'Evento no encontrado.'], my_shifts: ['My shifts', 'I miei turni', 'Mis turnos'], closing: ['closing', 'chiusura', 'cierre'],
    no_shifts: ['No shifts from 7shifts in the next 2 weeks.', 'Nessun turno da 7shifts nelle prossime 2 settimane.', 'No hay turnos de 7shifts en las próximas 2 semanas.'],
    planner_todo_pending: ['The to-do planner arrives as its own module, after studying Brigade\'s current Planner.', 'Il planner delle cose da fare arriva come modulo a sé, dopo lo studio del Planner attuale di Brigade.', 'La agenda de tareas llegará como módulo propio, tras estudiar la Agenda actual de Brigade.'],
    // find / account
    find_ph: ['Recipe or prep', 'Ricetta o prep', 'Receta o prep'], switch_user: ['Switch user', 'Cambia utente', 'Cambiar usuario'],
    switch_sub: ['Signs you out. Tabs and drafts are cleared.', 'Esci. Tab e bozze vengono cancellate.', 'Cierra tu sesión. Se borran pestañas y borradores.'],
    reset: ['Reset layout', 'Riordina', 'Reiniciar vista'], reset_sub: ['Closes tabs and returns to My Shift.', 'Chiude le tab e torna al tuo turno.', 'Cierra las pestañas y vuelve a tu turno.'],
    language: ['Language', 'Lingua', 'Idioma'], reserved: ['reserved test', 'prova riservata', 'prueba reservada'], prep_word: ['Prep', 'Prep', 'Prep'], recipe_word: ['Recipe', 'Ricetta', 'Receta'],
    // login
    kitchen: ['Zeno\'s kitchen', 'Cucina di Zeno\'s', 'Cocina de Zeno\'s'], enter_pin: ['Enter your PIN', 'Inserisci il PIN', 'Ingresa tu PIN'], delete: ['Delete', 'Cancella', 'Borrar'],
    pin_bad: ['PIN not valid for this app.', 'PIN non valido per questa app.', 'PIN no válido para esta app.'], cooldown: ['Too many tries. Wait a few minutes.', 'Troppi tentativi. Aspetta qualche minuto.', 'Demasiados intentos. Espera unos minutos.'],
  };
  const IDX = { en: 0, it: 1, es: 2 };
  let lang = 'en';
  try { const s = localStorage.getItem('brigade-app-lang'); if (s && s in IDX) lang = s; } catch (e) {}
  function t(k, vars) {
    const e = D[k]; let s = e ? (e[IDX[lang]] ?? e[0]) : k;
    if (vars) Object.keys(vars).forEach(v => { s = String(s).split('{' + v + '}').join(vars[v]); });
    return s;
  }
  const plural = (n, k) => { const e = D[k], p = e ? (e[IDX[lang]] || e[0]) : [k, k + 's']; return `${n} ${n === 1 ? p[0] : p[1]}`; };
  const locale = () => ({ en: 'en-US', it: 'it-IT', es: 'es-ES' })[lang];
  window.I18N = {
    t, plural, locale, langs: ['en', 'it', 'es'], names: { en: 'English', it: 'Italiano', es: 'Español' },
    get lang() { return lang; },
    set(l, persist) { if (l in IDX) { lang = l; document.documentElement.lang = l; if (persist) try { localStorage.setItem('brigade-app-lang', l); } catch (e) {} } },
    hasChoice() { try { return !!localStorage.getItem('brigade-app-lang'); } catch (e) { return false; } },
    clearChoice() { try { localStorage.removeItem('brigade-app-lang'); } catch (e) {} },
  };
})();
