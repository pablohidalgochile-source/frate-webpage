-- ============================================================
-- FRATE — Devolver rol ADMIN a la cuenta dueña (@nanook)
-- La cuenta quedó como 'portero' (por eso /admin abría solo el
-- validador). Esto la vuelve 'admin' → ve TODO el panel.
-- Correr en el Supabase de la WEB (ydwlpraoaaijlfssevoh) → SQL Editor.
-- ============================================================

update public.clientes set rol = 'admin' where username = 'nanook';

-- Verifica que quedó en admin:
select username, email, rol from public.clientes where username = 'nanook';
