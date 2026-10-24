-- frate-form-reabrir.sql · 19-oct-2026
--
-- Link para que la PERSONA complete su propia ficha (las del bot de WhatsApp
-- nacen sin fecha y hoy sólo las puede arreglar un admin a mano).
--
-- ⚠️ Este link muestra datos personales —nombre, teléfono, correo, Instagram—
--    a quien tenga la URL. Por eso:
--      · el token NO existe hasta que un admin lo pide (no hay token por defecto);
--      · es aleatorio y largo (no se adivina ni se enumera);
--      · caduca (por defecto 7 días);
--      · se puede revocar poniéndolo en null.
--    El edge que lo usa devuelve SÓLO `tipo` y `datos`: nunca gestión, historial,
--    notas ni el id interno.

alter table public.formularios
  add column if not exists reabrir_token text,
  add column if not exists reabrir_exp   timestamptz;

comment on column public.formularios.reabrir_token is
  'Token del link de auto-completado. NULL = sin link vivo. Lo emite un admin.';
comment on column public.formularios.reabrir_exp is
  'Hasta cuándo sirve el token. Vencido = el link ya no abre.';

-- Único y buscable. Parcial: la enorme mayoría de las fichas no tiene token.
create unique index if not exists ux_form_reabrir_token
  on public.formularios(reabrir_token) where reabrir_token is not null;

-- Emite (o renueva) el token de UNA ficha y devuelve el valor.
-- Sólo admin: la misma puerta que usa el resto del panel.
create or replace function public.form_emitir_token(p_id bigint, p_dias int default 7)
returns text
language plpgsql security definer set search_path to 'public'
as $function$
declare t text;
begin
  if not exists (select 1 from clientes c where c.id = auth.uid() and c.rol = 'admin') then
    raise exception 'solo_admin';
  end if;
  -- 32 bytes aleatorios en hex = 64 caracteres. No se enumera.
  t := encode(gen_random_bytes(32), 'hex');
  update formularios
     set reabrir_token = t,
         reabrir_exp   = now() + (greatest(1, least(coalesce(p_dias,7), 30)) || ' days')::interval
   where id = p_id;
  if not found then raise exception 'ficha_no_existe'; end if;
  return t;
end; $function$;

-- Revocar a mano.
create or replace function public.form_revocar_token(p_id bigint)
returns void
language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not exists (select 1 from clientes c where c.id = auth.uid() and c.rol = 'admin') then
    raise exception 'solo_admin';
  end if;
  update formularios set reabrir_token = null, reabrir_exp = null where id = p_id;
end; $function$;

revoke all on function public.form_emitir_token(bigint,int)  from anon, authenticated;
revoke all on function public.form_revocar_token(bigint)     from anon, authenticated;
grant execute on function public.form_emitir_token(bigint,int) to authenticated;
grant execute on function public.form_revocar_token(bigint)    to authenticated;
