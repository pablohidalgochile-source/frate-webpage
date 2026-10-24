-- ═══════════════════════════════════════════════════════════════════
-- 🔧 Parche de rrpp_norm — correr DESPUÉS de frate-rrpp-rendimiento.sql
-- ═══════════════════════════════════════════════════════════════════
-- El btrim corría ANTES de limpiar los símbolos, así que la arroba se
-- convertía en espacio cuando ya no había nada que recortar:
--
--   rrpp_norm('@thiscotty · CONSTANZA')  →  ' THISCOTTY CONSTANZA'   ← sobra el espacio
--
-- Para el match de identidad no molestaba, pero la clave de la RRPP se
-- arma con este texto: "EMBAJADORA COTTY" y "@embajadora cotty" quedaban
-- como dos promotoras distintas. Ahora recorta al final.
--
-- Seguro de correr ahora porque todavía no has unido ninguna identidad.
-- Si ya tuvieras filas en rrpp_alias, habría que rehacerlas.
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.rrpp_norm(p_txt text)
returns text language sql immutable as $$
  select nullif(
    btrim(regexp_replace(
      upper(translate(coalesce(p_txt,''),
                      'áéíóúÁÉÍÓÚäëïöüÄËÏÖÜàèìòùÀÈÌÒÙñÑ',
                      'aeiouAEIOUaeiouAEIOUaeiouAEIOUnN')),
      '[^A-Z0-9]+', ' ', 'g')),
    '')
$$;


-- Chequeo: las tres tienen que salir SIN espacio al principio ni al final.
select public.rrpp_norm('@thiscotty · CONSTANZA RIVERA CASTRO') as con_arroba,
       public.rrpp_norm('EMBAJADORA COTTY')                     as texto_suelto,
       public.rrpp_norm('  Embajadora   Cotty  ')               as con_espacios,
       -- y estas dos tienen que dar EXACTAMENTE lo mismo
       (public.rrpp_norm('EMBAJADORA COTTY') = public.rrpp_norm('@embajadora cotty')) as ahora_son_la_misma;
