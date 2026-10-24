// ============================================================
// FRATE — Edge Function: api-evento-ingest
// Recibe eventos desde apps externas (ej: la app de flyers y
// contenido) y los crea/actualiza en la web con sus tickets.
//
// Autenticación: header  x-api-key  con la clave ERP_API_KEY
// (la misma que usa el ERP para leer ventas).
//
// POST https://<proyecto>.supabase.co/functions/v1/api-evento-ingest
// {
//   "evento": {
//     "external_id": "flyer-123",        // opcional pero recomendado (para actualizar después)
//     "nombre": "NOCHE TRAP",            // obligatorio
//     "fecha": "2026-07-18",             // obligatorio (YYYY-MM-DD)
//     "hora": "23:00",
//     "ambiente": "Fuego",               // Fuego | Aire | Tierra
//     "descripcion": "...",
//     "djs": ["DJ UNO", "DJ DOS"],
//     "imagen_url": "https://...",       // flyer/foto pública
//     "video_url": "https://...",        // opcional — manda sobre la imagen
//     "link_colaborador": "https://...",
//     "activo": true                     // false = queda borrador (no se ve en frate.cl)
//   },
//   "tickets": [
//     { "ticket_uid": "flyer-123-ant", "nombre": "Anticipada", "precio": 5000, "cupo_total": 100, "estado": "Activo",
//       "venta_desde": "2026-10-10T00:00:00-03:00",   // opcional — abre la venta de este tramo
//       "venta_hasta": "2026-10-13T00:00:00-03:00",   // opcional — la cierra (NULL = siempre)
//       "incluye_cover": true, "cover_cc": 500 }      // opcional — cover incluido
//   ]
// }
//
// Upsert evento: por external_id si viene; si no, por (nombre + fecha).
// Tickets: match por ticket_uid (fallback nombre) dentro del evento.
//   NUNCA borra tipos existentes.
//
// BLINDAJE (contrato maestro R4/R5): el reimport SOLO toca borradores/
//   planificación. Un evento ya publicado / en vivo / con ventas se OMITE
//   (respuesta accion:'omitido') — jamás se sobre-escribe lo que se vende.
// STOCK (R33): `disponible` es el contador VIVO que baja la venta. Al crear
//   un ticket = cupo del brief (cupo_total|stock|disponible); al actualizar
//   NO se toca (reimportar mantiene lo ya vendido).
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.111.0';

Deno.serve(async (req: Request) => {
  const cors = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type, x-api-key',
    'Content-Type': 'application/json',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST')    return new Response(JSON.stringify({ error: 'Usa POST con JSON' }), { status: 405, headers: cors });

  try {
    const KEY  = Deno.env.get('ERP_API_KEY');
    const sent = req.headers.get('x-api-key') || '';
    if (!KEY || sent !== KEY) return new Response(JSON.stringify({ error: 'x-api-key inválida' }), { status: 401, headers: cors });

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { evento, tickets } = await req.json() as { evento: any; tickets?: any[] };
    if (!evento?.nombre || !evento?.fecha) throw new Error('evento.nombre y evento.fecha (YYYY-MM-DD) son obligatorios');

    // Helper: valor "no vacío" (para no borrar con vacío lo puesto a mano — R39).
    const nonEmpty = (v: unknown) => v != null && v !== '' && !(Array.isArray(v) && v.length === 0);

    // estado/activo: SOLO se cambian si el brief los trae EXPLÍCITOS (R4: el reimport toca brief, no operación).
    const estadosOK = ['creado', 'publicado', 'en_vivo'];
    const estadoExplicito = estadosOK.includes(evento.estado) ? (evento.estado as string) : null;
    const activoRaw = evento.activo;
    const activoExplicito = (activoRaw === undefined || activoRaw === null) ? null
      : !(activoRaw === false || activoRaw === 'false' || activoRaw === 0 || activoRaw === '0');  // coerción tolerante
    // ⚠️ Al CREAR: el default es BORRADOR. Publicar se pide EXPLÍCITO.
    //    Antes era al revés —un CREATE sin `estado` nacía publicado y a la venta— y eso
    //    convertía un dato faltante en una decisión irreversible tomada por nadie: lo
    //    encontró el ERP, cuyo puente `evento_web_id` puede apuntar a un id que ya no
    //    existe; entonces creen que la noche ya está acá, NO mandan el estado, y las tres
    //    noches de Halloween habrían salido a la venta tres semanas antes con todos sus
    //    cupos — reportadas como «creado ✓», y después protegidas del reimport por el
    //    blindaje de más abajo. El ERP verificó camino por camino que la inversión no les
    //    toca ningún flujo: con «Publicada» mandan estado explícito, con «En borrador»
    //    también. El único caso donde este default decidía era el accidente.
    const estadoCrear = estadoExplicito || (activoExplicito === true ? 'publicado' : 'creado');
    const activoCrear = estadoCrear !== 'creado';

    // ── Buscar existente: primero por external_id (event_uid canónico), después por (nombre, fecha)
    let existente: { id: number; estado?: string | null; activo?: boolean | null; brief?: any; hora_termino?: string | null } | null = null;
    if (evento.external_id) {
      const { data, error } = await sb.from('eventos').select('id, estado, activo, brief, hora_termino').eq('external_id', String(evento.external_id)).maybeSingle();
      if (error) throw error;   // no asumir "no existe" ante un fallo → evita crear un duplicado publicado
      existente = data;
    }
    if (!existente) {
      const { data, error } = await sb.from('eventos').select('id, estado, activo, brief, hora_termino').eq('nombre', evento.nombre).eq('fecha', evento.fecha).maybeSingle();
      if (error) throw error;
      existente = data;
    }

    // ── BLINDAJE (R4/R5): un evento que ya se está VENDIENDO no se toca por reimport.
    //    El brief solo puede modificar borradores/planificación. Protegido = activo, o
    //    estado publicado/en_vivo/finalizado/cerrado. Si está protegido → se OMITE (R8: sin fallar en silencio).
    const ESTADOS_PROTEGIDOS = ['publicado', 'en_vivo', 'finalizado', 'cerrado'];
    if (existente && (existente.activo === true || ESTADOS_PROTEGIDOS.includes(String(existente.estado || '').toLowerCase()))) {
      return new Response(JSON.stringify({
        ok: true,
        eventoId: existente.id,
        evento_id: existente.id,
        accion: 'omitido',
        motivo: 'evento en venta (publicado/en vivo) — el reimport no toca eventos con ventas activas',
        tickets: [],
      }), { headers: cors });
    }

    let eventoId: number;
    let accionEvento: string;
    if (existente) {
      // UPDATE (solo borradores): R39 — se escribe SOLO lo que viene con valor.
      // R4: estado/activo se tocan únicamente si el brief los trae EXPLÍCITOS; si no, se conserva el borrador.
      const rowUpd: Record<string, unknown> = {};
      if (estadoExplicito)              { rowUpd.estado = estadoExplicito; rowUpd.activo = estadoExplicito !== 'creado'; }
      else if (activoExplicito !== null) { rowUpd.activo = activoExplicito; rowUpd.estado = activoExplicito ? 'publicado' : 'creado'; }
      if (nonEmpty(evento.nombre))            rowUpd.nombre           = evento.nombre;
      if (nonEmpty(evento.fecha))             rowUpd.fecha            = evento.fecha;
      if (nonEmpty(evento.hora))              rowUpd.hora             = evento.hora;
      if (nonEmpty(evento.ambiente))          rowUpd.ambiente         = evento.ambiente;
      if (nonEmpty(evento.descripcion))       rowUpd.descripcion      = evento.descripcion;
      if (Array.isArray(evento.djs) && evento.djs.length) rowUpd.djs  = evento.djs;
      if (nonEmpty(evento.imagen_url))        rowUpd.imagen_url       = evento.imagen_url;
      if (nonEmpty(evento.video_url))         rowUpd.video_url        = evento.video_url;
      if (nonEmpty(evento.link_colaborador))  rowUpd.link_colaborador = evento.link_colaborador;
      if (nonEmpty(evento.hora_termino))      rowUpd.hora_termino     = evento.hora_termino;
      if (nonEmpty(evento.external_id))       rowUpd.external_id      = String(evento.external_id);
      if (nonEmpty(evento.video_youtube))     rowUpd.video_youtube    = String(evento.video_youtube);
      // ⚠️ brief jsonb: MERGE, NUNCA reemplazo. El admin guarda DENTRO de este jsonb
      //    tres cosas que pone un humano a mano: `especial` (el ⭐ de la portada),
      //    `color` y `encuadre` (admin.html:5792-5795). Reemplazar el jsonb entero las
      //    borraba en silencio y devolvía `accion:'actualizado'`, justo en el flujo que
      //    recomendamos —importar en borrador, corregir a mano, reimportar—: el reimport
      //    se comía la corrección. Es además la única excepción que tenía este UPDATE a
      //    la regla del resto de los campos (no pisar lo puesto a mano). Mismo criterio
      //    que ya usa el importador del admin (admin.html:5541-5548).
      if (nonEmpty(evento.brief)) {
        const prevBrief = (existente && (existente as any).brief) || {};
        const mezcla: Record<string, unknown> = { ...prevBrief, ...(evento.brief as any) };
        for (const k of ['encuadre', 'color', 'especial']) {
          if (prevBrief[k] !== undefined) mezcla[k] = prevBrief[k];
        }
        rowUpd.brief = mezcla;
      }
      const { error } = await sb.from('eventos').update(rowUpd).eq('id', existente.id);
      if (error) throw error;
      eventoId = existente.id; accionEvento = 'actualizado';
    } else {
      // CREATE: defaults completos (R39: los defaults SOLO al crear).
      const rowCrear: Record<string, unknown> = {
        nombre:           evento.nombre,
        fecha:            evento.fecha,
        hora:             evento.hora || '23:00',
        ambiente:         evento.ambiente || 'Fuego',
        descripcion:      evento.descripcion || '',
        djs:              Array.isArray(evento.djs) ? evento.djs : [],
        imagen_url:       evento.imagen_url || null,
        video_url:        evento.video_url || null,
        link_colaborador: evento.link_colaborador || null,
        estado: estadoCrear, activo: activoCrear,
      };
      if (nonEmpty(evento.hora_termino))   rowCrear.hora_termino  = evento.hora_termino;
      if (nonEmpty(evento.external_id))    rowCrear.external_id   = String(evento.external_id);
      if (nonEmpty(evento.video_youtube))  rowCrear.video_youtube = String(evento.video_youtube);  // FRATE FLYER: fondo YouTube
      if (nonEmpty(evento.brief))          rowCrear.brief         = evento.brief;                    // {cancion, caption, concurso, premio}
      const { data, error } = await sb.from('eventos').insert(rowCrear).select('id').single();
      if (error) throw error;
      eventoId = data.id; accionEvento = 'creado';
    }

    // ── Tickets: match por ticket_uid (R32), fallback a nombre. Nunca borra los demás.
    //    `disponible` es el CONTADOR VIVO (lo baja la venta): en CREATE = cupo del brief;
    //    en UPDATE NO se toca (R33/CA-16: reimportar mantiene lo ya vendido).
    const resTickets: any[] = [];
    for (const t of (tickets || [])) {
      if (!t?.nombre && !t?.ticket_uid) continue;
      const uid = (t.ticket_uid != null && t.ticket_uid !== '') ? String(t.ticket_uid) : null;

      // Buscar existente: por ticket_uid primero (si la columna existe), luego por nombre (legacy).
      // ⚠️ El respaldo por nombre SOLO corre cuando no se pudo buscar por uid (la columna
      // ticket_uid no existe en esa base). Si la búsqueda por uid funcionó y no encontró
      // nada, el ticket es NUEVO y punto: buscarlo por nombre fusionaría en una sola fila
      // los tramos que comparten nombre a propósito (PREV 1..4 de un mismo público), y los
      // tres últimos pisarían al primero dejando un solo precio y un solo cupo.
      let ex: { id: number } | null = null;
      let buscoPorUid = false;
      if (uid) {
        const { data, error } = await sb.from('tipos_ticket').select('id').eq('evento_id', eventoId).eq('ticket_uid', uid).maybeSingle();
        if (!error) { ex = data || null; buscoPorUid = true; }   // si la columna ticket_uid aún no existe, error → caemos a nombre
      }
      if (!ex && !buscoPorUid && nonEmpty(t.nombre)) {
        const { data } = await sb.from('tipos_ticket').select('id').eq('evento_id', eventoId).eq('nombre', t.nombre).maybeSingle();
        ex = data || null;
      }

      // Campos comunes con guarda no-vacío (R39). NUNCA se incluye `disponible` en update.
      // `solo_web` es un DEFAULT de creación, no un campo que el reimport imponga.
      // Escribirlo siempre devolvía a la venta web una entrada que alguien había sacado
      // a propósito (hoy hay 24 filas en false: RRPP, puerta, etc.). Se fija abajo, en
      // la rama de CREATE, junto al resto de los defaults.
      const row: any = { evento_id: eventoId };
      if (uid)                       row.ticket_uid     = uid;
      if (nonEmpty(t.nombre))        row.nombre         = t.nombre;
      if (t.precio != null)          row.precio         = Number(t.precio) || 0;
      if (nonEmpty(t.estado))        row.estado         = t.estado;
      if (t.max_por_compra != null)  row.max_por_compra = Number(t.max_por_compra) || 6;
      if (t.genero != null && t.genero !== '')           row.genero      = t.genero;
      if (t.catalogo_id != null)                         row.catalogo_id = t.catalogo_id;
      if (nonEmpty(t.descripcion))                       row.descripcion = t.descripcion;
      if (nonEmpty(t.instrucciones))                     row.instrucciones = t.instrucciones;
      // ⏰ R12 corregido: `hora_max_ingreso` y `vence_hora` NO aceptan lo mismo.
      //    · hora_max_ingreso admite "HH:MM" o "-60" (minutos antes del cierre). La
      //      puerta resuelve la forma relativa en validacion.html:606.
      //    · vence_hora es SIEMPRE hora de reloj: sus tres lectores la parten por ":"
      //      (crear-pago:174, comprar.html:238, links.html:123).
      //    Espejarla sin convertir metía "-60" en el campo de reloj, y entonces
      //    new Date(y, m-1, d, -60, 0) retrocede 60 h y el ajuste de madrugada suma 24:
      //    la venta quedaba cerrada DOS DÍAS ANTES del evento, y crear-pago:305 lo hacía
      //    cumplir con «venta cerrada (venció a las -60)». Ahora se convierte con la misma
      //    aritmética de la puerta, y si no se puede resolver NO se espeja: mejor sin
      //    tope de venta que con uno que la cierra antes de empezar.
      const aReloj = (v: unknown, fin: unknown): string | null => {
        const sv = String(v ?? '').trim();
        if (/^\d{1,2}:\d{2}$/.test(sv)) return sv;                     // ya es reloj
        const rel = /^-(\d+)$/.exec(sv);                               // "-60"
        if (!rel) return null;                                         // cualquier otra cosa: no se espeja
        const f = /^(\d{1,2}):(\d{2})$/.exec(String(fin ?? '').trim());
        if (!f) return null;                                           // sin hora de cierre no hay de qué restar
        const min = (((Number(f[1]) * 60 + Number(f[2])) - Number(rel[1])) % 1440 + 1440) % 1440;
        return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
      };
      const horaTope = nonEmpty(t.hora_max_ingreso) ? t.hora_max_ingreso : (nonEmpty(t.vence_hora) ? t.vence_hora : null);
      if (horaTope != null) {
        row.hora_max_ingreso = horaTope;                               // la puerta entiende las dos formas
        const finEv = nonEmpty(evento.hora_termino) ? evento.hora_termino : (existente?.hora_termino ?? null);
        const reloj = aReloj(horaTope, finEv);
        if (reloj) row.vence_hora = reloj;
      }

      // ⏳ VENTANA DE VENTA + 🥤 COVER (tramos de preventa, pedidos el 7-oct-2026).
      //    Cuatro campos ADITIVOS: si no vienen, la entrada se vende siempre, como hoy.
      //    Las fechas son instantes absolutos (ISO con offset, ej "2026-10-10T00:00:00-03:00")
      //    y se pasan tal cual: timestamptz guarda el mismo instante igual. Se valida que la
      //    fecha se pueda leer para no escribir basura; si no se puede, se ignora el campo.
      //    Con guarda no-vacío (R39) como el resto: reimportar sin estos campos NO los borra.
      //    FLYER manda los nombres canónicos; los alias camelCase son por si llega otra vía.
      const primero = (...claves: string[]) => { for (const k of claves) { const v = (t as any)[k]; if (v != null && v !== '') return v; } return null; };
      // Solo ISO-8601 (YYYY-MM-DD, con hora y offset opcionales). El filtro es a propósito
      // estricto y NO se deja en manos de `new Date()`: el parser de JS se traga cualquier
      // cosa — new Date('PREV 1') da 2001-01-01 y new Date('el sábado 10') da 2001-10-01.
      // Un venta_hasta en 2001 dejaría la entrada SIN VENDERSE NUNCA, y en silencio.
      // Lo ideal es que el brief traiga el offset (FLYER manda "...T00:00:00-03:00"); una
      // fecha pelada la resuelve Postgres en su propia zona.
      const ISO = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
      const instante = (v: unknown) => { const s = String(v ?? '').trim(); return (ISO.test(s) && !isNaN(+new Date(s))) ? s : null; };
      const vDesde = instante(primero('venta_desde', 'ventaDesde', 'venta_inicio'));
      const vHasta = instante(primero('venta_hasta', 'ventaHasta', 'venta_fin'));
      if (vDesde) row.venta_desde = vDesde;
      if (vHasta) row.venta_hasta = vHasta;
      const cover = primero('incluye_cover', 'incluyeCover', 'con_cover');
      if (cover != null) row.incluye_cover = (cover === true || cover === 'true' || cover === 1 || cover === '1');
      const cc = Number(primero('cover_cc', 'coverCc', 'coverCC')) || 0;
      if (cc > 0) row.cover_cc = Math.round(cc);   // 0 = no se declara la medida → no se escribe

      // Escritura resiliente: si una columna opcional aún no existe en la base, se saca del
      // payload y se reintenta. Antes aguantaba solo ticket_uid; ahora también los 4 campos
      // nuevos, para que el import NO se caiga si todavía no se corrió frate-ventana-venta-01.
      const OPCIONALES = ['ticket_uid', 'venta_desde', 'venta_hasta', 'incluye_cover', 'cover_cc', 'tope'];
      // ⚠️ Quitar una columna y reintentar NO puede ser silencioso. Si la que se cae es
      //    `ticket_uid`, la búsqueda por uid también falló, se activa el respaldo por nombre
      //    y los tramos que comparten nombre a propósito COLAPSAN en una sola fila — y antes
      //    eso se devolvía como `accion:'creado'`, igual que un import sano. Por eso
      //    `sinLaQueFalta` ahora dice CUÁL quitó y `escribir` lo arrastra hasta la respuesta.
      const sinLaQueFalta = (payload: any, msg: string): { resto: any; falta: string } | null => {
        const falta = OPCIONALES.find(c => payload[c] !== undefined && new RegExp(`\\b${c}\\b`).test(msg || ''));
        if (!falta) return null;
        const resto = { ...payload }; delete resto[falta]; return { resto, falta };
      };
      const escribir = async (payload: any): Promise<{ id: number; quitados: string[] }> => {
        let p = payload;
        const quitados: string[] = [];
        for (let intento = 0; intento <= OPCIONALES.length; intento++) {
          if (ex) {
            const { error } = await sb.from('tipos_ticket').update(p).eq('id', ex.id);
            if (!error) return { id: ex.id, quitados };
            const menos = sinLaQueFalta(p, error.message || ''); if (!menos) throw error;
            quitados.push(menos.falta); p = menos.resto;
          } else {
            const { data, error } = await sb.from('tipos_ticket').insert(p).select('id').single();
            if (!error) return { id: data?.id as number, quitados };
            const menos = sinLaQueFalta(p, error.message || ''); if (!menos) throw error;
            quitados.push(menos.falta); p = menos.resto;
          }
        }
        throw new Error('No se pudo escribir el tipo de ticket: faltan columnas en la base.');
      };
      // El uid que se INFORMA es el que quedó escrito, no el que se intentó: si se cayó, va
      // null. Informar el intentado hacía que un validador cuidadoso diera por buenos 32 uid
      // que no existían en la base.
      const anotar = (r: { id: number; quitados: string[] }, accion: string) => resTickets.push({
        id: r.id, nombre: t.nombre,
        ticket_uid: r.quitados.includes('ticket_uid') ? null : uid,
        accion,
        ...(r.quitados.length ? { degradado: r.quitados } : {}),
      });

      if (ex) {
        anotar(await escribir(row), 'actualizado');   // UPDATE: sin tocar `disponible`.
      } else {
        // CREATE: defaults + disponible = cupo del brief (nada vendido aún).
        if (row.nombre == null)         row.nombre         = t.nombre || 'Entrada';
        if (row.estado == null)         row.estado         = 'Activo';
        if (row.precio == null)         row.precio         = Number(t.precio) || 0;
        if (row.max_por_compra == null) row.max_por_compra = 6;
        row.solo_web = true;
        // `tope` es el cupo de referencia; `disponible` es el contador que baja.
        // Sin `tope`, `stock_recalcular` ignora la fila —sólo toca las que lo
        // tienen— y la reconciliación automática queda ciega para todo lo que
        // entra por brief. Pasó el 9-oct: el contador de dos tramos se desvió
        // en uno y no había nada que lo corrigiera solo.
        row.disponible = Number(t.cupo_total ?? t.stock ?? t.disponible) || 0;
        row.tope       = row.disponible > 0 ? row.disponible : null;
        anotar(await escribir(row), 'creado');
      }
    }

    // `degradado` arriba = la unión sin repetir de lo que se cayó en cualquier ticket, para
    // que quien lee la respuesta lo vea sin recorrer 32 filas. Array y no booleano a propósito:
    // CUÁL columna faltó cambia la gravedad (ticket_uid = incidente, ventana = el precio no
    // sube, cover = dato de servicio). Sólo aparece si de verdad pasó algo.
    const degradado = [...new Set(resTickets.flatMap((t: any) => t.degradado || []))];
    return new Response(JSON.stringify({ ok: true, eventoId, evento_id: eventoId, accion: accionEvento, tickets: resTickets,
      ...(degradado.length ? { degradado } : {}) }), { headers: cors });

  } catch (err) {
    console.error('[api-evento-ingest]', err);
    return new Response(JSON.stringify({ error: String((err as any)?.message || err) }), { status: 500, headers: cors });
  }
});
