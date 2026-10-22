-- TEC01 (B-63, Max 22/10/2026) — BOZZA DI LABORATORIO, NON APPLICATA: serve il GO di Max e l'approvazione a mano.
-- T.E.C. scrive IN BOZZA per Max nel laboratorio ricette di Brigade 2.0 (schema mre): mai pubblicare, mai cancellare, mai prezzi.
-- 1) nuovo ruolo dell'app «assistente» (il server lo blocca su TUTTO tranne le operazioni tec_*: vedi brigade-app-api/index.ts TEC_OPS)
-- 2) utente «T.E.C. per Max» SENZA PIN (non può entrare né in Brigade né in Brigade 2.0 dalla pagina di login)
-- 3) la sessione di T.E.C. NON è in questo file: la crea lo script tec01_sessione (codice generato sul Mac, nel database solo l'impronta
--    SHA-256, il codice solo in ~/tec/data/secrets/brigade_assistente.json con permessi 600; mai in chat, email o rapporti).
-- RITORNO INDIETRO: tec01_rollback.sql (revoca la sessione, toglie l'accesso, disattiva l'utente, rimette il controllo dei ruoli).
begin;
alter table public.app_access drop constraint if exists app_access_app_role_check;
alter table public.app_access add constraint app_access_app_role_check check (app_role in ('chef', 'staff', 'assistente'));
insert into public.users (id, name, lang, is_admin, role, active, pin, pin_hash, first_login)
select coalesce(max(id), 0) + 1, 'T.E.C. per Max', 'it', false, 'assistente', true, null, null, false from public.users
 where not exists (select 1 from public.users where name = 'T.E.C. per Max');
insert into public.app_access (user_id, app_role, note)
select id, 'assistente', 'B-63: T.E.C. scrive solo BOZZE per Max (Max 22/10/2026). Revoca: tec01_rollback.sql' from public.users where name = 'T.E.C. per Max'
on conflict (user_id) do nothing;
do $$ begin
  if (select count(*) from public.users u join public.app_access a on a.user_id = u.id where u.name = 'T.E.C. per Max' and a.app_role = 'assistente' and u.pin is null and u.pin_hash is null) <> 1 then
    raise exception 'TEC01: utente T.E.C. non creato come previsto'; end if;
end $$;
commit;
