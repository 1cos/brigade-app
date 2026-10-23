-- MR-12 RITORNO INDIETRO: toglie «Pubblica una ricetta nuova» e «Ritira». Le ricette già create restano in Brigade come tutte le altre
-- (la colonna created resta: è solo un'annotazione nel laboratorio e non cambia niente per bot, FC05 e app).
begin;
drop policy if exists mre_app_controlli on mre.publications;
drop policy if exists mre_app_legge on mre.publications;
drop function if exists mre.publish_withdraw(bigint, bigint);
drop function if exists mre.publish_create(uuid, text, jsonb, bigint, int);
commit;
