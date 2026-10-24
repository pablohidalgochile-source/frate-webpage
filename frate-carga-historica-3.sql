-- ═══ carga histórica · PARTE 3 de 6 ═══
-- Corre las partes EN ORDEN. Cada una queda entera.

create view public.v_rrpp_listas
with (security_invoker = on) as
-- a) lo real: lo que pasó por el escáner
select p.clave, p.rrpp_nombre, p.tiene_cuenta, p.rrpp_id,
       p.lista_id, p.lista_nombre, p.fecha, p.evento_id, p.evento_nombre, p.lista_tipo,
       false                                       as historico,
       count(*)::int                               as fichas,
       sum(p.personas_pedidas)::int                as personas_pedidas,
       count(*) filter (where p.genero='F')::int   as fichas_mujer,
       count(*) filter (where p.genero='M')::int   as fichas_hombre,
       count(*) filter (where p.genero not in ('F','M'))::int as fichas_sin_genero,
       sum(p.qr_emitidos)::int                     as qr_emitidos,
       count(*) filter (where p.qr_emitidos = 0)::int as fichas_sin_qr,
       sum(p.entraron)::int                        as entraron
from public.v_rrpp_personas p
group by p.clave, p.rrpp_nombre, p.tiene_cuenta, p.rrpp_id,
         p.lista_id, p.lista_nombre, p.fecha, p.evento_id, p.evento_nombre, p.lista_tipo

union all

-- b) lo declarado: solo listas históricas que NO tienen inscritos reales,
--    para que una lista a medio cargar no se cuente dos veces.
select
  public.rrpp_clave_final(
    coalesce(coalesce(l.duenio_id, public.rrpp_cuenta_de_texto(l.duenio_nombre))::text,
             'txt:'||public.rrpp_norm(l.duenio_nombre), 'sin-duenio'))    as clave,
  coalesce(nullif('@'||c.username,'@'),
           nullif(btrim(coalesce(c.nombres,'')||' '||coalesce(c.apellidos,'')),''),
           nullif(btrim(coalesce(l.duenio_nombre,'')),''), '(sin dueño)') as rrpp_nombre,
  (coalesce(l.duenio_id, public.rrpp_cuenta_de_texto(l.duenio_nombre)) is not null) as tiene_cuenta,
  coalesce(l.duenio_id, public.rrpp_cuenta_de_texto(l.duenio_nombre))     as rrpp_id,
  l.id, l.nombre, coalesce(e.fecha::date, l.fecha::date), l.evento_id, e.nombre, l.tipo,
  true                                                                    as historico,
  coalesce(l.hist_inscritos,0),
  coalesce(l.hist_inscritos,0),
  coalesce(l.hist_mujeres,0),
  coalesce(l.hist_hombres,0),
  greatest(coalesce(l.hist_inscritos,0) - coalesce(l.hist_mujeres,0) - coalesce(l.hist_hombres,0), 0),
  -- «quemaron su QR» ⇒ los inscritos tenían QR. Es un supuesto, y por eso
  -- la fila va marcada histórica: nadie va a creer que esto se escaneó.
  coalesce(l.hist_inscritos,0),
  0,
  coalesce(l.hist_entraron,0)
from public.listas l
left join public.eventos e on e.id = l.evento_id
left join public.clientes c on c.id = coalesce(l.duenio_id, public.rrpp_cuenta_de_texto(l.duenio_nombre))
where l.eliminada_at is null
  and l.hist_inscritos is not null
  and not exists (select 1 from public.lista_inscritos li where li.lista_id = l.id);
