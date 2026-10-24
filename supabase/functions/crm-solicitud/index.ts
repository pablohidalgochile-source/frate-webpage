// ============================================================
// FRATE — Edge Function: crm-solicitud
// El CLIENTE crea solicitudes CRM desde frate.cl y se avisa al
// ERP por webhook (contrato ARQUITECTURA-CRM-WEB.md, decisión 2).
//
// Acciones (body.accion):
//  · crear_reserva      — mesa (tipo 'reserva') con invitados[]
//  · crear_cumpleanos   — cumpleaños con invitados[]
//  · crear_lista        — solo cuentas rol rrpp/admin
//  · inscribir_lista    — público (lista abierta)
//  · crear_invitacion_rrpp — solo rrpp/admin
//  · cancelar           — el cliente baja su reserva (auth dueño)
//
// Reglas: fecha YYYY-MM-DD obligatoria, invitados[].nombre
// obligatorio, RUT opcional (se valida DV si viene). El webhook
// jamás bloquea la creación: si falla, va a la cola.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.111.0';
import { rateOk, demasiados } from '../_shared/rate.ts';
import { despacharWebhook, enviarWebhookERP, formularioAPayloadERP, planoAPayloadERP } from '../_shared/crm.ts';
import { generarCortesia } from '../_shared/cortesia.ts';

function rutValido(rut: string): boolean {
  const limpio = String(rut || '').replace(/[^0-9kK]/g, '').toLowerCase();
  if (limpio.length < 7) return false;
  const cuerpo = limpio.slice(0, -1), dv = limpio.slice(-1);
  let suma = 0, mul = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) { suma += parseInt(cuerpo[i]) * mul; mul = mul === 7 ? 2 : mul + 1; }
  const res = 11 - (suma % 11);
  const dvOk = res === 11 ? '0' : res === 10 ? 'k' : String(res);
  return dv === dvOk;
}
// Formatea a RUT chileno limpio (12345678-9) SOLO si parece RUT; documentos extranjeros → tal cual.
function formatRut(v: unknown): string {
  const raw = String(v ?? '').replace(/\.0$/, '').trim();
  const c = raw.toUpperCase().replace(/[.\-\s]/g, '');
  return /^\d{7,8}[0-9K]$/.test(c) ? c.slice(0, -1) + '-' + c.slice(-1) : raw;
}

// Normaliza el teléfono a un WhatsApp PLAUSIBLE (igual que lo guarda el webhook de WhatsApp),
// o devuelve '' si no lo es:
//  · Chile celular → 569 + 8 dígitos (acepta 8 dígitos, 9 que parten en 9, u 11 que parten en 569).
//  · Extranjero    → 10 a 15 dígitos que no parten en 0 ni en 56 y no son todos el mismo dígito.
// OJO: antes cualquier cosa pasaba ('000', un fijo, un número a medias) y todas las solicitudes
// que traían el MISMO número inválido caían en UNA sola conversación, aunque fueran de personas
// distintas. Meta además los rechaza (131009). Con '' no se crea ni se reutiliza conversación;
// la solicitud se guarda igual.
function telInbox(raw: string): string {
  const n = String(raw || '').replace(/[^\d]/g, '');
  if (n.length === 8) return '569' + n;
  if (n.length === 9 && n.startsWith('9')) return '56' + n;
  if (n.length === 11 && n.startsWith('569')) return n;
  if (n.length >= 10 && n.length <= 15 && !/^(0|56)/.test(n) && !/^(\d)\1+$/.test(n)) return n;
  return '';
}

// Deja la solicitud visible en el inbox de WhatsApp (bandeja unificada). Best-effort: nunca rompe la creación.
async function vincularInbox(sb: any, opts: { telefono: string; nombre?: string; canal?: string; resumen: string }) {
  const tel = telInbox(opts.telefono);
  if (!tel) return;
  const nombre = (opts.nombre || '').trim() || null;
  const canal = opts.canal || 'general';
  const resumen = (opts.resumen || 'Nueva solicitud desde la web').slice(0, 300);
  const now = new Date().toISOString();
  try {
    const { data: conv } = await sb.from('wsp_conversaciones').select('id, etapa').eq('telefono', tel).maybeSingle();
    let convId: string | null = conv?.id || null;
    if (convId) {
      const upd: Record<string, unknown> = { ultimo_mensaje: resumen, ultimo_mensaje_at: now, updated_at: now, canal };
      if (nombre) upd.nombre = nombre;
      if (!conv?.etapa || conv.etapa === 'bot_intake') upd.etapa = 'esperando_anfitrion';
      await sb.from('wsp_conversaciones').update(upd).eq('id', convId);
    } else {
      const base: Record<string, unknown> = { telefono: tel, nombre, canal, etapa: 'esperando_anfitrion', ultimo_mensaje: resumen, ultimo_mensaje_at: now };
      let r = await sb.from('wsp_conversaciones').insert({ ...base, origen: 'formulario' }).select('id').single();
      if (r.error) r = await sb.from('wsp_conversaciones').insert(base).select('id').single();
      convId = r.data?.id || null;
    }
    if (convId) {
      // Va como 'cliente', no como 'nota': esto es lo que ESCRIBIÓ la persona
      // en el formulario. Marcado como nota, el inbox lo pintaba del lado del
      // equipo y la conversación se leía como si nadie hubiera preguntado nada.
      await sb.from('wsp_mensajes').insert({ conversacion_id: convId, telefono: tel, rol: 'cliente', texto: resumen, tipo: 'nota', ts: now });
    }
  } catch (e) { console.error('[vincularInbox]', e); }
}

function limpiarInvitados(raw: unknown): { nombre: string; rut: string; telefono?: string; email?: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 60).map((p: any) => ({
    nombre: String(p?.nombre || '').trim().slice(0, 80),
    rut: String(p?.rut || '').trim().slice(0, 15),
    telefono: String(p?.telefono || '').trim().slice(0, 20) || undefined,
    email: String(p?.email || '').trim().slice(0, 80) || undefined,
  })).filter(p => p.nombre);
}

Deno.serve(async (req: Request) => {
  const cors = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Content-Type': 'application/json',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST')    return new Response('Method not allowed', { status: 405, headers: cors });

  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json().catch(() => ({}));
    const accion = String(body.accion || '');

    // Usuario autenticado (opcional para reservas/inscripciones; requerido para rrpp/cancelar)
    let uid: string | null = null, rol = '';
    try {
      const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '');
      if (jwt) {
        const { data: u } = await sb.auth.getUser(jwt);
        uid = u?.user?.id || null;
        if (uid) {
          const { data: perfil } = await sb.from('clientes').select('rol').eq('id', uid).maybeSingle();
          rol = perfil?.rol || '';
        }
      }
    } catch (e) { /* invitado */ }

    const nowISO = new Date().toISOString();

    // ── sincronizar_erp (solo admin) ─────────────────────────
    // Manda cumpleaños y reservas al ERP. Sirve para tres cosas:
    //   · reenviar cuando el equipo guarda la gestión (ahí viaja la plata)
    //   · rellenar una noche entera que nunca se mandó
    //   · repetir a mano cuando algo no llegó
    // El ERP es idempotente por (tipo, web_id): reenviar no duplica.
    if (accion === 'sincronizar_erp') {
      if (rol !== 'admin') {
        return new Response(JSON.stringify({ error: 'Solo un admin sincroniza con el ERP' }), { status: 403, headers: cors });
      }
      const p = body.payload || {};
      let q = sb.from('formularios').select('*').in('tipo', ['cumple', 'reserva']);
      if (Array.isArray(p.ids) && p.ids.length) {
        q = q.in('id', p.ids.slice(0, 500).map((x: any) => parseInt(x)).filter(Boolean));
      } else if (p.desde) {
        q = q.gte('created_at', String(p.desde)).lte('created_at', String(p.hasta || p.desde) + 'T23:59:59Z');
      } else {
        q = q.order('created_at', { ascending: false }).limit(200);
      }
      const { data: filas, error: eF } = await q;
      if (eF) throw eF;

      // Si viene `fecha`, se filtra por la NOCHE a celebrar, que vive dentro
      // de `datos` y no se puede filtrar en la consulta.
      const noche = String(p.fecha || '').trim();
      const elegidas = (filas || []).filter((f: any) => {
        if (!noche) return true;
        const d = f.datos || {};
        return [d.fecha_celebrar, d.fecha, d.fecha_evento]
          .some((x: any) => String(x || '').slice(0, 10) === noche);
      });

      const lote: any[] = elegidas.map(formularioAPayloadERP).filter(Boolean);

      // ── el plano de esa noche viaja con las fichas ──
      // Acordado: el plano lo manda la WEB. Solo tiene sentido cuando se pide
      // una noche concreta; en un rango no hay «una» disposición.
      if (noche && p.con_plano !== false) {
        try {
          const { data: pl } = await sb.from('planos').select('nombre,data').eq('activo', true).order('orden').limit(1);
          if (pl && pl[0] && pl[0].data) {
            const ocup = elegidas.map((f: any) => {
              const g = f.gestion || {}, d = f.datos || {};
              return {
                zona: String(g.zona || g.mesa || '').trim(),
                nombre: f.nombre || '',
                tipo: f.tipo === 'cumple' ? 'cumpleanos' : 'reserva',
                personas: parseInt(String(g.invitados || d.invitados || d.personas || '').replace(/\D/g, '')) || 0,
              };
            });
            lote.push(planoAPayloadERP({ ...pl[0].data, nombre: pl[0].nombre }, noche, ocup));
          }
        } catch (_) { /* sin tabla planos → van solo las fichas */ }
      }
      if (!lote.length) {
        return new Response(JSON.stringify({ ok: true, enviados: 0, revisados: (filas || []).length, nota: 'Nada que mandar con ese filtro' }), { headers: cors });
      }
      // El ERP acepta hasta 500 por lote; se manda en tandas de 100 por si
      // alguna tanda falla — así no se pierde todo el envío por una fila.
      let enviados = 0; const fallas: string[] = [];
      for (let i = 0; i < lote.length; i += 100) {
        const tanda = lote.slice(i, i + 100);
        const r = await enviarWebhookERP(tanda);
        if (r.ok) enviados += tanda.length;
        else { fallas.push(r.error || 'error'); for (const x of tanda) await despacharWebhook(sb, x); }
      }
      return new Response(JSON.stringify({
        ok: fallas.length === 0, enviados, revisados: (filas || []).length,
        encolados: lote.length - enviados, errores: fallas,
      }), { headers: cors });
    }

    // ── crear_reserva / crear_cumpleanos ─────────────────────
    if (accion === 'crear_reserva' || accion === 'crear_cumpleanos') {
      const esCumple = accion === 'crear_cumpleanos';
      const p = body.payload || {};
      const nombre = String(p.nombre || '').trim();
      const telefono = String(p.telefono || '').trim();
      const fecha = String(p.fecha || '').trim();
      const personas = Math.max(1, Math.min(200, parseInt(p.personas) || 0));
      if (!nombre || !telefono || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !p.personas) {
        return new Response(JSON.stringify({ error: 'Faltan datos: nombre, teléfono, fecha y personas son obligatorios.' }), { status: 400, headers: cors });
      }
      const invitados = limpiarInvitados(p.invitados);
      if (!invitados.length) {
        return new Response(JSON.stringify({ error: 'Debes detallar a tus invitados (al menos su nombre).' }), { status: 400, headers: cors });
      }
      const rutMalos = invitados.filter(i => i.rut && !rutValido(i.rut)).map(i => i.nombre);
      if (p.rut && !rutValido(p.rut)) rutMalos.unshift(nombre);
      if (rutMalos.length) {
        return new Response(JSON.stringify({ error: 'RUT inválido para: ' + rutMalos.join(', ') + '. Revisa el dígito verificador.' }), { status: 400, headers: cors });
      }

      const fila: Record<string, unknown> = {
        nombre, telefono, fecha, personas,
        tipo: esCumple ? 'cumpleanos' : 'reserva',
        estado: 'pendiente',
        cliente_id: uid,
        rut: String(p.rut || '').trim() || null,
        email: String(p.email || '').trim() || null,
        instagram: String(p.instagram || '').trim() || null,
        zona_preferida: String(p.zona_preferida || '').trim() || null,
        presupuesto: parseInt(p.presupuesto) || null,
        quiere_botellas: !!p.quiere_botellas,
        quiere_decoracion: esCumple ? !!p.quiere_decoracion : false,
        quiere_mesa: esCumple ? (p.quiere_mesa !== false) : true,
        fecha_nacimiento: esCumple && /^\d{4}-\d{2}-\d{2}$/.test(String(p.fecha_nacimiento || '')) ? p.fecha_nacimiento : null,
        comentario: String(p.comentario || '').trim().slice(0, 600) || null,
        invitados,
        origen: body.origen === 'anfitrion' ? 'anfitrion' : 'web_form',
      };
      // ── Anti-duplicado: si ya hay una reserva/cumple ABIERTO del mismo tipo con
      // el mismo teléfono, correo o nombre (últimos 120 días), no creamos otro.
      // Comparamos normalizado EN CÓDIGO (teléfonos con formato distinto). ──
      try {
        const desde = new Date(Date.now() - 120 * 24 * 3600 * 1000).toISOString();
        const tel8 = telefono.replace(/\D/g, '').slice(-8);
        const emailN = String(p.email || '').trim().toLowerCase();
        // Mismas dos correcciones que en form-submit, por el mismo motivo:
        //  (1) el NOMBRE ya no bloquea por sí solo — un homónimo no es la misma
        //      persona, y trababa a gente con otro correo y otro teléfono;
        //  (2) se compara la FECHA pedida — una ficha abierta ya no traba 120 días
        //      para cualquier noche. Acá es exacto porque `reservas` guarda la
        //      fecha en su propia columna y este camino la exige sí o sí.
        const { data: abiertos } = await sb.from('reservas')
          .select('id,email,telefono,fecha')
          .eq('tipo', esCumple ? 'cumpleanos' : 'reserva')
          .not('estado', 'in', '("cancelada","rechazada","realizada")')
          .gte('created_at', desde)
          .limit(3000);
        const dup = (abiertos || []).find((r: any) => {
          const mismaPersona =
            (emailN && String(r.email || '').toLowerCase().trim() === emailN) ||
            (tel8.length >= 7 && String(r.telefono || '').replace(/\D/g, '').slice(-8) === tel8);
          if (!mismaPersona) return false;
          const fr = String(r.fecha || '').trim();
          if (!fecha || !fr) return true;   // sin fecha que comparar, se mantiene lo de antes
          return fr === fecha;
        });
        if (dup) {
          // Con `motivo` y `msg` para que el popup lo DIGA: antes devolvía
          // ok:true a secas, el popup abría WhatsApp y decía «registrada»
          // aunque no se hubiera guardado nada.
          return new Response(JSON.stringify({
            ok: true, ya: true, id: dup.id,
            motivo: 'ya_abierta',
            msg: 'Ya tenemos tu solicitud para el ' + fecha + ' y la estamos viendo.',
          }), { headers: cors });
        }
      } catch (_e) { /* si el chequeo falla, seguimos e insertamos igual */ }

      const { data: creada, error } = await sb.from('reservas').insert(fila).select('id').single();
      if (error) throw error;

      // ── Bandeja unificada: que la solicitud aparezca en el inbox de WhatsApp ──
      try {
        const resumen = `📝 ${esCumple ? '🎂 Cumpleaños' : '🍾 Reserva'} (web) — ${nombre} · ${fecha} · ${personas} pers.${fila.comentario ? ' · ' + fila.comentario : ''}`;
        await vincularInbox(sb, { telefono, nombre, canal: esCumple ? 'cumpleanos' : 'reserva', resumen });
      } catch (_e) { /* mejor esfuerzo */ }

      // Webhook al ERP (§4.1/§4.2 + invitados[])
      const payloadERP: Record<string, unknown> = {
        tipo: esCumple ? 'cumpleanos' : 'reserva',
        web_id: creada.id,
        cliente_id: uid,
        nombre, rut: fila.rut || '', telefono, email: fila.email || '', instagram: fila.instagram || '',
        fecha, evento_web_id: parseInt(p.evento_web_id) || null,
        personas, invitados,
        zona_preferida: fila.zona_preferida || '', presupuesto: fila.presupuesto || null,
        quiere_botellas: fila.quiere_botellas, comentario: fila.comentario || '',
        creado_at: nowISO,
      };
      if (esCumple) {
        payloadERP.fecha_nacimiento = fila.fecha_nacimiento || null;
        payloadERP.quiere_decoracion = fila.quiere_decoracion;
        payloadERP.quiere_mesa = fila.quiere_mesa;
      } else {
        payloadERP.consumo_minimo_ofrecido = parseInt(p.consumo_minimo_ofrecido) || null;
      }
      await despacharWebhook(sb, payloadERP);
      return new Response(JSON.stringify({ ok: true, web_id: creada.id }), { headers: cors });
    }

    // ── crear_lista (solo rrpp/admin) ────────────────────────
    if (accion === 'crear_lista') {
      if (!uid || !['rrpp', 'admin'].includes(rol)) return new Response(JSON.stringify({ error: 'Solo cuentas RRPP o admin pueden crear listas.' }), { status: 403, headers: cors });
      const p = body.payload || {};
      const nombre = String(p.nombre || '').trim();
      const fecha = String(p.fecha || '').trim();
      if (!nombre || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return new Response(JSON.stringify({ error: 'Nombre y fecha (YYYY-MM-DD) son obligatorios.' }), { status: 400, headers: cors });
      const { data: lista, error } = await sb.from('listas').insert({
        nombre, fecha,
        evento_id: parseInt(p.evento_id) || null,
        duenio_id: uid,
        codigo: String(p.codigo || '').trim().toUpperCase() || null,
        estado: 'pendiente',
        origen: 'web_form',
      }).select('id').single();
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, lista_web_id: lista.id }), { headers: cors });
    }

    // ── inscribir_lista (público) ────────────────────────────
    if (accion === 'inscribir_lista') {
      if (!(await rateOk(sb, req, 'inscribir', 15, 300))) return demasiados(cors);
      const p = body.payload || {};
      const nombre = String(p.nombre || '').trim();
      const rut = formatRut(p.rut);
      const telefono = String(p.telefono || '').trim();
      const email = String(p.email || '').trim();
      const genero = String(p.genero || '').trim().toUpperCase().slice(0, 1);   // F | M | X
      const universidad = String(p.universidad || '').trim().slice(0, 120) || null;
      const direccion = String(p.direccion || '').trim().slice(0, 160) || null;
      const fnac = /^\d{4}-\d{2}-\d{2}$/.test(String(p.fecha_nacimiento || '')) ? p.fecha_nacimiento : null;
      const extranjero = !!p.extranjero;
      // Resolver la lista por id (numérico) o por código (link público /lista/CODIGO)
      let lista: any = null;
      if (p.lista_id) { const { data } = await sb.from('listas').select('*').eq('id', parseInt(p.lista_id)).maybeSingle(); lista = data; }
      else if (p.codigo) { const { data } = await sb.from('listas').select('*').eq('codigo', String(p.codigo).trim().toUpperCase()).maybeSingle(); lista = data; }
      if (!lista) return new Response(JSON.stringify({ error: 'Esta lista no existe.' }), { status: 404, headers: cors });
      if (!nombre) return new Response(JSON.stringify({ error: 'Falta tu nombre.' }), { status: 400, headers: cors });
      if (!rut && !telefono && !email) return new Response(JSON.stringify({ error: 'Deja al menos un dato de contacto (RUT, teléfono o email).' }), { status: 400, headers: cors });
      if (rut && !extranjero && !rutValido(rut)) return new Response(JSON.stringify({ error: 'RUT inválido — revisa el dígito verificador. Si eres extranjer@, marca la casilla.' }), { status: 400, headers: cors });
      if (['rechazada', 'cerrada'].includes(lista.estado)) return new Response(JSON.stringify({ error: 'Esta lista no está disponible.' }), { status: 409, headers: cors });
      if (lista.valido_hasta && new Date(lista.valido_hasta) < new Date()) return new Response(JSON.stringify({ error: 'Esta lista ya cerró.' }), { status: 409, headers: cors });
      if (lista.genero_esperado && !genero) return new Response(JSON.stringify({ error: 'Selecciona tu género para continuar.' }), { status: 400, headers: cors });
      // Dedup obvio: mismo RUT en la misma lista → ya está inscrito (idempotente)
      if (rut) {
        const { data: dup } = await sb.from('lista_inscritos').select('id').eq('lista_id', lista.id).eq('rut', rut).maybeSingle();
        if (dup) return new Response(JSON.stringify({ ok: true, web_id: dup.id, ya: true }), { headers: cors });
      }
      // ── UN RUT = UNA ENTRADA POR NOCHE ──────────────────────
      // Hasta ahora la misma persona podía anotarse en la lista de tres RRPP
      // distintos y recibía tres QR: tres cupos regalados por una sola persona.
      // Regla: lo que YA tiene QR gana siempre (nunca se pisa algo emitido);
      // entre listas sin emitir manda el peso — pagada 100 > cumpleaños/reserva
      // 80 > zona VIP 50+ > general 10.
      let avisoRepetido: string | null = null;
      const rutN = String(rut || '').replace(/[^0-9kK]/g, '').toUpperCase();
      if (rutN.length >= 7 && lista.evento_id) {
        try {
          const pesoDe = (l: any) => (['birthday','reservation','cumpleanos','reserva'].includes(String(l.tipo || '')) ? 80 : (l.zona_id ? 60 : 10));
          const pesoNueva = pesoDe(lista);

          // (a) ¿ya tiene una entrada EMITIDA para esa noche? → gana siempre
          const { data: emit } = await sb.from('items_pedido')
            .select('id, nombre_ticket, rut_asistente, pedido_id, pedidos!inner(estado, total_pagado)')
            .eq('evento_id', lista.evento_id).eq('pedidos.estado', 'pagado').limit(60);
          const yaEmitida: any = (emit || []).find((it: any) =>
            String(it.rut_asistente || '').replace(/[^0-9kK]/g, '').toUpperCase() === rutN);
          if (yaEmitida) {
            const _ped: any = yaEmitida.pedidos;
            const pagada = Number((Array.isArray(_ped) ? _ped[0]?.total_pagado : _ped?.total_pagado) || 0) > 0;
            return new Response(JSON.stringify({ error: pagada
              ? 'Ya tienes tu entrada comprada para esa noche 🎟️ No necesitas anotarte acá — llega con tu QR.'
              : 'Ya tienes una entrada para esa noche 🎟️ Revisa tu correo: el QR ya te llegó.' }), { status: 409, headers: cors });
          }

          // (b) ¿está en otra lista de la misma noche, todavía sin emitir?
          const { data: otras } = await sb.from('lista_inscritos')
            .select('id, rut, lista_id, pedido_cortesia_id, listas!inner(id, nombre, tipo, zona_id, evento_id, estado)')
            .eq('listas.evento_id', lista.evento_id).neq('lista_id', lista.id).limit(400);
          const enOtra = (otras || []).filter((x: any) =>
            String(x.rut || '').replace(/[^0-9kK]/g, '').toUpperCase() === rutN &&
            !x.pedido_cortesia_id && String(x?.listas?.estado || '') !== 'rechazada');

          if (enOtra.length) {
            const mejor = enOtra.map((x: any) => ({ x, peso: pesoDe(x.listas) }))
                                .sort((a, b) => b.peso - a.peso)[0];
            if (mejor.peso >= pesoNueva) {
              return new Response(JSON.stringify({ error:
                'Ya estás en la lista «' + (mejor.x.listas.nombre || 'otra lista') + '» para esa noche. '
                + 'Es una o la otra: si prefieres esta, pídele a quien te invitó que te saque de la anterior.' }),
                { status: 409, headers: cors });
            }
            // La nueva vale más: la anterior se marca como reemplazada para que
            // no emita un segundo QR. No se borra — queda el rastro de dónde estaba.
            for (const e of enOtra) {
              try { await sb.from('lista_inscritos').update({ estado: 'reemplazado' }).eq('id', e.id); } catch (_) {}
            }
            avisoRepetido = 'Estabas en «' + (mejor.x.listas.nombre || 'otra lista') + '» y te movimos a esta, que tiene mejor acceso.';
          }
        } catch (_) { /* si algo falla acá, la inscripción NO se cae por eso */ }
      }

      const { count } = await sb.from('lista_inscritos').select('*', { count: 'exact', head: true }).eq('lista_id', lista.id);
      const tope = lista.cupos || 100000;
      if ((count || 0) >= tope) return new Response(JSON.stringify({ error: 'La lista está llena 😢' }), { status: 409, headers: cors });
      const fila: any = {
        lista_id: lista.id, nombre, rut: rut || null, telefono: telefono || null, email: email || null,
        instagram: String(p.instagram || '').trim() || null,
        genero: genero || null, universidad, direccion, fecha_nacimiento: fnac,
        acompanantes: Math.max(0, Math.min(10, parseInt(p.acompanantes) || 0)),
        estado: 'pendiente', origen: 'web_form', extranjero,
        // FRATE LINK — campos por tipo + calidad de dato
        apodo: String(p.apodo || '').trim() || null,
        rol: String(p.rol || '').trim() || null,
        productor: String(p.productor || '').trim() || null,
        nacionalidad: String(p.nacionalidad || '').trim() || null,
        espacio_id: String(p.espacio_id || '').trim() || null,
        espacio_nombre: String(p.espacio_nombre || '').trim() || null,
        calidad_dato: (rut && email) ? 'completa' : (rut || email) ? 'parcial' : 'minima',
      };
      // Declaración de género (respaldo de la restricción; la corroboración física es en la puerta con la cédula)
      if (p.genero_declarado) fila.datos_extra = { genero_declarado: String(p.genero_declarado).toUpperCase().slice(0, 1), genero_declarado_at: nowISO };
      let insc: any, error: any;
      ({ data: insc, error } = await sb.from('lista_inscritos').insert(fila).select('id').single());
      if (error && /column|schema cache|extranjero|apodo|\brol\b|productor|nacionalidad|calidad|espacio|datos_extra/i.test(String(error.message || ''))) {
        // Columnas nuevas aún no existen (falta correr frate-link.sql / frate-plantillas.sql) → guarda sin ellas
        ['extranjero','apodo','rol','productor','nacionalidad','espacio_id','espacio_nombre','calidad_dato','datos_extra'].forEach(k => delete fila[k]);
        ({ data: insc, error } = await sb.from('lista_inscritos').insert(fila).select('id').single());
      }
      if (error) throw error;
      // Cierre automático: si la lista lo tiene activado y se llenaron los cupos, se cierra sola.
      if (lista.cierre_auto && lista.cupos && ((count || 0) + 1) >= lista.cupos) {
        try { await sb.from('listas').update({ estado: 'cerrada' }).eq('id', lista.id); } catch (_) {}
      }
      await despacharWebhook(sb, {
        tipo: 'lista', web_id: insc.id, lista_web_id: lista.id, lista_nombre: lista.nombre,
        evento_web_id: lista.evento_id || null, fecha: lista.fecha,
        nombre, rut, telefono, email, instagram: String(p.instagram || '').trim(),
        genero: genero || '', universidad: universidad || '', direccion: direccion || '', fecha_nacimiento: fnac,
        acompanantes: parseInt(p.acompanantes) || 0, extranjero, comentario: '', creado_at: nowISO,
      });
      // F4 — ficha especializada de cumpleaños / reserva (si viene)
      try {
        const f = body.payload?.ficha || null;
        if (f && lista.tipo === 'birthday') {
          await sb.from('birthday_requests').insert({ lista_id: lista.id, cumpleaniero: nombre, telefono: telefono || null, instagram: String(p.instagram || '').trim() || null, invitados_estimados: parseInt(f.invitados) || null, presupuesto: f.presupuesto || null, quiere_botellas: !!f.botellas, quiere_decoracion: !!f.decoracion, zona_preferida: f.zona || null });
        } else if (f && lista.tipo === 'reservation') {
          await sb.from('reservation_requests').insert({ lista_id: lista.id, responsable: nombre, party_size: parseInt(f.party_size) || null, zona: f.zona || null, presupuesto: f.presupuesto || null, quiere_botellas: !!f.botellas });
        }
      } catch (_) { /* si faltan las tablas (frate-link.sql), sigue igual */ }

      // F6 — AUTO-APROBAR: si el link NO requiere aprobación humana → QR al instante
      let qr_token: string | null = null;
      if (lista.requires_manual_approval === false && lista.evento_id) {
        try {
          const cort = await generarCortesia(sb, {
            nombre, rut: rut || '', email, eventoId: lista.evento_id, fecha: lista.fecha,
            etiqueta: 'Lista: ' + lista.nombre, cantidad: 1, condiciones: lista.condiciones,
          });
          await sb.from('lista_inscritos').update({ estado: 'aprobado', pedido_cortesia_id: cort.pedidoId, qr_ids: cort.qrIds }).eq('id', insc.id);
          qr_token = (cort.qrIds && cort.qrIds[0]) || null;
        } catch (_) { /* si falla, queda pendiente para revisión */ }
      }
      return new Response(JSON.stringify({ ok: true, web_id: insc.id, qr_token, aviso: avisoRepetido }), { headers: cors });
    }

    // ── crear_invitacion_rrpp (solo rrpp/admin) ──────────────
    if (accion === 'crear_invitacion_rrpp') {
      if (!uid || !['rrpp', 'admin'].includes(rol)) return new Response(JSON.stringify({ error: 'Solo cuentas RRPP o admin.' }), { status: 403, headers: cors });
      const p = body.payload || {};
      const nombre = String(p.nombre || '').trim();
      const fecha = String(p.fecha || '').trim();
      const rut = String(p.rut || '').trim();
      const telefono = String(p.telefono || '').trim();
      const email = String(p.email || '').trim();
      if (!nombre || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return new Response(JSON.stringify({ error: 'Nombre del invitado y fecha son obligatorios.' }), { status: 400, headers: cors });
      if (!rut && !telefono && !email) return new Response(JSON.stringify({ error: 'Deja al menos un dato de contacto del invitado.' }), { status: 400, headers: cors });
      if (rut && !rutValido(rut)) return new Response(JSON.stringify({ error: 'RUT inválido.' }), { status: 400, headers: cors });
      // Código del RRPP (el suyo activo más reciente, o el indicado)
      let codigoRow: any = null;
      if (p.codigo) {
        const { data } = await sb.from('codigos').select('id,codigo,duenio_id').eq('codigo', String(p.codigo).toUpperCase()).maybeSingle();
        codigoRow = data;
      } else {
        const { data } = await sb.from('codigos').select('id,codigo,duenio_id').eq('duenio_id', uid).eq('activo', true).order('created_at', { ascending: false }).limit(1).maybeSingle();
        codigoRow = data;
      }
      const { data: inv, error } = await sb.from('invitaciones_rrpp').insert({
        codigo_id: codigoRow?.id || null, codigo: codigoRow?.codigo || null,
        duenio_id: uid, fecha, evento_id: parseInt(p.evento_id) || null,
        nombre, rut: rut || null, telefono: telefono || null, email: email || null,
        instagram: String(p.instagram || '').trim() || null,
        personas: Math.max(1, Math.min(10, parseInt(p.personas) || 1)),
        estado: 'pendiente', origen: 'web_form',
      }).select('id').single();
      if (error) throw error;
      const { data: duenio } = await sb.from('clientes').select('nombres,apellidos,username').eq('id', uid).maybeSingle();
      await despacharWebhook(sb, {
        tipo: 'invitacion_rrpp', web_id: inv.id,
        codigo: codigoRow?.codigo || '', rrpp_duenio_id: uid,
        rrpp_nombre: ((duenio?.nombres || '') + ' ' + (duenio?.apellidos || '')).trim() || duenio?.username || '',
        evento_web_id: parseInt(p.evento_id) || null, fecha,
        nombre, rut, telefono, email, instagram: String(p.instagram || '').trim(),
        personas: parseInt(p.personas) || 1, creado_at: nowISO,
      });
      return new Response(JSON.stringify({ ok: true, web_id: inv.id }), { headers: cors });
    }

    // ── crear_convenio (convenio universitario / comunidad) ─────
    if (accion === 'crear_convenio') {
      const p = body.payload || {};
      const nombre = String(p.nombre || '').trim();
      const telefono = String(p.telefono || '').trim();
      if (!nombre || !telefono) return new Response(JSON.stringify({ error: 'Nombre y teléfono de contacto son obligatorios.' }), { status: 400, headers: cors });
      const universidad = String(p.universidad || '').trim().slice(0, 120);
      const email = String(p.email || '').trim();
      const personas = parseInt(p.personas) || null;
      const comentario = [universidad ? ('🎓 ' + universidad) : '', p.cargo ? ('Cargo: ' + String(p.cargo).trim()) : '', String(p.mensaje || '').trim()].filter(Boolean).join(' · ').slice(0, 600);
      const fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(p.fecha || '')) ? p.fecha : new Date().toISOString().slice(0, 10);
      const { data: creada, error } = await sb.from('reservas').insert({
        nombre, telefono, fecha, personas, tipo: 'convenio', estado: 'pendiente',
        cliente_id: uid, email: email || null, zona_preferida: universidad || null,
        comentario, origen: 'convenio',
      }).select('id').single();
      if (error) throw error;
      await despacharWebhook(sb, {
        tipo: 'convenio', web_id: creada.id, nombre, telefono, email,
        universidad, cargo: String(p.cargo || '').trim(), personas, comentario, creado_at: nowISO,
      });
      return new Response(JSON.stringify({ ok: true, web_id: creada.id }), { headers: cors });
    }

    // ── cancelar (el cliente baja su reserva; o el admin a su nombre) ──
    if (accion === 'cancelar') {
      if (!uid) return new Response(JSON.stringify({ error: 'Inicia sesión para cancelar.' }), { status: 401, headers: cors });
      const webId = parseInt(body.payload?.web_id);
      if (!webId) return new Response(JSON.stringify({ error: 'Falta web_id' }), { status: 400, headers: cors });
      const { data: r } = await sb.from('reservas').select('*').eq('id', webId).maybeSingle();
      if (!r) return new Response(JSON.stringify({ error: 'Reserva no encontrada.' }), { status: 404, headers: cors });
      // El dueño (con cuenta) o un admin (a nombre del cliente que llamó/escribió)
      const esDuenio = !!r.cliente_id && r.cliente_id === uid;
      if (!esDuenio && rol !== 'admin') return new Response(JSON.stringify({ error: 'No puedes cancelar esta reserva.' }), { status: 403, headers: cors });
      if (['cancelada', 'rechazada'].includes(r.estado)) return new Response(JSON.stringify({ ok: true, ya: true }), { headers: cors });
      await sb.from('reservas').update({ estado: 'cancelada', updated_at: nowISO }).eq('id', webId);
      // Decisión 12: SIEMPRE se avisa, incluso si estaba confirmada
      await despacharWebhook(sb, {
        tipo: 'actualizacion', web_id: webId,
        tipo_original: r.tipo === 'cumpleanos' ? 'cumpleanos' : 'reserva',
        cambio: 'cancelada_por_cliente', detalle: { personas: r.personas },
        actualizado_at: nowISO,
      });
      return new Response(JSON.stringify({ ok: true }), { headers: cors });
    }

    // ── crear_lista_abierta (rrpp/admin): lista abierta + link público ──
    if (accion === 'crear_lista_abierta') {
      if (!uid || !['rrpp', 'admin'].includes(rol)) return new Response(JSON.stringify({ error: 'Solo cuentas RRPP o admin.' }), { status: 403, headers: cors });
      const p = body.payload || {};
      const nombre = String(p.nombre || '').trim();
      const fecha = String(p.fecha || '').trim();
      if (!nombre || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return new Response(JSON.stringify({ error: 'Nombre y fecha (YYYY-MM-DD) son obligatorios.' }), { status: 400, headers: cors });
      let codigo = String(p.codigo || '').trim().toUpperCase().replace(/[^A-Z0-9\-]/g, '');
      if (!codigo) codigo = 'L' + Math.random().toString(36).slice(2, 7).toUpperCase();
      const { data: ex } = await sb.from('listas').select('id').eq('codigo', codigo).maybeSingle();
      if (ex) return new Response(JSON.stringify({ error: 'Ese código ya existe, prueba otro.' }), { status: 409, headers: cors });
      const genero = String(p.genero_esperado || '').trim().toUpperCase().slice(0, 1) || null;
      const condiciones = (p.condiciones && typeof p.condiciones === 'object') ? p.condiciones : null;

      // 👤 EL DUEÑO DE LA LISTA NO ES SIEMPRE QUIEN LA CREA.
      //    Pablo arma el jueves entero de una vez y cada lista tiene que
      //    quedar de SU embajadora. Antes acá decía `duenio_id: uid` fijo,
      //    así que las seis listas del jueves nacían de @nanook aunque la
      //    plantilla dijera "EMBAJADORA COTTY" — y como el pago por RRPP
      //    resuelve `coalesce(duenio_id, rrpp_cuenta_de_texto(duenio_nombre))`,
      //    el duenio_id del admin TAPABA el texto y los $500 por persona
      //    escaneada se le contaban al admin.
      //    Solo un admin puede poner a otra persona; un RRPP siempre es
      //    dueño de lo suyo, no puede regalarle una lista a un tercero.
      // 👥 QUIÉN INVITA ≠ QUIÉN LA TRABAJÓ.
      //    En un cumpleaños el invitado tiene que leer «Te invita · Tasnim»
      //    (lista.html:272 lo muestra), pero el informe de pagos tiene que
      //    atribuírsela al ANFITRIÓN que la atendió. Son dos campos distintos
      //    y hasta ahora se usaba uno solo para las dos cosas.
      const inviterTxt = String(p.inviter_nombre || '').trim();
      const duenioTxt = String(p.duenio_nombre || '').trim();
      let duenioId = uid;
      let duenioAviso: string | null = null;
      if (rol === 'admin' && duenioTxt) {
        const { data: resuelto, error: eRes } = await sb.rpc('rrpp_cuenta_de_texto', { p_txt: duenioTxt });
        if (eRes) {
          // La función no está en la base (SQL sin correr) o falló. NO se
          // puede resolver, así que se queda el comportamiento viejo en vez
          // de dejar TODAS las listas huérfanas de golpe.
          duenioAviso = null;
        } else if (resuelto) {
          duenioId = resuelto as string;
        } else {
          // El texto no calza con ninguna cuenta: la lista NO queda a nombre
          // del admin. Queda sin cuenta y el reporte de pago la resuelve por
          // el texto. Mentir con el uid del admin es peor: le sumaría al
          // admin plata que le toca a otra persona.
          duenioId = null as unknown as string;
          duenioAviso = duenioTxt;
        }
      }

      // Zona (DÓNDE va) y regalía (QUÉ trae) van separadas: alguien puede
      // tener descuento Y ser VIP Fuego. Si la base todavía no tiene las
      // columnas, se reintenta sin ellas antes que dejar la lista sin crear.
      const fila: Record<string, unknown> = {
        nombre, fecha, evento_id: parseInt(p.evento_id) || null, codigo,
        duenio_id: duenioId, duenio_nombre: duenioTxt || null,
        inviter_nombre: inviterTxt || null,
        genero_esperado: genero, condiciones, tipo: 'cortesia',
        cupos: parseInt(p.cupos) || null,
        origen: rol === 'rrpp' ? 'rrpp_link' : 'admin_link',
      };
      // 🔒 CANDADO: la lista de un RRPP nace PENDIENTE y sus QR no salen hasta
      //    que un admin la apruebe. Antes nacía 'aprobada' y se emitía sin que
      //    nadie mirara. Un admin, o un RRPP marcado de confianza, se lo salta.
      let confianza = false;
      if (rol === 'rrpp') {
        // ⚠️ supabase-js NO lanza cuando falta la columna: devuelve { data:null,
        //    error }. El try/catch de antes nunca se activaba y todas las listas
        //    caían a `pendiente` aunque el SQL no estuviera corrido. Hay que
        //    mirar el `error` a mano.
        const { data: c, error: eC } = await sb.from('clientes').select('rrpp_confianza').eq('id', uid).maybeSingle();
        if (eC && /column|schema cache|rrpp_confianza/i.test(String(eC.message || ''))) {
          confianza = true;            // sin la columna → comportamiento viejo: emite
        } else {
          confianza = !!(c && c.rrpp_confianza);
        }
      }
      // Se escribe el EJE de revisión, no solo `estado`. El trigger de la base
      // mantiene `estado` en sincronía para el código viejo. Así cerrar la
      // lista después NO borra la aprobación: son campos distintos.
      const _aprob = (rol === 'admin' || confianza);
      fila.estado   = _aprob ? 'aprobada' : 'pendiente';
      fila.revision = _aprob ? 'aprobada' : 'pendiente';
      fila.inscripcion = 'abierta';
      if (p.zona_id)          fila.zona_id          = parseInt(String(p.zona_id)) || null;
      if (p.descuento_monto)  fila.descuento_monto  = parseInt(String(p.descuento_monto)) || 0;
      if (p.cover_amount)     fila.cover_amount     = parseInt(String(p.cover_amount)) || 0;
      // Reparto mixto ("10 cupos: 4 VIP y 6 general"), hora de corte y la
      // descripción que lee el invitado en el link.
      if (Array.isArray(p.cupos_zonas) && p.cupos_zonas.length) fila.cupos_zonas = p.cupos_zonas;
      if (p.hora_max_llegada) fila.hora_max_llegada = String(p.hora_max_llegada).slice(0, 5);
      if (p.benefit_text)     fila.benefit_text     = String(p.benefit_text).slice(0, 500);

      let { data: lista, error } = await sb.from('listas').insert(fila).select('id,codigo').single();
      // Si la base todavía no tiene alguna de estas columnas, se reintenta sin
      // ellas: antes perder un campo que dejar la lista sin crear.
      if (error && /zona_id|descuento_monto|cover_amount|cupos_zonas|hora_max_llegada|benefit_text|revision|inscripcion|column|schema cache/i.test(String(error.message || ''))) {
        delete fila.zona_id; delete fila.descuento_monto; delete fila.cover_amount;
        delete fila.cupos_zonas; delete fila.hora_max_llegada; delete fila.benefit_text;
        // Los ejes nuevos: si el SQL no está corrido, se cae de vuelta a `estado`
        // y todo funciona como antes. Nunca dejar la lista sin crear por esto.
        delete fila.revision; delete fila.inscripcion;
        ({ data: lista, error } = await sb.from('listas').insert(fila).select('id,codigo').single());
      }
      if (error) throw error;
      if (!lista) throw new Error('No se pudo crear la lista');
      return new Response(JSON.stringify({ ok: true, lista_web_id: lista.id, codigo: lista.codigo,
        estado: fila.estado, pendiente: fila.estado === 'pendiente',
        // `duenio_sin_cuenta` viaja para que el admin vea al tiro a quién le
        // puso un nombre que no existe como cuenta. La lista igual se crea:
        // funciona para la puerta, pero a esa persona no se le puede pagar
        // automático hasta que tenga cuenta.
        duenio_sin_cuenta: duenioAviso,
        link: 'https://www.frate.cl/lista/' + lista.codigo }), { headers: cors });
    }

    // ── editar_lista (rrpp/admin): edita SU propia lista (admin cualquiera). FRATE PASE. ──
    if (accion === 'editar_lista') {
      if (!uid || !['rrpp', 'admin'].includes(rol)) return new Response(JSON.stringify({ error: 'Solo cuentas RRPP o admin.' }), { status: 403, headers: cors });
      const p = body.payload || {};
      const listaId = parseInt(p.lista_id);
      if (!listaId) return new Response(JSON.stringify({ error: 'Falta lista_id' }), { status: 400, headers: cors });
      const { data: lista } = await sb.from('listas').select('id,duenio_id').eq('id', listaId).maybeSingle();
      if (!lista) return new Response(JSON.stringify({ error: 'Lista no encontrada.' }), { status: 404, headers: cors });
      if (rol === 'rrpp' && lista.duenio_id !== uid) return new Response(JSON.stringify({ error: 'No puedes editar una lista que no es tuya.' }), { status: 403, headers: cors });
      const patch: Record<string, unknown> = {};
      if (p.nombre != null && String(p.nombre).trim()) patch.nombre = String(p.nombre).trim();
      if (p.cupos != null) patch.cupos = parseInt(p.cupos) || null;
      // Si la lista muestra o no su contador en el link público. Nace apagado:
      // una cortesía no debe decirle a nadie cuánto queda.
      if (p.mostrar_cupos != null) patch.mostrar_cupos = !!p.mostrar_cupos;
      if (p.evento_id != null) patch.evento_id = parseInt(p.evento_id) || null;
      if (p.condiciones && typeof p.condiciones === 'object') patch.condiciones = p.condiciones;
      if (p.genero_esperado != null) patch.genero_esperado = String(p.genero_esperado).trim().toUpperCase().slice(0, 1) || null;
      if (p.estado != null && ['aprobada', 'pausada', 'rechazada'].includes(String(p.estado))) patch.estado = String(p.estado);
      if (!Object.keys(patch).length) return new Response(JSON.stringify({ error: 'Nada que actualizar.' }), { status: 400, headers: cors });
      const { data: upd, error } = await sb.from('listas').update(patch).eq('id', listaId).select('id,nombre,cupos,estado,codigo').single();
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, lista: upd }), { headers: cors });
    }

    // ── emitir_lista (rrpp/admin): aprueba pendientes + emite QR con condiciones ──
    if (accion === 'emitir_lista') {
      if (!uid || !['rrpp', 'admin'].includes(rol)) return new Response(JSON.stringify({ error: 'Solo cuentas RRPP o admin.' }), { status: 403, headers: cors });
      const p = body.payload || {};
      const listaId = parseInt(p.lista_id);
      if (!listaId) return new Response(JSON.stringify({ error: 'Falta lista_id' }), { status: 400, headers: cors });
      const { data: lista } = await sb.from('listas').select('*').eq('id', listaId).maybeSingle();
      if (!lista) return new Response(JSON.stringify({ error: 'Lista no encontrada.' }), { status: 404, headers: cors });
      if (rol === 'rrpp' && lista.duenio_id !== uid) return new Response(JSON.stringify({ error: 'No puedes emitir sobre una lista que no es tuya.' }), { status: 403, headers: cors });
      const ids = Array.isArray(p.inscrito_ids) ? p.inscrito_ids.map((x: any) => parseInt(x)).filter(Boolean).slice(0, 500) : null;
      let q = sb.from('lista_inscritos').select('*').eq('lista_id', listaId).eq('estado', 'pendiente');
      if (ids && ids.length) q = q.in('id', ids);
      const { data: pend } = await q;
      const emitidos: any[] = [];
      for (const insc of (pend || [])) {
        if (insc.estado === 'aprobado' && Array.isArray(insc.qr_ids) && insc.qr_ids.length) { emitidos.push({ web_id: insc.id, nombre: insc.nombre, qr_ids: insc.qr_ids, idempotente: true }); continue; }
        // RUT opcional: emite igual sin RUT (se marca; en la puerta se valida por nombre)
        try {
          const cort = await generarCortesia(sb, {
            nombre: insc.nombre, rut: insc.rut || '', email: insc.email,
            eventoId: lista.evento_id, fecha: lista.fecha,
            etiqueta: 'Lista: ' + lista.nombre, cantidad: 1 + (insc.acompanantes || 0),
            condiciones: lista.condiciones,
          });
          await sb.from('lista_inscritos').update({ estado: 'aprobado', pedido_cortesia_id: cort.pedidoId, qr_ids: cort.qrIds, updated_at: nowISO }).eq('id', insc.id);
          emitidos.push({ web_id: insc.id, nombre: insc.nombre, qr_ids: cort.qrIds, sin_rut: !insc.rut });
        } catch (e) { emitidos.push({ web_id: insc.id, nombre: insc.nombre, error: String((e as any)?.message || e) }); }
      }
      return new Response(JSON.stringify({ ok: true, emitidos, total: emitidos.filter((x: any) => x.qr_ids).length }), { headers: cors });
    }

    return new Response(JSON.stringify({ error: 'Acción desconocida' }), { status: 400, headers: cors });

  } catch (err) {
    console.error('[crm-solicitud]', err);
    return new Response(JSON.stringify({ error: String((err as any)?.message || err) }), { status: 500, headers: cors });
  }
});
