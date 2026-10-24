-- ═══════════════════════════════════════════════════════════════════════════
-- SQL FASE 32 COMBINADO — Módulo INVITADOS / ENTRADAS
-- ═══════════════════════════════════════════════════════════════════════════
-- Incluye:
--   · Schema + tablas + índices + vistas originales (frate_supabase_ready_v2)
--   · Adiciones FASE 32: columnas ticket sales, RLS abierta, permisos, vistas
--
-- Pasos:
--   1. Pegar TODO esto en Supabase SQL Editor → Run
--   2. Exponer schema 'frate' en Settings → API → Exposed schemas
--   3. Correr el script de importación: node scripts/import_invitados.js
--
-- Idempotente: puedes correrlo varias veces sin romper nada.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Extensiones + schema ───────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE SCHEMA IF NOT EXISTS frate;

-- ─── Tablas base ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS frate.fuentes (
  fuente_id uuid PRIMARY KEY,
  tipo_fuente text NOT NULL,
  archivo text,
  procesado text,
  observacion text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS frate.eventos (
  evento_id uuid PRIMARY KEY,
  fecha_evento date,
  nombre_evento text NOT NULL,
  dia_semana text,
  tipo_evento text,
  estado_evento text DEFAULT 'historico_importado',
  observaciones text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS frate.categorias_acceso (
  categoria_id uuid PRIMARY KEY,
  codigo text UNIQUE NOT NULL,
  nombre text NOT NULL,
  orden integer,
  descripcion text
);

CREATE TABLE IF NOT EXISTS frate.personas (
  persona_id uuid PRIMARY KEY,
  nombre_mostrar text NOT NULL,
  nombre_normalizado text,
  nombre_legal_estimado text,
  nickname_principal text,
  otros_alias text,
  rut_principal text,
  rut_estado text CHECK (rut_estado IN ('VALIDO','DUDOSO','SIN_RUT') OR rut_estado IS NULL),
  ruts_detectados text,
  email_principal citext,
  emails_detectados text,
  categoria_frecuente text,
  categorias_detectadas text,
  veces_invitado integer DEFAULT 0,
  primer_evento date,
  ultimo_evento date,
  ultimo_remitente text,
  fuentes text,
  nivel_confianza_identidad text CHECK (nivel_confianza_identidad IN ('ALTA','MEDIA','BAJA') OR nivel_confianza_identidad IS NULL),
  score_fraternidad numeric,
  clasificacion_contacto text,
  estado_app text DEFAULT 'activo',
  motivo_revision text,
  observaciones text,
  created_from_import boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS frate.alias_nicknames (
  alias_id uuid PRIMARY KEY,
  persona_id uuid REFERENCES frate.personas(persona_id) ON DELETE CASCADE,
  alias text NOT NULL,
  alias_normalizado text,
  tipo_alias text,
  confianza text,
  fuente_principal text,
  observacion text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS frate.contactos (
  contacto_id uuid PRIMARY KEY,
  persona_id uuid REFERENCES frate.personas(persona_id) ON DELETE CASCADE,
  tipo_contacto text NOT NULL CHECK (tipo_contacto IN ('email','telefono','instagram','otro')),
  valor text NOT NULL,
  es_principal boolean DEFAULT false,
  confianza text,
  observacion text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS frate.raw_messages (
  raw_message_id uuid PRIMARY KEY,
  fuente_id uuid REFERENCES frate.fuentes(fuente_id),
  source_type text,
  source_file text,
  orden integer,
  fecha_mensaje date,
  hora_mensaje text,
  remitente text,
  texto_original text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS frate.invitaciones (
  invitacion_id uuid PRIMARY KEY,
  persona_id uuid REFERENCES frate.personas(persona_id) ON DELETE SET NULL,
  evento_id uuid REFERENCES frate.eventos(evento_id) ON DELETE SET NULL,
  fuente_id uuid REFERENCES frate.fuentes(fuente_id) ON DELETE SET NULL,
  raw_message_id uuid REFERENCES frate.raw_messages(raw_message_id) ON DELETE SET NULL,
  fecha_mensaje date,
  hora_mensaje text,
  fecha_evento_estimada date,
  remitente text,
  tipo_acceso text,
  grupo_origen text,
  nombre_en_lista text,
  rut_en_lista text,
  email_en_lista citext,
  email_contexto citext,
  nickname_en_lista text,
  acompanantes_declarados integer,
  estado_ingreso text DEFAULT 'pendiente_importado',
  confianza_extraccion text,
  requiere_revision text,
  observaciones text,
  linea_original text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS frate.revision_identidad (
  revision_id uuid PRIMARY KEY,
  persona_id uuid REFERENCES frate.personas(persona_id) ON DELETE CASCADE,
  registro_id uuid,
  tipo_revision text,
  problema_detectado text,
  dato_conflictivo text,
  prioridad text DEFAULT 'MEDIA',
  estado_revision text DEFAULT 'pendiente',
  sugerencia text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS frate.duplicados_sugeridos (
  duplicado_id uuid PRIMARY KEY,
  tipo_alerta text,
  clave text,
  personas_relacionadas text,
  nombres_detectados text,
  cantidad_registros integer,
  detalle text,
  prioridad text DEFAULT 'MEDIA',
  estado_revision text DEFAULT 'pendiente',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS frate.ocr_textos_imagenes (
  ocr_id uuid PRIMARY KEY,
  fuente_id uuid REFERENCES frate.fuentes(fuente_id) ON DELETE CASCADE,
  archivo text,
  texto_ocr text,
  confianza_general text DEFAULT 'BAJA',
  observacion text,
  created_at timestamptz DEFAULT now()
);

-- ─── ADICIONES FASE 32: columnas para venta de entradas + integración ERP ──
ALTER TABLE frate.invitaciones
  ADD COLUMN IF NOT EXISTS canal_venta text DEFAULT 'manual'
    CHECK (canal_venta IN ('manual','whatsapp','excel','web','puerta','admin','api')),
  ADD COLUMN IF NOT EXISTS es_pagada boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS precio_pagado integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS moneda text DEFAULT 'CLP',
  ADD COLUMN IF NOT EXISTS transaccion_id text,
  ADD COLUMN IF NOT EXISTS codigo_qr text,
  ADD COLUMN IF NOT EXISTS email_confirmacion_enviado_at timestamptz,
  ADD COLUMN IF NOT EXISTS ingreso_at timestamptz,
  ADD COLUMN IF NOT EXISTS pulsera_codigo text,
  ADD COLUMN IF NOT EXISTS evento_operativo_id uuid;

ALTER TABLE frate.eventos
  ADD COLUMN IF NOT EXISTS evento_operativo_id uuid;

-- ─── Índices ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_personas_nombre_trgm        ON frate.personas USING gin (nombre_mostrar gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_personas_nombre_norm_trgm   ON frate.personas USING gin (nombre_normalizado gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_personas_rut                ON frate.personas (rut_principal);
CREATE INDEX IF NOT EXISTS idx_personas_email              ON frate.personas (email_principal);
CREATE INDEX IF NOT EXISTS idx_personas_score              ON frate.personas (score_fraternidad DESC);
CREATE INDEX IF NOT EXISTS idx_alias_alias_trgm            ON frate.alias_nicknames USING gin (alias gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_invitaciones_evento         ON frate.invitaciones (evento_id);
CREATE INDEX IF NOT EXISTS idx_invitaciones_persona        ON frate.invitaciones (persona_id);
CREATE INDEX IF NOT EXISTS idx_invitaciones_fecha          ON frate.invitaciones (fecha_evento_estimada);
CREATE INDEX IF NOT EXISTS idx_invitaciones_tipo           ON frate.invitaciones (tipo_acceso);
CREATE INDEX IF NOT EXISTS idx_invitaciones_qr             ON frate.invitaciones (codigo_qr);
CREATE INDEX IF NOT EXISTS idx_invitaciones_evento_op      ON frate.invitaciones (evento_operativo_id);
CREATE INDEX IF NOT EXISTS idx_invitaciones_estado         ON frate.invitaciones (estado_ingreso);
CREATE INDEX IF NOT EXISTS idx_eventos_op_link             ON frate.eventos (evento_operativo_id);

-- ─── RLS abierta (todos pueden leer/escribir — afinaremos por rol después) ─
ALTER TABLE frate.fuentes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE frate.eventos              ENABLE ROW LEVEL SECURITY;
ALTER TABLE frate.categorias_acceso    ENABLE ROW LEVEL SECURITY;
ALTER TABLE frate.personas             ENABLE ROW LEVEL SECURITY;
ALTER TABLE frate.alias_nicknames      ENABLE ROW LEVEL SECURITY;
ALTER TABLE frate.contactos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE frate.raw_messages         ENABLE ROW LEVEL SECURITY;
ALTER TABLE frate.invitaciones         ENABLE ROW LEVEL SECURITY;
ALTER TABLE frate.revision_identidad   ENABLE ROW LEVEL SECURITY;
ALTER TABLE frate.duplicados_sugeridos ENABLE ROW LEVEL SECURITY;
ALTER TABLE frate.ocr_textos_imagenes  ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'fuentes','eventos','categorias_acceso','personas','alias_nicknames',
      'contactos','raw_messages','invitaciones','revision_identidad',
      'duplicados_sugeridos','ocr_textos_imagenes'
    ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s_all" ON frate.%s', t, t);
    EXECUTE format('CREATE POLICY "%s_all" ON frate.%s FOR ALL USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;

-- ─── Permisos sobre el schema (REST API) ───────────────────────────────────
GRANT USAGE ON SCHEMA frate TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA frate TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA frate TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA frate GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA frate GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

-- ─── Vistas ─────────────────────────────────────────────────────────────────

-- Búsqueda global
CREATE OR REPLACE VIEW frate.v_personas_busqueda AS
SELECT
  p.persona_id,
  p.nombre_mostrar,
  p.nickname_principal,
  p.rut_principal,
  p.email_principal,
  p.categoria_frecuente,
  p.veces_invitado,
  p.ultimo_evento,
  p.score_fraternidad,
  p.estado_app,
  concat_ws(' ', p.nombre_mostrar, p.nombre_normalizado, p.nickname_principal, p.otros_alias, p.rut_principal, p.email_principal) AS search_text
FROM frate.personas p;

-- Invitados por evento (vista original)
CREATE OR REPLACE VIEW frate.v_evento_invitados AS
SELECT
  e.fecha_evento,
  e.nombre_evento,
  i.invitacion_id,
  i.tipo_acceso,
  i.estado_ingreso,
  i.nombre_en_lista,
  p.nombre_mostrar,
  p.nickname_principal,
  p.rut_principal,
  p.email_principal,
  i.acompanantes_declarados,
  i.grupo_origen,
  i.remitente,
  i.requiere_revision,
  i.observaciones
FROM frate.invitaciones i
LEFT JOIN frate.personas p ON p.persona_id = i.persona_id
LEFT JOIN frate.eventos e  ON e.evento_id = i.evento_id;

-- CRM top
CREATE OR REPLACE VIEW frate.v_crm_personas_top AS
SELECT
  persona_id, nombre_mostrar, nickname_principal, categoria_frecuente,
  veces_invitado, primer_evento, ultimo_evento, score_fraternidad,
  clasificacion_contacto, estado_app, motivo_revision
FROM frate.personas
ORDER BY score_fraternidad DESC NULLS LAST, veces_invitado DESC;

-- CRM enriquecido (la usa la app)
CREATE OR REPLACE VIEW frate.v_personas_crm AS
SELECT
  p.persona_id,
  p.nombre_mostrar,
  p.nickname_principal,
  p.rut_principal,
  p.rut_estado,
  p.email_principal,
  p.categoria_frecuente,
  p.veces_invitado,
  p.primer_evento,
  p.ultimo_evento,
  p.score_fraternidad,
  p.nivel_confianza_identidad,
  p.estado_app,
  p.motivo_revision,
  (SELECT COUNT(*) FROM frate.invitaciones i WHERE i.persona_id = p.persona_id AND i.estado_ingreso = 'ingresó')  AS veces_ingresadas,
  (SELECT COUNT(*) FROM frate.invitaciones i WHERE i.persona_id = p.persona_id AND i.estado_ingreso = 'no llegó') AS veces_no_llegó,
  (SELECT SUM(i.precio_pagado) FROM frate.invitaciones i WHERE i.persona_id = p.persona_id AND i.es_pagada)       AS total_gastado
FROM frate.personas p
WHERE p.estado_app != 'eliminado' OR p.estado_app IS NULL;

-- Vista por evento operativo (la usa la app + puerta)
CREATE OR REPLACE VIEW frate.v_invitados_por_evento_op AS
SELECT
  i.invitacion_id,
  i.evento_operativo_id,
  i.tipo_acceso,
  i.estado_ingreso,
  i.es_pagada,
  i.precio_pagado,
  i.codigo_qr,
  i.canal_venta,
  i.ingreso_at,
  i.pulsera_codigo,
  i.nombre_en_lista,
  i.rut_en_lista,
  i.acompanantes_declarados,
  i.grupo_origen,
  p.persona_id,
  p.nombre_mostrar,
  p.nickname_principal,
  p.rut_principal,
  p.email_principal,
  p.score_fraternidad
FROM frate.invitaciones i
LEFT JOIN frate.personas p ON p.persona_id = i.persona_id
WHERE i.evento_operativo_id IS NOT NULL;

-- Inbox de revisión
CREATE OR REPLACE VIEW frate.v_revision_inbox AS
SELECT
  r.revision_id, r.persona_id, r.tipo_revision, r.problema_detectado,
  r.dato_conflictivo, r.prioridad, r.estado_revision, r.sugerencia, r.created_at,
  p.nombre_mostrar, p.rut_principal, p.email_principal, p.veces_invitado
FROM frate.revision_identidad r
LEFT JOIN frate.personas p ON p.persona_id = r.persona_id
WHERE r.estado_revision = 'pendiente'
ORDER BY
  CASE r.prioridad WHEN 'ALTA' THEN 1 WHEN 'MEDIA' THEN 2 ELSE 3 END,
  p.score_fraternidad DESC NULLS LAST;

-- ═══════════════════════════════════════════════════════════════════════════
-- LISTO.
-- Próximo paso: exponer 'frate' en Settings → API → Exposed schemas
-- Y luego correr el import: node scripts/import_invitados.js
-- ═══════════════════════════════════════════════════════════════════════════
