// ============================================================
// FRATE — CRM compartido: envío de webhooks al ERP + cola
// Contrato: ARQUITECTURA-CRM-WEB.md + RESPUESTAS-CRM-ERP.md
// ============================================================

export const ERP_WEBHOOK_URL = 'https://erp.frate.cl/api/crm-webhook';

// Envía uno o varios payloads al ERP. Reintenta en línea (2s, 8s).
// Devuelve true si el ERP respondió 2xx.
export async function enviarWebhookERP(
  payloads: unknown,
  opts: { oirRechazos?: boolean } = {},
): Promise<{ ok: boolean; status?: number; error?: string; ignorados?: number; total?: number; rechazados?: any[]; reintentable?: boolean }> {
  const key = Deno.env.get('CRM_WEBHOOK_KEY');
  if (!key) return { ok: false, error: 'sin_llave' };   // el dueño aún no instala la llave → a la cola
  const body = JSON.stringify(payloads);
  const esperas = [0, 2000, 8000];
  let ultimo = '';
  for (let i = 0; i < esperas.length; i++) {
    if (esperas[i]) await new Promise(r => setTimeout(r, esperas[i]));
    try {
      const r = await fetch(ERP_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key },
        body,
        signal: AbortSignal.timeout(10000),
      });
      if (r.ok) {
        // ⚠️ 200 NO significa «lo procesaron». El ERP responde 200 con
        //    `{ignorado:true}` para los tipos que su switch todavía no maneja
        //    —así les llegó `disposicion` durante días sin que nadie lo supiera—.
        //    Desde acá se veía como entregado. Un no-op silencioso es la misma
        //    familia de bug que perseguimos todo el día: el sistema afirma algo
        //    que nadie verificó.
        //    `ignorado` era el único caso que mirábamos. El 18-oct-2026 el ERP
        //    agregó `colision:true` para cuando (tipo, web_id) apunta a DOS
        //    fichas reales —y con razón se niega a fusionarlas solo—. Si solo
        //    contamos `ignorado`, una colisión entra como entregada y se pierde
        //    igual que se perdió `disposicion`. Así que ahora se escucha
        //    CUALQUIER `ok:false` por ítem, no una lista de casos conocidos:
        //    lo que el ERP agregue mañana se oye sin tocar este archivo.
        let ignorados = 0, total = 0;
        let rechazados: any[] = [];
        try {
          const body = await r.clone().json();
          const arr = Array.isArray(body) ? body : (Array.isArray(body?.resultados) ? body.resultados : [body]);
          total = arr.length;
          ignorados = arr.filter((x: any) => x && (x.ignorado === true || x.ignored === true)).length;
          rechazados = arr.filter((x: any) => x && x.ok === false);
        } catch (_) { /* respuesta sin JSON → se toma como entregada, como antes */ }
        if (ignorados) {
          console.warn(`[crm] el ERP IGNORÓ ${ignorados}/${total} — tipo(s) que su lado todavía no procesa`);
        }
        // El grito va SIEMPRE: es observabilidad, no cambia el comportamiento de nadie.
        for (const x of rechazados) {
          const motivo = x.colision === true
            ? `COLISIÓN — (${x.tipo ?? '?'}, ${x.web_id ?? '?'}) apunta a dos fichas distintas en el ERP`
            : String(x.error || x.motivo || 'sin motivo');
          console.error(`[crm] el ERP RECHAZÓ web_id=${x.web_id ?? '?'} — ${motivo}`);
        }
        // ⚠️ El VALOR DE RETORNO solo cambia si el llamador lo pidió.
        //    Motivo: `sync-erp` escribe `erp_sync_log` cuando esto da ok:true, y
        //    NO lo escribe cuando da ok:false. Si un rechazo le llegara como
        //    ok:false, ninguno de los 50 del lote quedaría registrado y el lote
        //    entero se reenviaría cada 5 minutos para siempre — sobre el camino
        //    de la puerta, en vivo. Arreglar eso pide registrar por ítem, que es
        //    otro cambio y va aparte. Hasta entonces `sync-erp` conserva su
        //    semántica exacta y solo gana el grito de arriba.
        if (opts.oirRechazos && rechazados.length) {
          return {
            ok: false, status: r.status,
            total: total || undefined,
            ignorados: ignorados || undefined,
            rechazados,
            error: 'rechazado_por_el_erp',
            reintentable: false,   // es una decisión del ERP, no una caída: reintentar no la cambia
          };
        }
        return { ok: true, status: r.status, ignorados: ignorados || undefined, total: total || undefined };
      }
      ultimo = 'HTTP ' + r.status;
      if (r.status >= 400 && r.status < 500 && r.status !== 429) {
        // 4xx (salvo 429) = no reintentar: malformado o llave mala
        return { ok: false, status: r.status, error: ultimo };
      }
    } catch (e) { ultimo = String((e as any)?.message || e); }
  }
  return { ok: false, error: ultimo || 'sin_respuesta' };
}

// Encola un payload que no se pudo entregar (lo drena crm-reintentos + cron).
// `estado` por defecto es 'pendiente', que es lo único que `crm-reintentos`
// levanta (`.eq('estado','pendiente')`). Con 'rechazado' la fila queda
// REGISTRADA pero el drenador no la toca nunca: sirve para lo que el ERP
// rechazó a propósito, donde reintentar es puro ruido.
export async function encolarWebhook(sb: any, payload: unknown, error: string, estado = 'pendiente') {
  try {
    await sb.from('crm_webhooks_pendientes').insert({
      payload,
      intentos: 1,
      ultimo_error: error,
      estado,
      proximo_intento: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    });
  } catch (e) { console.error('[crm] encolar:', e); }
}

// Envía y, si falla, encola. Nunca lanza (no bloquea la creación).
export async function despacharWebhook(sb: any, payload: unknown) {
  // Los caminos de FICHA sí quieren oír un rechazo por ítem: acá es donde
  // puede llegar una colisión de (tipo, web_id).
  const r = await enviarWebhookERP(payload, { oirRechazos: true });
  if (!r.ok) {
    // Un rechazo del ERP no es una caída: reintentarlo 10 veces (5m→15m→45m→2h)
    // no lo arregla y además tapa la cola. Se registra como 'rechazado' para
    // que quede rastro, y el drenador lo ignora por diseño.
    const definitivo = r.reintentable === false;
    await encolarWebhook(
      sb, payload,
      definitivo ? (r.rechazados?.[0]?.colision ? 'colision_erp' : (r.error || 'rechazado_por_el_erp')) : (r.error || 'error'),
      definitivo ? 'rechazado' : 'pendiente',
    );
  }
  return r.ok;
}

// ============================================================
// FORMULARIOS (cumpleaños / reservas) → contrato del ERP
//
// ⚠️ UN SOLO MAPEO, acá. Antes esto no existía: `form-submit` escribía en
// `formularios` y NUNCA avisaba al ERP, así que todo el Centro de Cumpleaños
// vivía solo en la web. Si el mapeo se duplica, los dos lados se separan.
//
// REPARTO DE DUEÑOS (acordado con el ERP, 2026-07-31):
//   · La WEB manda: datos del cliente, la plata y la etapa comercial.
//   · El ERP manda: el checklist de coordinación (torta, decoración, fotos…).
//   · Los campos de este payload se envían SOLO si tienen valor. Un campo
//     vacío en la web NO viaja, para que un reenvío nunca borre lo que el
//     equipo escribió en el ERP.
// ============================================================

// Etapas: la web usa `sin_disp`, el ERP `sin_disponibilidad`. El resto calza.
const ETAPA_ERP: Record<string, string> = {
  nuevo: 'nuevo', contactado: 'contactado', confirmado: 'confirmado',
  realizado: 'realizado', no_realizado: 'no_realizado',
  sin_info: 'sin_info', sin_disp: 'sin_disponibilidad',
  cerrado: 'realizado',   // valor viejo del check original de la tabla
};
// Pago: la web usa `sin_pago` y el vacío; el ERP `sin_cobro` y `pendiente`.
const PAGO_ERP: Record<string, string> = {
  pagado: 'pagado', abonado: 'abonado', sin_pago: 'sin_cobro', '': 'pendiente',
};

const _num = (v: unknown): number | null => {
  const n = parseInt(String(v ?? '').replace(/[^0-9-]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
};
const _txt = (v: unknown): string | null => {
  const s = String(v ?? '').trim();
  return s || null;
};
const _bool = (v: unknown): boolean | null =>
  v === true || v === false ? v : (v === 'si' || v === 'sí' ? true : v === 'no' ? false : null);

/** Convierte una fila de `formularios` al contrato del ERP.
 *  Devuelve null si ese tipo no le interesa al ERP (p. ej. `frecuente`). */
export function formularioAPayloadERP(f: any): Record<string, unknown> | null {
  const tipo = f?.tipo === 'cumple' ? 'cumpleanos' : f?.tipo === 'reserva' ? 'reserva' : null;
  if (!tipo) return null;                       // 'frecuente' no es una noche: no viaja

  const d = f.datos || {};
  const g = f.gestion || {};

  // La fecha de la noche vive en `datos` con tres nombres según el formulario.
  const fecha = _txt(d.fecha_celebrar) || _txt(d.fecha) || _txt(d.fecha_evento);

  const p: Record<string, unknown> = {
    tipo,
    web_id: f.id,
    fecha,
    nombre: _txt(f.nombre) || _txt(d.nombre),
    // `personas` = lo que PIDIÓ el cliente. `invitados_aprobados` = lo que
    // aprobó la anfitriona, que es lo que manda para los cupos de la puerta.
    personas: _num(d.invitados ?? d.personas),
    invitados_aprobados: _num(g.invitados),
    telefono: _txt(f.telefono) || _txt(d.whatsapp) || _txt(d.telefono),
    email: _txt(f.email) || _txt(d.email) || _txt(d.correo),
    instagram: _txt(f.instagram) || _txt(d.instagram) || _txt(d.gestor_instagram),
    fecha_nacimiento: _txt(d.fecha_nac) || _txt(d.fecha_nacimiento),
    presupuesto: _num(d.presupuesto),
    zona_preferida: _txt(d.zona_preferida) || _txt(d.zona) || _txt(d.sector),
    comentario: _txt(d.mensaje) || _txt(d.comentario) || _txt(d.comentarios),
    // Quién organiza del lado del cliente (la amiga que arma la sorpresa).
    // Distinto de `responsable`, que es quién lo gestiona del lado de FRATE.
    gestor: _txt(d.gestor) || _txt(d.quien_agenda),
    gestor_instagram: _txt(d.gestor_instagram),
    ocasion: _txt(d.ocasion),
    // ⚠️ `educacion_superior` es la pregunta Sí/No, NO el nombre. El nombre
    //    vive en `institucion`. Mandar el "Sí" como institución llenaba la
    //    ficha del ERP con basura.
    institucion: _txt(d.institucion) || _txt(d.universidad),
    estudia: _bool(d.educacion_superior),
    estado: _txt(f.estado),
    etapa: ETAPA_ERP[String(f.estado || '')] || null,
    // ── la plata: la manda la web y el ERP no la recalcula ──
    monto_pagado: _num(g.monto),
    monto_total: _num(g.monto_total),
    estado_pago: PAGO_ERP[String(g.pago ?? '')] ?? 'pendiente',
    paquete: _txt(g.paquete),
    responsable: _txt(g.responsable),
    // Disposición guardaba `zona` y este puente mandaba `mesa`: por eso el ERP
    // veía «sin mesa» en todas. Se leen las dos, sin migrar nada.
    mesa_asignada: _txt(g.mesa) || _txt(g.zona),
    // Los 4 campos del acuerdo: quién la puso, cuándo, y qué había antes.
    // Sin esto, un cambio se descubre comparando; con esto, se ve.
    mesa_origen: _txt(g.mesa_origen) || (g.mesa || g.zona ? 'web' : null),
    mesa_cambiada_at: _txt(g.mesa_cambiada_at),
    mesa_anterior: _txt(g.mesa_anterior),
    mesa_motivo: _txt(g.mesa_motivo),
    actualizado_at: f.updated_at || null,
  };
  if (tipo === 'cumpleanos') {
    p.quiere_decoracion = _bool(d.quiere_decoracion ?? d.decoracion);
    p.quiere_mesa       = _bool(d.quiere_mesa ?? d.mesa);
    p.quiere_botellas   = _bool(d.quiere_botellas ?? d.botellas);
  } else {
    p.consumo_minimo_ofrecido = _num(d.consumo_minimo_ofrecido ?? g.consumo_minimo);
  }

  // ⚠️ DOS REGLAS DISTINTAS, Y CONFUNDIRLAS CUESTA PLATA.
  //
  // (a) Los campos de COORDINACIÓN (mesa, notas, lo que el equipo llena en el
  //     ERP durante la semana): un vacío NO viaja. Así un reenvío nuestro
  //     nunca borra lo que ellos escribieron. Es la regla 2 que pidieron.
  //
  // (b) Los campos que la WEB POSEE —la plata y la etapa— viajan SIEMPRE,
  //     aunque estén vacíos, y viajan como `null` explícito.
  //     Acá no hay trabajo del ERP que proteger: el dueño somos nosotros.
  //     Si el equipo BORRA un monto acordado y nosotros no mandamos nada, el
  //     ERP se queda con el viejo para siempre y nadie se entera. Ese es
  //     exactamente el bug que a ellos les devolvió $670.000 tres veces,
  //     apuntando en la otra dirección.
  //
  //     Y hay una diferencia real entre «no hay acuerdo» y «el acuerdo es 0»:
  //     `null` es lo primero. Nunca mandamos '' — `_num` solo devuelve número
  //     o null, así que la ambigüedad que temen no puede llegar a existir.
  const SIEMPRE_VIAJAN = new Set([
    'monto_pagado', 'monto_total', 'estado_pago', 'invitados_aprobados', 'etapa', 'estado',
  ]);
  for (const k of Object.keys(p)) {
    if (SIEMPRE_VIAJAN.has(k)) { if (p[k] === undefined || p[k] === '') p[k] = null; continue; }
    if (p[k] === null || p[k] === undefined || p[k] === '') delete p[k];
  }
  // Y si el mapeo ni siquiera los generó, van igual en null: la ausencia de un
  // campo de plata no puede significar «no cambió».
  for (const k of SIEMPRE_VIAJAN) if (!(k in p)) p[k] = null;

  p.tipo = tipo; p.web_id = f.id;   // estos dos siempre van: son la llave
  return p;
}

// ============================================================
// LA DISPOSICIÓN → ERP
//
// Acordado el 2026-07-31: **el plano lo manda la WEB, el ERP lo lee.**
// Antes había dos editores para el mismo mapa (la web pegaba el JSON que le
// pasaban del ERP) y nadie sabía cuál mandaba.
//
// Se manda el plano CON la ocupación de esa noche: no solo qué zonas hay, sino
// quién está en cada una. Sin eso el ERP tiene el dibujo pero no sabe usarlo.
// ============================================================

export function planoAPayloadERP(
  plano: any, fecha: string, ocupacion: Array<{ zona: string; nombre: string; tipo: string; personas: number }>,
): Record<string, unknown> {
  const esp = (plano && plano.espacios) || [];
  // El escenario, las barras y las paredes no llevan invitados: no cuentan al aforo.
  const conGente = esp.filter((e: any) => e.tipo === 'mesa' || e.tipo === 'zona');
  const porZona: Record<string, { personas: number; fichas: unknown[] }> = {};
  for (const o of (ocupacion || [])) {
    const k = String(o.zona || '').trim();
    if (!k) continue;
    porZona[k] = porZona[k] || { personas: 0, fichas: [] };
    porZona[k].personas += Number(o.personas) || 0;
    porZona[k].fichas.push({ nombre: o.nombre, tipo: o.tipo, personas: o.personas });
  }
  const sinCap = conGente.filter((e: any) => !(parseInt(e.cap) || 0)).map((e: any) => e.nombre || e.tipo);
  return {
    tipo: 'disposicion',
    web_id: `plano-${fecha}`,          // llave de idempotencia: una por noche
    fecha,
    plano_nombre: plano?.nombre || null,
    ancho: Number(plano?.w) || null,
    alto: Number(plano?.h) || null,
    // El aforo solo se manda si TODAS las zonas tienen capacidad. Un total
    // parcial lleva al ERP a decir «lleno» cuando no lo está.
    aforo_total: sinCap.length ? null : conGente.reduce((a: number, e: any) => a + (parseInt(e.cap) || 0), 0),
    aforo_incompleto: sinCap.length ? sinCap : undefined,
    espacios: esp.map((e: any) => ({
      nombre: e.nombre || null, tipo: e.tipo || null, forma: e.forma || 'rect',
      x: e.x ?? null, y: e.y ?? null, w: e.w ?? null, h: e.h ?? null,
      color: e.color || null, capacidad: parseInt(e.cap) || null, precio: parseInt(e.precio) || null,
      elegible_por_cliente: !!e.sel,
      // Ocupación de ESA noche: personas comprometidas y quiénes son.
      ocupado: (porZona[e.nombre] || {}).personas || 0,
      ocupantes: (porZona[e.nombre] || {}).fichas || [],
    })),
    sin_zona: (ocupacion || []).filter((o) => !String(o.zona || '').trim())
                               .map((o) => ({ nombre: o.nombre, tipo: o.tipo, personas: o.personas })),
  };
}
