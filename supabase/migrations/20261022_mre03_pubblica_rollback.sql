-- MR-04 ritorno indietro dell'installazione di «Pubblica» (togli le funzioni; la tabella delle pubblicazioni si tiene se contiene
-- righe, perché è la copia di sicurezza delle ricette pubblicate: si toglie solo se è vuota).
begin;
drop function if exists mre.publish_write(uuid, text, jsonb, bigint, int);
drop function if exists mre.publish_restore(bigint, bigint);
drop function if exists mre.official_fc05(uuid);
drop function if exists mre.official_fp(uuid);
drop function if exists mre.official_rows(uuid);
do $$ begin
  if to_regclass('mre.publications') is not null and not exists (select 1 from mre.publications) then drop table mre.publications; end if;
end $$;
commit;
