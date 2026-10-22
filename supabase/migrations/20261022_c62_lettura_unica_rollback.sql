-- C-62 ritorno indietro: toglie la lettura unica. Il server (se già rilasciato) torna da solo alla lettura vecchia.
drop function if exists mre.official_bundle(uuid[]);
