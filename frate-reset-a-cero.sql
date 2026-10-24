-- ============================================================
-- FRATE — RESET A CERO (dejar la web lista para producción)
-- Corre en el proyecto WEB: ydwlpraoaaijlfssevoh
-- SQL Editor: https://supabase.com/dashboard/project/ydwlpraoaaijlfssevoh/sql/new
--
-- ⚠️  IRREVERSIBLE. ANTES de correr:
--     Admin → Usuarios → "Exportar CSV" (para guardar los contactos).
--
-- CONSERVA:  el evento "PREUBA COMPRA" (id 5) + su ticket, el
--            catálogo de tipos de ticket, los textos, la config del
--            sitio, y el admin pablohidalgochile@gmail.com.
-- BORRA:     órdenes, reservas, usuarios, ranking, movimientos,
--            QR usados, códigos, premios, membresías, carta,
--            tiendita, ambientes, galería de videos, grupos, y el
--            evento de ejemplo (SÁBADO PREMIUM).
-- ============================================================

-- 1) Transaccional: órdenes, reservas, ranking, ledger, puerta, grupos
delete from items_pedido;
delete from pedidos;
delete from reservas;
delete from votos;
delete from canciones;
delete from movimientos;
delete from qr_usados;
delete from grupo_miembros;
delete from grupos;

-- 2) Usuarios: borra TODOS menos el admin (y sus cuentas de acceso)
--    (se hace aquí, después de vaciar lo que los referencia)
delete from clientes  where email <> 'pablohidalgochile@gmail.com';
delete from auth.users where email <> 'pablohidalgochile@gmail.com';

-- 3) Resetea el admin (crédito/puntos/membresía de las pruebas)
update clientes
   set credito = 0, puntos = 0, membresia_id = null, membresia_hasta = null
 where email = 'pablohidalgochile@gmail.com';

-- 4) Contenido de ejemplo
delete from membresias;
delete from codigos;
delete from premios;
delete from carta;
delete from tiendita;
delete from ambientes;
delete from webeum;

-- 5) Eventos de ejemplo — conserva SOLO "PREUBA COMPRA" (id 5)
delete from tipos_ticket where evento_id <> 5;
delete from eventos       where id        <> 5;

-- 6) Verificación (deben quedar casi todos en 0)
select 'pedidos'   as tabla, count(*) from pedidos
union all select 'reservas',    count(*) from reservas
union all select 'clientes',    count(*) from clientes      -- debe ser 1 (el admin)
union all select 'eventos',     count(*) from eventos       -- debe ser 1 (PREUBA COMPRA)
union all select 'tipos_ticket',count(*) from tipos_ticket  -- debe ser 1 (el de PREUBA)
union all select 'canciones',   count(*) from canciones
union all select 'codigos',     count(*) from codigos
union all select 'membresias',  count(*) from membresias;

-- ============================================================
-- LISTO. Si algún DELETE se queja de "foreign key" / "still
-- referenced by table X", mándame el nombre de la tabla X y lo
-- agrego arriba en el orden correcto.
-- ============================================================
