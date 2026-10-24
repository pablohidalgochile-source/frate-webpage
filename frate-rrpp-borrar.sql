-- ============================================================
-- FRATE · Permitir que un RRPP borre inscritos de SUS listas
-- Proyecto WEB · SQL Editor. Aditivo (solo agrega una policy de
-- DELETE; no toca las que ya existen ni el estado de RLS).
--
-- Regla: se puede borrar un inscrito si el que lo pide es admin,
-- O es RRPP y es dueño (o co-dueño) de esa lista.
-- ============================================================

drop policy if exists li_del_duenos on public.lista_inscritos;
create policy li_del_duenos on public.lista_inscritos
  for delete
  using (
    exists (select 1 from public.clientes c where c.id = auth.uid() and c.rol = 'admin')
    or exists (
      select 1
      from public.listas l
      join public.clientes c on c.id = auth.uid()
      where l.id = lista_inscritos.lista_id
        and c.rol in ('rrpp','admin')
        and ( l.duenio_id = auth.uid()
              or auth.uid() = any(coalesce(l.co_duenios, '{}'::uuid[])) )
    )
  );
