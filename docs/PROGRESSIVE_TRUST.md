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

## Fish workflow (R1.11.2, Chef 16/10)
- **Branzino** arrives whole. Table Side processes it: part is gutted and cleaned but left whole (Branzino Chef Style / Table Side), part is filleted, cleaned, wrapped and frozen.
  - Table Side card: whole branzino (gutted and cleaned) for today, from POS (Branzino Chef Style).
  - Oven card: branzino filets for the Siciliana, ready (thawed) for today. No POS number: "Siciliana cartoccio" has no yield, so the filets per portion are unknown. The card shows the Chef's reference instead (about 5–7 Monday–Thursday, about 10 Friday–Saturday): a reference, never a fixed amount.
  - Filleting and freezing is not a daily card: it needs the filets per fish (Chef) and a count of the frozen stock (Step 3). The need is never asked in two stations.
- **Salmon** arrives as large whole filets, portioned to 200 g. One Amalfi Salmon = one filet; the "Add salmon whole" modifier = one filet. Salmon Pistachio is off the menu (last POS sale 26/06/2026) and is not counted.
- **Thaw times** (Chef's current practice, not an HACCP validation): lobster ~15 min, branzino filet ~10 min, salmon ~20 min. No time where the Chef gave none.

## Dynamic assignment (design only — `GATES.reassign = false`, nothing reassigns today)
A task belongs to a home station (branzino processing → Table Side), but a cook who has finished their own tasks can take others, whatever the station.
- **Task ≠ person.** Each card keeps its home station. An assignment says *who* does it on one shift; it never moves the need to another station (no duplicates).
- **Who decides.** The Chef or the shift lead offers or assigns; a cook can ask "anything else?" when their list is complete. No automatic reassignment until a new GO.
- **When it is offered.** Only when the home station has open cards near their deadline and another cook has 100% of their own cards ticked. The suggestion names the task, not a ranking of people.
- **Trust level.** The cook who takes the task sees it at their own level (step 1 tick). Step 2/3 rules stay per cook and per station: helping elsewhere does not raise a level and does not count as a worked shift at that station.
- **Record (needs the ticks migration).** One extra field per tick: `assigned_from_station` + `assigned_by`. Without the migration nothing is stored.
- **Not now.** No screen, no API, no writes. Turning it on = new release with tag and rollback, after the Chef's GO.

## POS add-ons and branzino yield (R1.11.3, Chef 16/10)
- **Add-ons = POS modifiers.** Each checklist total = main dishes (POS menu items) + add-ons (POS modifiers), each POS name counted once (case and duplicate aliases removed), modifiers only from `pos_modifiers`, dishes only from `pos_sales_by_item`.
- **Nothing sold is dropped silently.** Every sold POS name that matches the product (lobster, shrimp, calamari, salmon, branzino) and is not counted shows in the Chef's Why? under "Sold but not counted", with its sales: dish without recipe · add-on without quantity · substitution · removal · note only. They enter the forecast only once a quantity is mapped (Chef).
- **Branzino.** Bought whole by weight (~2.1 lb average: a purchasing figure, never a filet weight). One cleaned whole fish per Branzino Chef Style (Table Side). One fish = 2 filets. Siciliana = 1 filet per portion (`chef_per_portion`, forecast only; the official recipe is not changed). Filets for the Siciliana are asked in Oven; the whole-fish equivalent (filets ÷ 2) is shown only as information; frozen stock is not counted until Step 3.
- **Margins for filets** (backtest 9/6→15/10): Mon–Thu +25%, Fri/Sat +30%.
