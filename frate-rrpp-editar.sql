-- ============================================================
-- FRATE · Permitir que un RRPP EDITE inscritos de SUS listas
-- (arregla "modificar datos" y "normalizar" que no guardaban).
-- Proyecto WEB · SQL Editor. Aditivo (solo agrega policy de UPDATE).
--
-- Regla: puede editar un inscrito si es admin, O es RRPP dueño
-- (o co-dueño) de esa lista. Igual criterio que el de borrar.
-- ============================================================

drop policy if exists li_upd_duenos on public.lista_inscritos;
create policy li_upd_duenos on public.lista_inscritos
  for update
  using (
    exists (select 1 from public.clientes c where c.id = auth.uid() and c.rol = 'admin')
    or exists (
      select 1 from public.listas l
      join public.clientes c on c.id = auth.uid()
      where l.id = lista_inscritos.lista_id
        and c.rol in ('rrpp','admin')
        and ( l.duenio_id = auth.uid() or auth.uid() = any(coalesce(l.co_duenios, '{}'::uuid[])) )
    )
  )
  with check (
    exists (select 1 from public.clientes c where c.id = auth.uid() and c.rol = 'admin')
    or exists (
      select 1 from public.listas l
      join public.clientes c on c.id = auth.uid()
      where l.id = lista_inscritos.lista_id
        and c.rol in ('rrpp','admin')
        and ( l.duenio_id = auth.uid() or auth.uid() = any(coalesce(l.co_duenios, '{}'::uuid[])) )
    )
  );
