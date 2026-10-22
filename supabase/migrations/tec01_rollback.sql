-- TEC01 RITORNO INDIETRO: T.E.C. non entra più. Le bozze già salvate restano nel laboratorio (Max le vede e decide).
begin;
update public.app_sessions set revoked_at = now() where revoked_at is null and user_id = (select id from public.users where name = 'T.E.C. per Max');
delete from public.app_access where user_id = (select id from public.users where name = 'T.E.C. per Max');
update public.users set active = false where name = 'T.E.C. per Max';
alter table public.app_access drop constraint if exists app_access_app_role_check;
alter table public.app_access add constraint app_access_app_role_check check (app_role in ('chef', 'staff'));
commit;
