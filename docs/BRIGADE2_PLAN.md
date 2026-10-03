# Brigade 2.0 — piano canonico (unico)

Fonte delle decisioni: thread Gmail "BRIGADE — Nuova app · base congelata · Max + Pablo" (dal 03/10/2026).
Questo è l'unico piano: niente piani concorrenti, niente Shell alternative.

## Nomi
- **Brigade** = l'app usata oggi dai ragazzi (repo 1cos/back-of-house, GitHub Pages, branch brigade-main;
  Supabase ydqmumpytgrlceuinoqt; motore costi FC05 = schema `food_cost`). Chef la chiama anche BOS.
- **Brigade 2.0** = questa app (repo 1cos/brigade-app → https://1cos.github.io/brigade-app/).
- **Shell 0.20 (V020-B Clean Pass)** = riferimento grafico congelato: tag `base-v020b-frozen-2026-10-03`
  (1cos/brigade-dev @ 7d834e6), copia in `base-frozen/`.
- BOS 2 / BOH OS v2 = solo riferimento di idee, non è il sistema operativo.

## Regole (EASY / TRUST / CLEAN)
- Una sola fonte dati: Brigade 2.0 legge il database di Brigade (nessuna copia). Le scritture di prova vanno in
  `app_events` (mode='test') finché Max non autorizza la prova operativa.
- Un solo tema chiaro, un solo font (Archivo per titoli, sistema per testo), stessi componenti per Max e staff.
- Tab richiudibili come spazi di lavoro; niente modal annidate; X = torni da dove l'hai aperta.
- Tre lingue: en / it / es (quelle configurate in `users.lang`), un solo dizionario (`web/i18n.js`, `RT` in `web/recipe.js`).
  Il contenuto delle ricette non si traduce automaticamente.
- Dato mancante = mostrato come mancante, mai 0 o "OK".
- Ogni modulo: leggere l'originale → scopo/azione → integrare con permessi e traduzioni → prova completa Max+Pablo
  (UI → backend → dato → UI) → controllo EASY/TRUST/CLEAN → fissato nella base.

## Architettura
- `web/` PWA statica, nessuna chiave Supabase. Parla solo con la funzione `brigade-app-api`.
- Accesso: `app_access` (Max id 1 chef, Pablo id 38 staff). Sessioni proprie `app_sessions` (30 gg scorrevoli).
- Costi: solo motore FC05 (`food_cost.recipe_breakdown`) via `app_recipe_cost`, solo per chef. Allo staff il server
  toglie ogni campo prezzo/costo/margine.

## Moduli
| # | Modulo | Stato |
|---|---|---|
| 1 | Accesso riservato, sessione persistente, cambio utente | fatto R1.0 |
| 2 | My Shift (priorità postazione, messaggi Chef, segnalazioni) | fatto R1.0 (scritture di prova) |
| 3 | Prep → Start / Done (quantità reale) / Count | fatto R1.0 (scritture di prova) |
| 4 | Scheda ricetta Max/staff = BR-UI02 (porzioni numero+slider, PREP/COSTO/STRUTTURA) | fatto R1.1 |
| 5 | Tre lingue su tutta l'interfaccia | fatto R1.1 (vedi limiti) |
| 6 | Planner delle cose da fare (studio del Planner attuale prima) | da fare |
| 7 | Decisions / Attention per Max | da fare |
| 8 | Ufficio (voce per voce, con evidenze; decisioni a Max) | da fare |
| 9 | Passaggio scritture prova → tabelle vere | attende Max |

## Decisioni pendenti (attende Max)
- Passaggio di Done / conte / segnalazioni alle tabelle vere (prep_log, prep_stock_counts, chef_reports).
- Dati ricette da correggere segnalati dalla scheda (es. Halved Tomatoes: porzione 1 g → 1000 porzioni per lotto).
- Timer email 10 minuti lato Claude: non attivabile da Claude in questa sessione (permesso negato), vedi thread.
