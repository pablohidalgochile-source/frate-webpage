-- 🧭 REVISIÓN COMPLETA · ¿qué SQL falta correr?
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · ⚠️ NO CAMBIA NADA · UNA consulta
--
-- Generada leyendo los 226 archivos .sql de la carpeta, no de memoria.
--   · 125 crean algo que SOLO ellos crean → verificables, son estos.
--   ·  30 ambiguos (varias versiones del mismo objeto) → frate-QUE-FALTA-2.sql
--   ·  82 sin DDL (solo datos o consultas) → no aplica.
--
-- Muestra SOLO lo que falta. Si sale vacío, está todo corrido.

select archivo, crea, estado from (
  select c.archivo,
         c.tipo || ' ' || c.obj || case when c.det <> '' then '.' || c.det else '' end as crea,
    case when case c.tipo
      when 'función' then exists (select 1 from pg_proc p
                                   join pg_namespace n on n.oid = p.pronamespace
                                  where n.nspname='public' and p.proname = c.obj)
      when 'tabla'   then to_regclass('public.' || c.obj) is not null
      when 'columna' then exists (select 1 from information_schema.columns i
                                  where i.table_schema='public'
                                    and i.table_name = c.obj and i.column_name = c.det)
    end then '✅ corrido' else '❌ FALTA' end as estado
  from (values
    ('frate-PENDIENTES-consolidado.sql','columna','eventos','aforo'),('frate-SEGURIDAD-admins.sql','tabla','admins_autorizados',''),
    ('frate-SEGURIDAD-rut.sql','función','tg_validar_rut_cliente',''),('frate-SETUP-pendiente.sql','columna','pedidos','codigo_id'),
    ('frate-activar-socio-1.sql','columna','clientes','socio_activado_at'),('frate-activar-socio.sql','columna','clientes','socio_activado_at'),
    ('frate-addons.sql','tabla','addons',''),('frate-anfitrion-chat.sql','tabla','conversaciones',''),
    ('frate-aprobacion-y-rut-unico.sql','función','lista_repetidos',''),('frate-baneados.sql','tabla','baneados',''),
    ('frate-biblioteca-ticket.sql','columna','catalogo_tickets','hora_max_ingreso'),('frate-bitacora-admin.sql','tabla','bitacora_admin',''),
    ('frate-bot-friend-estudio.sql','tabla','bot_ejemplos',''),('frate-bot-intents.sql','columna','respuestas','bot_auto'),
    ('frate-brief.sql','columna','eventos','brief'),('frate-buscar-ordenes.sql','función','buscar_ordenes_ids',''),
    ('frate-carga-historica-1.sql','columna','listas','hist_at'),('frate-carga-historica.sql','columna','listas','hist_at'),
    ('frate-catalogo-cierre.sql','columna','catalogo_tickets','cierre_venta'),('frate-catalogo-eventos.sql','tabla','catalogo_tickets',''),
    ('frate-catalogo-menu.sql','tabla','catalogo_items',''),('frate-catalogo-seed.sql','columna','paquetes','condiciones'),
    ('frate-cerrar-eventos-auto-1.sql','función','eventos_cerrar_vencidos',''),('frate-chat-grupos-def.sql','tabla','chat_grupos',''),
    ('frate-chats-fix.sql','columna','conversaciones','grupo'),('frate-chats-grupos.sql','columna','conversaciones','grupo'),
    ('frate-checkins-origen.sql','función','evento_checkins_por_origen',''),('frate-clase-ticket-1.sql','columna','catalogo_tickets','clase'),
    ('frate-clase-ticket.sql','columna','catalogo_tickets','clase'),('frate-codigos.sql','columna','pedidos','codigo_id'),
    ('frate-coduenios.sql','columna','listas','co_duenios'),('frate-comisiones-mp.sql','tabla','comisiones_mp',''),
    ('frate-compartir-nombre.sql','función','pedido_para_compartir',''),('frate-config-secciones.sql','tabla','config_sitio',''),
    ('frate-connect.sql','función','cx_estado',''),('frate-cortesia-masiva.sql','columna','items_pedido','condiciones'),
    ('frate-crecimiento.sql','tabla','visitas',''),('frate-crm-pagos.sql','tabla','crm_pagos',''),('frate-crm-personas.sql','tabla','personas',''),
    ('frate-crm.sql','tabla','crm_webhooks_pendientes',''),('frate-cuenta-cancelar.sql','función','cancelar_pedido_pendiente',''),
    ('frate-cumple-gestion.sql','columna','formularios','gestion'),('frate-cumpleanos-memoria.sql','tabla','cumpleanos',''),
    ('frate-desglose-noche.sql','función','evento_desglose_listas',''),('frate-devolucion-pin.sql','tabla','devolucion_excepciones',''),
    ('frate-devoluciones-solicitud.sql','tabla','solicitudes_devolucion',''),('frate-diferencia-1.sql','tabla','tickets_diferencia',''),
    ('frate-diferencia-2.sql','función','diferencia_emitir',''),('frate-diferencia-3.sql','función','diferencia_pagar',''),
    ('frate-erp-inbox.sql','columna','conversaciones','external_id'),('frate-erp-puerta.sql','columna','qr_usados','gate_id'),
    ('frate-estados-listas.sql','función','lista_papelera',''),('frate-evento-oculto.sql','columna','eventos','oculto_publico'),
    ('frate-evento-slug.sql','columna','eventos','slug'),('frate-evento-vivo.sql','columna','eventos','aforo'),
    ('frate-eventos-media-api.sql','columna','eventos','external_id'),('frate-eventos-v2.sql','tabla','giros',''),
    ('frate-fase0-puntos.sql','tabla','config_valores',''),('frate-fase1-2.sql','tabla','email_rebotes',''),
    ('frate-fase2.sql','función','contar_referidos',''),('frate-fase3.sql','columna','conversaciones','notas'),
    ('frate-form-dedup.sql','columna','formularios','dk_email'),('frate-form-defs.sql','tabla','form_defs',''),
    ('frate-formularios.sql','tabla','formularios',''),('frate-grupos.sql','tabla','grupo_miembros',''),
    ('frate-import-crm-plus.sql','columna','lista_inscritos','datos_extra'),('frate-inbox-unificado.sql','columna','wsp_conversaciones','origen'),
    ('frate-incentivos.sql','tabla','incentivos',''),('frate-juegos.sql','tabla','trivia_preguntas',''),
    ('frate-limpiar-nombres-ordenes.sql','columna','pedidos','vino_por'),('frate-link.sql','tabla','birthday_requests',''),
    ('frate-links-deco.sql','columna','link_items','color'),('frate-links-portada.sql','columna','link_items','cover'),
    ('frate-lista-panel.sql','columna','listas','cierre_auto'),('frate-lista-paquetes.sql','tabla','lista_paquetes',''),
    ('frate-listas-clase.sql','columna','listas','clase'),('frate-listas-mixtas.sql','función','inscrito_mover_zona',''),
    ('frate-loyalty.sql','función','loyalty_de_rut',''),('frate-membresias.sql','tabla','membresias',''),
    ('frate-mi-entrada.sql','función','mis_entradas',''),('frate-notas-credito.sql','columna','pedidos','dev_comision_reint'),
    ('frate-paquetes-v2.sql','columna','paquetes','destacado'),('frate-paquetes.sql','tabla','crm_paquetes',''),
    ('frate-personas-unificar.sql','función','tg_persona_cumple',''),('frate-planos.sql','tabla','planos',''),
    ('frate-plantillas-plus.sql','columna','plantillas_comunidad','duenio'),
    ('frate-plantillas-unificar-1.sql','columna','catalogo_tickets','chequear_edad'),('frate-plantillas.sql','tabla','plantillas_comunidad',''),
    ('frate-pos-llaves.sql','tabla','pos_llaves',''),('frate-puerta-autorizaciones.sql','tabla','puerta_autorizaciones',''),
    ('frate-puerta-autorizar-ingreso.sql','tabla','puerta_solicitudes',''),('frate-puerta-captura.sql','tabla','ingresos_manuales',''),
    ('frate-puerta-deshacer.sql','tabla','puerta_rechazos',''),('frate-puerta-grupo.sql','función','puerta_grupo',''),
    ('frate-puerta-offline.sql','función','puerta_snapshot_qr',''),('frate-puerta-v2.sql','función','puerta_buscar_rut',''),
    ('frate-ranking-admin.sql','columna','canciones','activo'),('frate-ranking.sql','tabla','canciones',''),
    ('frate-reactivaciones.sql','función','editar_asistente',''),('frate-registro-puerta-1.sql','función','edad_de',''),
    ('frate-registro-puerta-2.sql','función','puerta_registrar_ingreso',''),('frate-reserva-cupo.sql','función','fn_descontar_stock',''),
    ('frate-reservas-gestion.sql','columna','reservas','historial'),('frate-reset-pruebas.sql','función','admin_borrar_evento',''),
    ('frate-respuestas.sql','tabla','respuestas',''),('frate-rrpp-mi-rendimiento.sql','función','rrpp_mi_rendimiento',''),
    ('frate-rrpp-portal.sql','función','rrpp_agregar_inscrito',''),('frate-rrpp-rendimiento.sql','tabla','rrpp_alias',''),
    ('frate-stock-tope.sql','función','stock_de_ticket',''),('frate-sync-erp-tiempo-real.sql','tabla','erp_sync_cfg',''),
    ('frate-sync-erp.sql','tabla','erp_sync_log',''),('frate-tareas-seguimiento.sql','tabla','tareas_seguimiento',''),
    ('frate-textos.sql','tabla','textos',''),('frate-ticket-instrucciones.sql','columna','ticket_plantillas','instrucciones'),
    ('frate-ticket-plantillas.sql','tabla','ticket_plantillas',''),('frate-ticket-rotulo.sql','columna','catalogo_tickets','color'),
    ('frate-ticket-uid.sql','columna','tipos_ticket','ticket_uid'),('frate-tickets-orden.sql','columna','tipos_ticket','orden'),
    ('frate-tickets-publico.sql','columna','catalogo_tickets','genero'),('frate-tope-cortesias.sql','función','cortesias_estado',''),
    ('frate-totales-servidor.sql','función','admin_kpi_ventas',''),('frate-validez-ticket.sql','columna','tipos_ticket','hora_max_ingreso'),
    ('frate-venta-vs-cortesia.sql','columna','pedidos','es_venta'),('frate-whatsapp.sql','tabla','wsp_conversaciones',''),
    ('frate-zonas.sql','tabla','zonas','')
  ) as c(archivo, tipo, obj, det)
) t
where estado = '❌ FALTA'
order by archivo;
