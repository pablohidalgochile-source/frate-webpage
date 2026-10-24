// ============================================================
// FRATE — Shared: generarCortesia
// Crea una cortesía nominativa (pedido $0 + item + QRs) con
// SNAPSHOT de condiciones en el QR. Usada por crm-solicitud
// (emitir_lista, web admin/rrpp). Misma forma que api-crm.
// ============================================================

// deno-lint-ignore no-explicit-any
export async function generarCortesia(sb: any, opts: {
  nombre: string; rut: string; email?: string; eventoId?: number | null;
  fecha: string; etiqueta: string; cantidad?: number; condiciones?: any;
  zonaId?: number | null;
}) {
  const cantidad = Math.max(1, Math.min(10, opts.cantidad || 1));
  let nombreEvento = opts.etiqueta;
  if (opts.eventoId) {
    const { data: ev } = await sb.from('eventos').select('nombre').eq('id', opts.eventoId).maybeSingle();
    if (ev?.nombre) nombreEvento = ev.nombre;
  }
  const { data: pedido, error: e1 } = await sb.from('pedidos').insert({
    cliente_id: null, nombre_cliente: opts.nombre, email_cliente: opts.email || null,
    estado: 'pagado', total: 0, fee_servicio: 0, total_pagado: 0,
    metodo_pago: 'cortesia', referencia_pago: 'CRM-WEB', fecha_pago: new Date().toISOString(),
  }).select('id').single();
  if (e1) throw e1;

  const personas = Array.from({ length: cantidad }, (_, i) =>
    (i === 0 ? { nombre: opts.nombre, rut: opts.rut } : { nombre: opts.nombre + ' +' + i, rut: '' }));
  const _rnd = () => crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase();
  const qrIds = Array.from({ length: cantidad }, (_, i) => `FCC-${pedido.id}-CRM-0-${i}-${_rnd()}`);

  // ⚠️ LA ZONA VIAJA CON LA ENTRADA. Antes `items_pedido.zona_id` quedaba en
  //    NULL SIEMPRE —100% de las 467 entradas de CELOSA— y por eso el ERP no
  //    podía cruzar el VIP contra las pulseras: lo único que había era el
  //    NOMBRE del ticket, que detecta 28 de 158.
  //    Se saca de la lista que originó la cortesía, o de las condiciones.
  const fila: Record<string, unknown> = {
    pedido_id: pedido.id, producto_tipo: 'ticket', evento_id: opts.eventoId || null,
    nombre_evento: nombreEvento, nombre_ticket: (opts.condiciones?.titulo) || opts.etiqueta, detalle: 'Fecha: ' + opts.fecha,
    cantidad, precio_unitario: 0, personas, qr_ids: qrIds, condiciones: opts.condiciones || null,
    nombre_asistente: opts.nombre, rut_asistente: opts.rut,
  };
  let zonaId: number | null = Number(opts.zonaId) || null;
  if (!zonaId && opts.condiciones) {
    // La lista guarda la zona en `condiciones.zona` (clave) desde frate-zonas.
    const clave = String((opts.condiciones as any).zona || '').trim();
    if (clave && clave !== 'general') {
      try {
        const { data: z } = await sb.from('zonas').select('id').eq('clave', clave).maybeSingle();
        if (z) zonaId = z.id;
      } catch (_) { /* sin tabla zonas → sigue en null, como antes */ }
    }
  }
  if (zonaId) fila.zona_id = zonaId;

  let { error: e2 } = await sb.from('items_pedido').insert(fila);
  // Si la columna no existe todavía, se guarda sin ella: mejor perder la zona
  // que dejar a alguien sin su entrada.
  if (e2 && /zona_id|column|schema cache/i.test(String(e2.message || ''))) {
    delete fila.zona_id;
    ({ error: e2 } = await sb.from('items_pedido').insert(fila));
  }
  if (e2) { await sb.from('pedidos').delete().eq('id', pedido.id); throw e2; }

  if (opts.email) {
    try {
      // deno-lint-ignore no-explicit-any
      const D: any = (globalThis as any).Deno;
      await fetch(`${D.env.get('SUPABASE_URL')}/functions/v1/send-receipt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${D.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
        body: JSON.stringify({ order: {
          id: 'FCC-' + String(pedido.id).padStart(6, '0'), pedidoId: pedido.id,
          items: [{ tipo: opts.etiqueta, nombre: nombreEvento, precio: 0, cantidad, personas, qr_ids: qrIds,
            condiciones: opts.condiciones || null, fecha: opts.fecha, eventoId: opts.eventoId || null }],
          comprador: { nombre: opts.nombre, email: opts.email }, total: 0, fecha: new Date().toISOString(),
        } }),
      });
    } catch (e) { console.error('[cortesia] receipt:', e); }
  }
  return { pedidoId: pedido.id, qrIds };
}
