# Progressive Trust — Smart Station Checklists (B-51, R1.11)

One system, three levels on the same cards (My Shift → station → checklist). Same users (`users`, `app_access`),
same stations (`staff_stations`), same catalog (recipes + POS). No second system.

| Step | What the cook does | Status in R1.11 |
|---|---|---|
| 1 Checklist | one question, one tick: "Do we have 24 lobsters ready for today?" | ACTIVE — simulation, Chef only, ticks on the phone only |
| 2 Confirm quantities | "How many lobsters are ready?" → enough / N more | BUILT (engine `confirmResult`, screen), switched OFF |
| 3 Stock & production | real counts, productions, yields/lots, stock moves | DESIGN ONLY — no code that writes |

## Locks (why a level cannot rise by mistake)
1. Release switches in code, frozen: `GATES = { staffVisible:false, step2:false, step3:false }` (`_shared/checklist_core.js`).
   Turning one on = a new release (tag, rollback). No tap, setting or request can change them.
2. The level is computed only on the server (`levelFor`): switch ON **and** a Chef grant for that cook, not revoked. Anything
   the phone sends (`level`, `step`, `gates`) is ignored. Step 3 is never returned.
3. The screen caps what it draws at step 2 (`MAX_UI_LEVEL`) and reads the level only from the server answer.
4. Cooks get `forCook()`: question + amount, no Why, no margins, no events. Past-day simulation is Chef only.

## Progression (individual, Chef decides)
`progressionAdvice()` — a discreet suggestion to the Chef, never automatic, never shown to colleagues, no score:
- counts only **worked shifts at that station** from a real source (schedule + clock-in). Ticks are never proof of presence.
- needs **5 worked shifts in a row** in the last 14 days with ≥ 90% of the assigned checks answered; a worked shift with
  checks missing resets the run. Calendar days do not matter (a part-time cook qualifies on their shifts).
- it says "regular", not "accurate": a tick is not a proof of accuracy. The Chef decides, per cook; reversible (revoke).
- **Missing today:** worked shifts. `shifts_schedule` (7shifts) stops at 18/07/2026 (last sync 15/07). Until a source exists the
  advice always answers "no worked shifts on record".

## Saving ticks per cook and shift (study — needs GO, not applied)
Option A (recommended, smallest): reuse `app_events` (already user-scoped, `mode` test/live, unique `client_key`):
```sql
-- NOT APPLIED. Needs Chef GO.
alter table public.app_events drop constraint app_events_kind_check;
alter table public.app_events add constraint app_events_kind_check check (kind = any (array[
  'prep_start','prep_done','count','report','chef_message','message_read','report_read','station_check']));
-- station_check: user_id, text = item key, qty = amount asked (unit), mode, client_key (no double tick),
-- ref_id = null; service day + station in a small json in text, or two nullable columns (service_day date, station text).
```
Option B: dedicated `app_station_checks(user_id, station, service_day, item_key, asked_qty, unit, answer, level, created_at, revoked_at,
client_key unique)` + `app_trust_grants(user_id, step, granted_by, granted_at, revoked_at)`. Cleaner reporting, one more table.
Both: no stock table touched; a tick is a statement, never a sale or a deduction. Undo = `revoked_at`, never delete.

## Step 3 (design only)
Records it would add, all from the same cards: `ready_count` (Step 2 counts saved), `production` (batch made, linked to the
recipe yield), `yield_lot` (real yield, lot / date), `stock_move` (only through the existing deduction engine).
Activation requires: explicit Chef approval, role permissions, and deduction tests on a copy before any live write.
