-- ============================================================
-- FRATE — Formularios configurables (cumple / reserva / frecuente / nuevos)
-- Habilita el "🧩 Constructor de formularios" del admin: los campos de
-- form.html dejan de estar hardcodeados y se editan desde la app.
-- Corre una vez en el Supabase de la WEB (ydwlpra…). Aditivo e idempotente.
-- form.html usa esta tabla si existe; si no, cae a su definición interna.
-- ============================================================

create table if not exists public.form_defs (
  slug        text primary key,                 -- 'cumple' | 'reserva' | 'frecuente' | nuevos
  titulo      text,                              -- nombre visible en el admin
  config      jsonb not null default '{}'::jsonb,-- { fields:[ {k,l,t,req,up,words2,half,ph,hint,o,showIf} ] }
  activo      boolean not null default true,
  updated_at  timestamptz not null default now()
);

alter table public.form_defs enable row level security;

-- Lectura pública (el formulario en frate.cl lo lee sin sesión).
drop policy if exists form_defs_public_read on public.form_defs;
create policy form_defs_public_read on public.form_defs for select using (true);

-- Escritura solo admin.
drop policy if exists form_defs_admin_write on public.form_defs;
create policy form_defs_admin_write on public.form_defs for all
  using      (exists (select 1 from public.clientes where id = auth.uid() and rol = 'admin'))
  with check (exists (select 1 from public.clientes where id = auth.uid() and rol = 'admin'));

-- ── Semilla: los 3 formularios actuales (con gestor+IG y nombre+apellido). ──
-- Solo inserta si el slug no existe (no pisa lo que edites después).
insert into public.form_defs (slug, titulo, config) values
('cumple', 'Cumpleaños', '{"fields":[
  {"k":"email","l":"Correo oficial (para enviarte la info)","t":"email","req":1,"ph":"tu@correo.cl"},
  {"k":"nombre","l":"Nombre completo del/la cumpleañer@","t":"text","up":1,"req":1,"words2":1,"ph":"Nombre y apellido"},
  {"k":"instagram","l":"Instagram del/la cumpleañer@","t":"ig","req":1,"ph":"usuario"},
  {"k":"fecha_nac","l":"Fecha de nacimiento del/la cumpleañer@","t":"date","req":1,"half":1,"minAge":18},
  {"k":"fecha_celebrar","l":"Fecha que desea celebrar","t":"date","req":1,"half":1,"hint":"Un día de evento de tu semana."},
  {"k":"quien_agenda","l":"¿Quién hace la gestión?","t":"select","o":["Selecciona…","El/la cumpleañer@","Otra persona"],"req":1},
  {"k":"gestor","l":"Nombre completo de quien hace la gestión","t":"text","up":1,"req":1,"words2":1,"ph":"Nombre y apellido","showIf":{"k":"quien_agenda","eq":"Otra persona"}},
  {"k":"gestor_instagram","l":"Instagram de quien hace la gestión","t":"ig","req":1,"ph":"usuario","showIf":{"k":"quien_agenda","eq":"Otra persona"}},
  {"k":"gestor_whatsapp","l":"WhatsApp de quien hace la gestión","t":"tel","req":1,"ph":"+56 9 ...","showIf":{"k":"quien_agenda","eq":"Otra persona"}},
  {"k":"whatsapp","l":"WhatsApp de contacto","t":"tel","req":1,"half":1,"ph":"+56 9 ..."},
  {"k":"invitados","l":"N° de invitad@s","t":"number","half":1,"ph":"aprox."},
  {"k":"educacion_superior","l":"¿El/la cumpleañer@ estudia educación superior?","t":"select","o":["Selecciona…","Sí","No"],"req":1},
  {"k":"institucion","l":"¿En qué institución?","t":"inst","req":1,"showIf":{"k":"educacion_superior","eq":"Sí"}},
  {"k":"mensaje","l":"Información adicional","t":"textarea","req":1,"ph":"Ej: somos 20, llegamos 00:30, queremos torta y decoración 🎂"}
]}'::jsonb),
('reserva', 'Reserva', '{"fields":[
  {"k":"nombre","l":"Nombre completo de quien reserva","t":"text","up":1,"req":1,"words2":1,"ph":"Nombre y apellido"},
  {"k":"email","l":"Correo","t":"email","req":1,"half":1,"ph":"tu@correo.cl"},
  {"k":"whatsapp","l":"WhatsApp de contacto","t":"tel","req":1,"half":1,"ph":"+56 9 ..."},
  {"k":"instagram","l":"Instagram de quien reserva","t":"ig","ph":"usuario"},
  {"k":"quien_agenda","l":"¿Quién hace la gestión?","t":"select","o":["Selecciona…","Quien reserva","Otra persona"],"req":1},
  {"k":"gestor","l":"Nombre completo de quien hace la gestión","t":"text","up":1,"req":1,"words2":1,"ph":"Nombre y apellido","showIf":{"k":"quien_agenda","eq":"Otra persona"}},
  {"k":"gestor_instagram","l":"Instagram de quien hace la gestión","t":"ig","req":1,"ph":"usuario","showIf":{"k":"quien_agenda","eq":"Otra persona"}},
  {"k":"gestor_whatsapp","l":"WhatsApp de quien hace la gestión","t":"tel","req":1,"ph":"+56 9 ...","showIf":{"k":"quien_agenda","eq":"Otra persona"}},
  {"k":"fecha_evento","l":"Fecha del evento","t":"date","req":1,"half":1},
  {"k":"personas","l":"N° de personas","t":"number","req":1,"half":1,"ph":"ej. 8"},
  {"k":"sector","l":"Sector","t":"select","o":["Selecciona…","General","VIP","Terraza","Que me recomienden"],"req":1},
  {"k":"ocasion","l":"Ocasión","t":"select","o":["Selecciona…","Salida","Cumpleaños","Despedida de solter@","Empresa / curso","Otra"]},
  {"k":"botellas","l":"Botellas de interés","t":"text","ph":"Escríbelas o pide el menú"},
  {"k":"mensaje","l":"Cuéntanos qué necesitas","t":"textarea","req":1,"ph":"Ej: sector, horario de llegada, presupuesto por persona…"}
]}'::jsonb),
('frecuente', 'Cliente frecuente', '{"fields":[
  {"k":"nombre","l":"Nombre completo","t":"text","up":1,"req":1,"words2":1,"ph":"Nombre y apellido"},
  {"k":"extranjero","l":"Soy extranjer@ (no tengo RUT chileno)","t":"check"},
  {"k":"rut","l":"RUT","t":"rut","req":1,"half":1,"ph":"12.345.678-9"},
  {"k":"fecha_nac","l":"Fecha de nacimiento","t":"date","req":1,"half":1,"hint":"Para tu beneficio de cumple."},
  {"k":"email","l":"Correo","t":"email","req":1,"half":1,"ph":"tu@correo.cl"},
  {"k":"whatsapp","l":"WhatsApp","t":"tel","req":1,"half":1,"ph":"+56 9 ..."},
  {"k":"instagram","l":"Instagram","t":"ig","ph":"usuario"},
  {"k":"quien_agenda","l":"¿Te registras tú o te inscribe alguien?","t":"select","o":["Selecciona…","Yo mismo/a","Otra persona (RRPP/amig@)"],"req":1},
  {"k":"gestor","l":"Nombre completo de quien te inscribe","t":"text","up":1,"req":1,"words2":1,"ph":"Nombre y apellido","showIf":{"k":"quien_agenda","eq":"Otra persona (RRPP/amig@)"}},
  {"k":"gestor_instagram","l":"Instagram de quien te inscribe","t":"ig","req":1,"ph":"usuario","showIf":{"k":"quien_agenda","eq":"Otra persona (RRPP/amig@)"}},
  {"k":"gestor_whatsapp","l":"WhatsApp de quien te inscribe","t":"tel","req":1,"ph":"+56 9 ...","showIf":{"k":"quien_agenda","eq":"Otra persona (RRPP/amig@)"}},
  {"k":"estudia_trabaja","l":"Universidad o centro de estudios","t":"inst","half":1},
  {"k":"como_conocio","l":"¿Cómo nos conociste?","t":"select","o":["Selecciona…","Amig@s","Instagram","RRPP","En un evento","Otro"],"half":1},
  {"k":"novedades","l":"Quiero recibir beneficios y novedades por correo/WhatsApp.","t":"check"},
  {"k":"terminos","l":"Acepto los términos y el uso de mis datos.","t":"check","req":1}
]}'::jsonb)
on conflict (slug) do nothing;

-- Verificar:
select 'form_defs' as check,
       case when exists(select 1 from information_schema.tables where table_name='form_defs') then 'OK tabla' else 'FALTA' end as tabla,
       (select count(*) from public.form_defs) as formularios;
