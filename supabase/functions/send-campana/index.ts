// ============================================================
// FRATE — Edge Function: send-campana (SOLO ADMIN)
// Correo masivo a miembros, por tandas y con registro:
//   guardar · obtener · preview · prueba (a tu propio correo) · resumen · tanda
// Cada correo se «reclama» en campana_envios (único por campaña+correo) ANTES
// de enviarlo: si se corta a la mitad o se aprieta dos veces, no se repite.
// Deploy: --no-verify-jwt (el candado de admin va adentro, permitirStaffOServicio).
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { permitirStaffOServicio, emailDelToken } from '../_shared/guard.ts';
import { tokenBaja, BAJA_FN, BAJA_PAGINA } from '../_shared/baja.ts';
import { tokenVaso } from '../_shared/vaso.ts';
import { htmlCampana, textoCampana, type CampanaCfg } from './plantilla.ts';

const RESEND_API = 'https://api.resend.com/emails';
// Mismo dominio y misma cuenta de Resend que los QR: una queja o rebote fuerte en la
// campaña también suprime a esa persona para los QR. Por eso: bajas, rebotes y ritmo lento.
const FROM = 'FRATE <hola@frate.cl>';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: cors });
const pausa = (ms: number) => new Promise(r => setTimeout(r, ms));

async function marca(sb: any) {
  try {
    const { data } = await sb.from('config_valores').select('clave,valor').in('clave', ['mail_logo_url', 'mail_color']);
    const m = new Map((data || []).map((x: any) => [x.clave, x.valor]));
    return { logo: String(m.get('mail_logo_url') || ''), color: String(m.get('mail_color') || '#E8363D') };
  } catch (_) { return { logo: '', color: '#E8363D' }; }
}

async function enviarUno(cfg: CampanaCfg, para: { email: string; nombre: string }, m: { logo: string; color: string }, campana: string, prueba = false) {
  const t = await tokenBaja(para.email);
  const q = `e=${encodeURIComponent(para.email)}&t=${t}`;
  // Token del enlace PERSONAL (distinto del de baja, a propósito: ver _shared/vaso.ts).
  // Solo se usa si la campaña escribió {vaso} en el botón.
  const tv = await tokenVaso(para.email);
  const bajaUrl = `${BAJA_PAGINA}?${q}`;
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) throw new Error('RESEND_API_KEY no configurada');
  const res = await fetch(RESEND_API, {
    signal: AbortSignal.timeout(15000),
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json',
               ...(prueba ? {} : { 'Idempotency-Key': `${campana}:${para.email}`.slice(0, 256) }) },
    body: JSON.stringify({
      from: FROM, to: [para.email], reply_to: 'hola@frate.cl',
      subject: (prueba ? '[PRUEBA] ' : '') + (cfg.asunto || 'FRATE'),
      html: htmlCampana(cfg, { nombre: para.nombre, bajaUrl, logo: m.logo, color: m.color, correo: para.email, vaso: tv }),
      text: textoCampana(cfg, { nombre: para.nombre, bajaUrl, correo: para.email, vaso: tv }),
      headers: { 'List-Unsubscribe': `<${BAJA_FN}?${q}>`,
                 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
      tags: [{ name: 'campana', value: campana.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 256) }],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 429) { const e: any = new Error('Resend pidió bajar el ritmo (429)'); e.frenar = Number(res.headers.get('retry-after')) || 5; throw e; }
  if (!res.ok) throw new Error((data && (data.message || data.name)) || `Resend ${res.status}`);
  return data.id as string;
}

const filtros = (cfg: CampanaCfg | null) => ({
  p_excluir_evento: cfg && cfg.excluir_evento != null && String(cfg.excluir_evento).trim() !== '' ? Number(cfg.excluir_evento) : null,
  p_excluir_x: !cfg || cfg.excluir_x !== false,
});

// Campos que definen QUÉ se envía y A QUIÉN. Si una campaña ya tiene envíos, cambiarlos
// hace que los que faltan reciban otra cosa: se bloquea salvo confirmación.
const CLAVES = ['asunto', 'preheader', 'logo_url', 'imagen_url', 'imagen_alt', 'antetitulo', 'titulo', 'texto', 'pasos',
                'boton_texto', 'boton_url', 'nota', 'excluir_evento', 'excluir_x', 'publico'];
const esSel = (c: any) => c?.publico === 'seleccion';          // público «solo la selección» (Usuarios/Personas elegidos)
const huella = (c: any) => JSON.stringify(CLAVES.map(k => k === 'excluir_x' ? (c?.excluir_x !== false)
  : k === 'publico' ? (esSel(c) ? 'seleccion' : 'miembros')
  : k === 'excluir_evento' ? (c?.excluir_evento == null || String(c.excluir_evento).trim() === '' ? '' : String(Number(c.excluir_evento)))
  : String(c?.[k] ?? '').trim()));
const normId = (x: unknown) => String(x || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 60);

function validar(cfg: CampanaCfg, paraEnviar: boolean) {
  const faltan: string[] = [];
  if (!cfg.asunto) faltan.push('asunto');
  if (!cfg.titulo) faltan.push('título');
  if (!cfg.boton_url || !/^https:\/\//.test(cfg.boton_url)) faltan.push('enlace del botón (https)');
  if (paraEnviar && !cfg.imagen_url) faltan.push('gráfica');
  if (cfg.logo_url && !/^https:\/\//.test(cfg.logo_url)) faltan.push('logo del encabezado (https)');
  return faltan;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const permiso = await permitirStaffOServicio(req, ['admin']);
  if (!permiso.ok) return json({ error: permiso.error }, permiso.status);
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  try {
    const b = await req.json() as { accion: string; campana?: string; config?: CampanaCfg; limite?: number; confirmar?: string; a?: string[];
      nombre?: string; nueva?: boolean; forzar?: string; nuevo?: string; archivar?: boolean; archivadas?: boolean | null;
      estado?: string; q?: string; pagina?: number; ids?: (number | string)[]; motivo?: string; origen?: string; emails?: string[]; todos?: boolean };
    const campana = normId(b.campana);
    const fila = async (id = campana) => {
      const { data, error } = await sb.from('campanas').select('id, config, nombre, archivada_at, tanda_hasta').eq('id', id).maybeSingle();
      if (error) throw error;
      return data as { id: string; config: CampanaCfg; nombre: string | null; archivada_at: string | null; tanda_hasta: string | null } | null;
    };
    const cargar = async () => ((await fila())?.config || null) as CampanaCfg | null;
    const registros = async (id = campana) => {
      const { count, error } = await sb.from('campana_envios').select('id', { count: 'exact', head: true }).eq('campana', id);
      if (error) throw error;
      return count || 0;
    };

    switch (b.accion) {
      case 'guardar': {
        if (!campana) return json({ error: 'Falta el identificador de la campaña.' }, 400);
        const actual = await fila();
        if (b.nueva && actual) return json({ error: `Ya existe una campaña «${campana}». Ábrela o usa otro identificador.`, code: 'YA_EXISTE' }, 409);
        // La pestaña cree que existe, pero ya no está (la borraron): no se recrea sin su registro de envíos.
        if (b.nueva === false && !actual) return json({ error: 'Esta campaña ya no existe (la borraron). Recarga y créala de nuevo si corresponde.', code: 'NO_EXISTE' }, 409);
        if (b.nueva && !actual) {        // restos de una campaña borrada con el mismo identificador: no se heredan
          const { error: eH } = await sb.from('campana_seleccion').delete().eq('campana', campana);
          if (eH) throw eH;
        }
        if (actual) {
          const n = await registros();
          if (n > 0 && huella(actual.config) !== huella(b.config || {}) && b.forzar !== 'CAMBIAR') {
            return json({ error: `Esta campaña ya tiene ${n} envíos registrados: si cambias el contenido o el público, los que faltan reciben otra versión. Confirma el cambio (duplicarla crea otra campaña que se envía a todos otra vez).`, code: 'BLOQUEADA', registros: n }, 409);
          }
        }
        const nombre = b.nombre != null ? String(b.nombre).trim().slice(0, 120) || null : (actual?.nombre ?? null);
        const { error } = await sb.from('campanas').upsert({ id: campana, config: b.config || {}, nombre, actualizada_at: new Date().toISOString(), actualizada_por: permiso.uid || null });
        if (error) throw error;
        return json({ ok: true, campana });
      }
      case 'obtener': {
        const f = await fila();
        return json({ ok: true, campana, config: f?.config || null, nombre: f?.nombre || null, archivada_at: f?.archivada_at || null,
                      registros: f ? await registros() : 0, tanda_en_curso: !!(f?.tanda_hasta && new Date(f.tanda_hasta) > new Date()) });
      }
      case 'listar': {
        const { data, error } = await sb.rpc('campana_listar', { p_archivadas: b.archivadas == null ? null : !!b.archivadas });
        if (error) throw error;
        return json({ ok: true, campanas: data || [] });
      }
      case 'duplicar': {
        const origen = await fila();
        if (!origen) return json({ error: 'No encontré la campaña de origen.' }, 404);
        const nuevo = normId(b.nuevo);
        if (!nuevo) return json({ error: 'Falta el identificador de la copia.' }, 400);
        if (await fila(nuevo)) return json({ error: `Ya existe una campaña «${nuevo}».`, code: 'YA_EXISTE' }, 409);
        const nombre = String(b.nombre || '').trim().slice(0, 120) || `${origen.nombre || origen.id} (copia)`;
        const { error } = await sb.from('campanas').insert({ id: nuevo, config: origen.config || {}, nombre, actualizada_por: permiso.uid || null });
        if (error) throw error;
        if (esSel(origen.config)) {      // la copia de una campaña de selección lleva la misma selección
          const { data: s0, error: eS0 } = await sb.from('campana_seleccion').select('email,nombre,rut,cliente_id,persona_id,origen').eq('campana', origen.id).limit(20000);
          if (eS0) throw eS0;
          for (let i = 0; i < (s0 || []).length; i += 500) {
            const { error: eC } = await sb.from('campana_seleccion').upsert((s0 || []).slice(i, i + 500).map((r: any) => ({ ...r, campana: nuevo, agregada_por: permiso.uid || null })), { onConflict: 'campana,email', ignoreDuplicates: true });
            if (eC) throw eC;
          }
        }
        return json({ ok: true, campana: nuevo });
      }
      case 'renombrar': {
        if (!(await fila())) return json({ error: 'No encontré la campaña.' }, 404);
        const { error } = await sb.from('campanas').update({ nombre: String(b.nombre || '').trim().slice(0, 120) || null, actualizada_at: new Date().toISOString() }).eq('id', campana);
        if (error) throw error;
        return json({ ok: true, campana });
      }
      case 'archivar': {
        const f = await fila();
        if (!f) return json({ error: 'No encontré la campaña.' }, 404);
        if (b.archivar !== false && f.tanda_hasta && new Date(f.tanda_hasta) > new Date()) return json({ error: 'Tiene una tanda enviándose ahora: detenla antes de archivar.' }, 409);
        const { error } = await sb.from('campanas').update({ archivada_at: b.archivar === false ? null : new Date().toISOString() }).eq('id', campana);
        if (error) throw error;
        return json({ ok: true, campana, archivada: b.archivar !== false });
      }
      case 'borrar': {
        // Pensado para pruebas. Borra la campaña y su registro de envíos (no toca las bajas).
        // Si tenía envíos y se vuelve a crear con el mismo identificador, les llegaría de nuevo.
        const f = await fila();
        if (!f) return json({ error: 'No encontré la campaña.' }, 404);
        if (b.confirmar !== 'BORRAR') return json({ error: 'Falta confirmar el borrado.' }, 400);
        const motivo = String(b.motivo || '').trim();
        if (motivo.length < 4) return json({ error: 'Explica por qué se borra (por ejemplo: «era una prueba»).' }, 400);
        // Candado atómico (el mismo de las tandas): si hay una tanda corriendo, no se borra.
        const { data: lk, error: eL } = await sb.from('campanas').update({ tanda_hasta: new Date(Date.now() + 600000).toISOString() })
          .eq('id', campana).or(`tanda_hasta.is.null,tanda_hasta.lt.${new Date().toISOString()}`).select('id');
        if (eL) throw eL;
        if (!lk || !lk.length) return json({ error: 'Tiene una tanda enviándose ahora: detenla antes de borrar.' }, 409);
        const n = await registros();
        console.warn('[send-campana] BORRADA', campana, '· por', permiso.uid, '· registros', n, '· motivo:', motivo.slice(0, 300));
        // Primero la campaña: cualquier tanda posterior cae en «Guarda la campaña antes de enviar».
        const { error: e2 } = await sb.from('campanas').delete().eq('id', campana);
        if (e2) throw e2;
        const { error: e1 } = await sb.from('campana_envios').delete().eq('campana', campana);
        if (e1) throw e1;
        const { error: e3 } = await sb.from('campana_seleccion').delete().eq('campana', campana);
        if (e3) throw e3;
        return json({ ok: true, borrada: campana, registros_borrados: n });
      }
      case 'seleccion_agregar': {
        // El navegador manda SOLO identificadores; los correos y nombres se leen acá desde la base.
        const f = await fila();
        if (!f) return json({ error: 'No encontré la campaña.' }, 404);
        if (f.archivada_at) return json({ error: 'La campaña está archivada.', code: 'ARCHIVADA' }, 409);
        const origen = b.origen === 'personas' ? 'personas' : 'usuarios';
        const ids = [...new Set((Array.isArray(b.ids) ? b.ids : []).map(x => String(x).trim()).filter(Boolean))].slice(0, 20000);
        if (!ids.length) return json({ error: 'No llegó ninguna persona seleccionada.' }, 400);
        const okMail = (e: string) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(e);
        const filas = new Map<string, any>(); let sinCorreo = 0, repetidos = 0;
        const pendCli: any[] = [];       // Personas sin correo válido pero con cuenta: se usa el correo de la cuenta
        const paso = origen === 'usuarios' ? 100 : 300;   // 100 uuid mantienen la URL corta
        for (let i = 0; i < ids.length; i += paso) {
          const trozo = ids.slice(i, i + paso);
          const r = origen === 'usuarios'
            ? await sb.from('clientes').select('id,email,nombres,apellidos,rut').in('id', trozo)
            : await sb.from('personas').select('id,email,nombre,rut,cliente_id').in('id', trozo.map(Number).filter(n => n > 0));
          if (r.error) throw r.error;
          for (const x of (r.data || []) as any[]) {
            const email = String(x.email || '').trim().toLowerCase();
            if (!okMail(email)) { if (origen === 'personas' && x.cliente_id) pendCli.push(x); else sinCorreo++; continue; }
            if (filas.has(email)) { repetidos++; continue; }
            filas.set(email, origen === 'usuarios'
              ? { campana, email, nombre: `${x.nombres || ''} ${x.apellidos || ''}`.trim() || null, rut: x.rut || null, cliente_id: x.id, persona_id: null, origen, agregada_por: permiso.uid || null }
              : { campana, email, nombre: x.nombre || null, rut: x.rut || null, cliente_id: x.cliente_id || null, persona_id: x.id, origen, agregada_por: permiso.uid || null });
          }
        }
        for (let i = 0; i < pendCli.length; i += 100) {
          const trozo = pendCli.slice(i, i + 100);
          const { data: cs, error: eCs } = await sb.from('clientes').select('id,email').in('id', trozo.map(x => x.cliente_id));
          if (eCs) throw eCs;
          const mapa = new Map((cs || []).map((c: any) => [c.id, String(c.email || '').trim().toLowerCase()]));
          for (const x of trozo) {
            const email = mapa.get(x.cliente_id) || '';
            if (!okMail(email)) { sinCorreo++; continue; }
            if (filas.has(email)) { repetidos++; continue; }
            filas.set(email, { campana, email, nombre: x.nombre || null, rut: x.rut || null, cliente_id: x.cliente_id, persona_id: x.id, origen, agregada_por: permiso.uid || null });
          }
        }
        const lista = [...filas.values()]; let agregados = 0;
        for (let i = 0; i < lista.length; i += 500) {
          const { data, error } = await sb.from('campana_seleccion').upsert(lista.slice(i, i + 500), { onConflict: 'campana,email', ignoreDuplicates: true }).select('email');
          if (error) throw error;
          agregados += (data || []).length;
        }
        const { data: sel, error: eS } = await sb.rpc('campana_seleccion_pagina', { p_campana: campana, p_q: null, p_limit: 1, p_offset: 0 });
        if (eS) throw eS;
        return json({ ok: true, campana, agregados, ya_estaban: lista.length - agregados, sin_correo: sinCorreo, repetidos, no_encontrados: Math.max(0, ids.length - lista.length - sinCorreo - repetidos),
                      total: sel?.total ?? null, con_cuenta: sel?.con_cuenta ?? null, sin_cuenta: sel?.sin_cuenta ?? null, publico: esSel(f.config) ? 'seleccion' : 'miembros' });
      }
      case 'seleccion_quitar': {
        if (!campana) return json({ error: 'Falta la campaña.' }, 400);
        let q = sb.from('campana_seleccion').delete().eq('campana', campana);
        if (!b.todos) {
          const emails = (Array.isArray(b.emails) ? b.emails : []).map(e => String(e).trim().toLowerCase()).filter(Boolean).slice(0, 100);
          if (!emails.length) return json({ error: 'No indicaste a quién quitar.' }, 400);
          q = q.in('email', emails);
        }
        const { data, error } = await q.select('email');
        if (error) throw error;
        return json({ ok: true, quitados: (data || []).length });
      }
      case 'seleccion_listar': {
        if (!campana) return json({ error: 'Falta la campaña.' }, 400);
        const por = 50, pag = Math.max(0, Math.floor(Number(b.pagina) || 0));
        const { data, error } = await sb.rpc('campana_seleccion_pagina', { p_campana: campana, p_q: b.q || null, p_limit: por, p_offset: pag * por });
        if (error) throw error;
        return json({ ok: true, ...(data || { total: 0, filas: [] }), pagina: pag, por });
      }
      case 'envios': {
        if (!campana) return json({ error: 'Falta la campaña.' }, 400);
        const por = 50, pag = Math.max(0, Math.floor(Number(b.pagina) || 0));
        const { data, error } = await sb.rpc('campana_envios_pagina', { p_campana: campana, p_estado: b.estado || 'todos', p_q: b.q || null, p_limit: por, p_offset: pag * por });
        if (error) throw error;
        return json({ ok: true, ...(data || { total: 0, filas: [] }), pagina: pag, por });
      }
      case 'reintentar': {
        // Los «sin remedio» (3 errores) vuelven a quedar pendientes: la próxima tanda los intenta de nuevo.
        if (!campana) return json({ error: 'Falta la campaña.' }, 400);
        let q = sb.from('campana_envios').delete().eq('campana', campana).eq('estado', 'error').gte('intentos', 3);
        if (Array.isArray(b.ids) && b.ids.length) q = q.in('id', b.ids.map(Number).filter(n => n > 0).slice(0, 500));
        const { data, error } = await q.select('id');
        if (error) throw error;
        return json({ ok: true, reintentados: (data || []).length });
      }
      case 'preview': {
        const cfg = b.config || (await cargar()) || {};
        const m = await marca(sb);
        return json({ ok: true, html: htmlCampana(cfg, { nombre: 'Camila', bajaUrl: `${BAJA_PAGINA}?e=ejemplo&t=ejemplo`, ...m }), faltan: validar(cfg, true) });
      }
      case 'prueba': {
        const cfg = b.config || (await cargar()) || {};
        const faltan = validar(cfg, false);
        if (faltan.length) return json({ error: 'Falta: ' + faltan.join(', ') }, 400);
        const propio = await emailDelToken(req);
        const extra = (Array.isArray(b.a) ? b.a : []).map(x => String(x || '').trim().toLowerCase()).filter(x => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(x)).slice(0, 3);
        const destinos = [...new Set([propio, ...extra].filter(Boolean) as string[])];
        if (!destinos.length) return json({ error: 'No encontré tu correo de admin.' }, 400);
        const m = await marca(sb); const ids: string[] = [];
        for (const d of destinos) { ids.push(await enviarUno(cfg, { email: d, nombre: 'Camila' }, m, campana || 'prueba', true)); await pausa(550); }
        return json({ ok: true, enviados: destinos });
      }
      case 'resumen': {
        if (!campana) return json({ error: 'Falta el nombre de la campaña.' }, 400);
        const cfg = await cargar();
        const { data, error } = await sb.rpc(esSel(cfg) ? 'campana_resumen_sel' : 'campana_resumen', { p_campana: campana, ...filtros(cfg) });
        if (error) throw error;
        return json({ ok: true, resumen: data, guardada: !!cfg, publico: esSel(cfg) ? 'seleccion' : 'miembros' });
      }
      case 'tanda': {
        if (b.confirmar !== 'ENVIAR') return json({ error: 'Falta confirmar el envío.' }, 400);
        const fcam = await fila();
        const cfg = fcam?.config || null;
        if (!cfg) return json({ error: 'Guarda la campaña antes de enviar.' }, 400);
        if (fcam?.archivada_at) return json({ error: 'La campaña está archivada: desarchívala para enviar.', code: 'ARCHIVADA' }, 409);
        const faltan = validar(cfg, true);
        if (faltan.length) return json({ error: 'Falta: ' + faltan.join(', ') }, 400);
        // Candado: una sola tanda a la vez por campaña (dos pestañas, reintentos).
        const ahora = new Date().toISOString();
        const { data: lock, error: eL } = await sb.from('campanas')
          .update({ tanda_hasta: new Date(Date.now() + 150000).toISOString() })
          .eq('id', campana).or(`tanda_hasta.is.null,tanda_hasta.lt.${ahora}`).select('id');
        if (eL) throw eL;
        if (!lock || !lock.length) return json({ error: 'Ya hay una tanda en curso de esta campaña.', code: 'EN_CURSO' }, 409);
        let enviados = 0, errores = 0, saltados = 0, frenado = 0;
        try {
          const limite = Math.max(1, Math.min(Number(b.limite) || 40, 60));
          const { data: dest, error: eD } = await sb.rpc(esSel(cfg) ? 'campana_destinatarios_sel' : 'campana_destinatarios', { p_campana: campana, p_limite: limite, ...filtros(cfg) });
          if (eD) throw eD;
          const m = await marca(sb); const t0 = Date.now();
          for (const d of (dest || []) as { cliente_id: string; email: string; nombre: string }[]) {
            if (Date.now() - t0 > 90000) break;               // margen antes del límite de la función
            // Reclamar el correo: fila nueva, o reintento de un error (<3) o de un envío colgado (>5 min).
            let id: number | null = null;
            const { data: nuevo, error: eT } = await sb.from('campana_envios')
              .upsert({ campana, email: d.email, cliente_id: d.cliente_id, estado: 'enviando' }, { onConflict: 'campana,email', ignoreDuplicates: true })
              .select('id');
            if (eT) throw eT;
            if (nuevo && nuevo.length) id = nuevo[0].id;
            else {
              const { data: ex } = await sb.from('campana_envios').select('id,estado,intentos,creado_at').eq('campana', campana).eq('email', d.email).maybeSingle();
              const colgado = ex && ex.estado === 'enviando' && Date.now() - new Date(ex.creado_at).getTime() > 300000;
              if (ex && ((ex.estado === 'error' && ex.intentos < 3) || colgado)) {
                const { data: re } = await sb.from('campana_envios')
                  .update({ estado: 'enviando', error: null, creado_at: new Date().toISOString(), intentos: ex.intentos + 1 })
                  .eq('id', ex.id).eq('estado', ex.estado).eq('intentos', ex.intentos).select('id');
                if (re && re.length) id = re[0].id;
              }
            }
            if (!id) { saltados++; continue; }
            try {
              const rid = await enviarUno(cfg, { email: d.email, nombre: d.nombre || '' }, m, campana);
              const { error: eU } = await sb.from('campana_envios').update({ estado: 'enviado', resend_id: rid, enviado_at: new Date().toISOString(), error: null }).eq('id', id);
              if (eU) console.error('[send-campana] marcar enviado', d.email, eU);
              enviados++;
            } catch (e) {
              const { error: eU } = await sb.from('campana_envios').update({ estado: 'error', error: String((e as Error).message || e).slice(0, 300) }).eq('id', id);
              if (eU) console.error('[send-campana] marcar error', d.email, eU);
              if ((e as any).frenar) { frenado = (e as any).frenar; break; }   // Resend pidió bajar el ritmo: se corta la tanda
              errores++;
            }
            await pausa(1000);                                // ~1 por segundo: deja espacio a los correos con QR
          }
        } finally {
          await sb.from('campanas').update({ tanda_hasta: null }).eq('id', campana);
        }
        const { data: resumen, error: eR } = await sb.rpc(esSel(cfg) ? 'campana_resumen_sel' : 'campana_resumen', { p_campana: campana, ...filtros(cfg) });
        return json({ ok: true, enviados, errores, saltados, frenado, resumen: eR ? null : resumen, aviso: eR ? String(eR.message) : null });
      }
      default:
        return json({ error: 'Acción desconocida.' }, 400);
    }
  } catch (err) {
    console.error('[send-campana]', err);
    return json({ error: String((err as Error)?.message || err) }, 500);
  }
});
