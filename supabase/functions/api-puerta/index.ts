// ============================================================
// FRATE — api-puerta
// El POS registra a quien ENTRA PAGANDO EN LA PUERTA, con su
// carnet verificado. Hasta hoy ese número no existía en ninguna
// pantalla: la web sabía contar los ingresos de puerta pero nadie
// los escribía.
//
//   POST {evento_id, ref_venta, monto, metodo, persona{...}}
//
// 🔒 Solo server-a-server. La llave de estación va en Authorization
//    y NUNCA puede viajar al navegador. Acá se compara el HASH.
//
// ⚠️ El import va fijo en @2.111.0 a propósito: `@2` resuelve a la
//    2.112.1, que esm.sh no puede servir, y el deploy de CUALQUIER
//    función falla con «Module not found auth-js».
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.111.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: cors });

async function sha256(txt: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
const rnd = () => Math.random().toString(36).slice(2, 8).toUpperCase();

// Edad CONTRA LA FECHA DEL EVENTO, no contra hoy. Los eventos parten a las
// 23:00 y terminan a las 05:00, y cuentan como el día publicado: quien cumple
// 18 el sábado NO entra el viernes a las 23:30 aunque el reloj ya diga sábado.
function edadEn(nacISO: string, refISO: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(String(nacISO || ''))) return null;
  const [ay, am, ad] = String(nacISO).slice(0, 10).split('-').map(Number);
  const [by, bm, bd] = String(refISO).slice(0, 10).split('-').map(Number);
  let e = by - ay;
  if (bm < am || (bm === am && bd < ad)) e--;
  return e;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return j({ ok: false, error: 'metodo_no_permitido' }, 405);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    // ── La llave de estación ────────────────────────────────────
    const raw = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
    if (!raw.startsWith('pos_')) return j({ ok: false, error: 'sin_llave' }, 401);
    const { data: code } = await admin.rpc('pos_llave_code', { p_hash: await sha256(raw) });
    if (!code) return j({ ok: false, error: 'llave_invalida' }, 401);

    const b = await req.json().catch(() => ({}));
    const eventoId = parseInt(b?.evento_id) || 0;
    const refVenta = String(b?.ref_venta || '').trim();
    const monto    = Math.max(0, Math.round(Number(b?.monto) || 0));
    const metodo   = String(b?.metodo || 'efectivo').slice(0, 20);
    const p        = b?.persona || {};
    if (!eventoId || !refVenta) return j({ ok: false, error: 'falta_evento_o_ref' }, 400);

    // ── Idempotencia ────────────────────────────────────────────
    // `ref_venta` es la llave: un reintento del POS devuelve el mismo
    // resultado y NO crea un segundo ingreso ni un segundo QR.
    const marca = 'PUERTA-VIP';                       // la marca que la web ya lee
    const refGuardada = `${marca}|${refVenta}`;
    {
      const { data: ya } = await admin.from('pedidos')
        .select('id').eq('referencia_pago', refGuardada).maybeSingle();
      if (ya) return j({ ok: true, pedido_id: ya.id, duplicado: true });
    }

    // ── La edad manda ───────────────────────────────────────────
    const { data: ev } = await admin.from('eventos')
      .select('id,nombre,fecha').eq('id', eventoId).maybeSingle();
    if (!ev) return j({ ok: false, error: 'evento_no_existe' }, 404);

    const nac = String(p?.nacimiento || '').slice(0, 10) || null;
    const edad = nac ? edadEn(nac, String(ev.fecha)) : null;
    if (edad != null && edad < 18) {
      // Del menor NO se guarda identidad. Solo queda el intento, para que
      // Pablo sepa cuántos rebotó la puerta. Guardar el RUT de un menor
      // para no usarlo es lo peor de los dos mundos.
      // Se reusa el registro de rechazos que la puerta YA lleva (ebriedad,
      // carnet, vetado…). Sus columnas son qr_id · evento_id · nombre ·
      // motivo · nota · portero_id: no hay `caja` ni `edad` sueltas.
      // `nombre` y `qr_id` quedan vacíos A PROPÓSITO — del menor no se
      // guarda identidad; la edad va en la nota, que no identifica a nadie.
      await admin.from('puerta_rechazos').insert({
        evento_id: eventoId,
        motivo: 'menor_de_edad',
        nota: `${edad} años · POS ${code}`,
      }).then(() => {}, () => {});
      return j({ ok: false, error: 'menor_de_edad', edad }, 403);
    }

    const rut    = String(p?.rut || '').replace(/[^0-9kK]/g, '').toUpperCase();
    const nombre = String(p?.nombre || '').trim().slice(0, 120) || 'Ingreso en puerta';
    const origen = String(p?.origen || 'manual') === 'cedula' ? 'cedula' : 'manual';

    // ── El pedido ───────────────────────────────────────────────
    const filaPedido: any = {
      nombre_cliente:  nombre,
      estado:          'pagado',
      total:           monto,
      total_pagado:    monto,
      metodo_pago:     metodo,
      referencia_pago: refGuardada,
      fecha_pago:      new Date().toISOString(),
    };
    if (rut.length >= 7) filaPedido.rut_cliente = rut;

    let { data: pedido, error: ePed } = await admin.from('pedidos')
      .insert(filaPedido).select('id').single();
    if (ePed && /rut_cliente|fecha_pago|column/i.test(String(ePed.message || ''))) {
      delete filaPedido.rut_cliente; delete filaPedido.fecha_pago;
      ({ data: pedido, error: ePed } = await admin.from('pedidos')
        .insert(filaPedido).select('id').single());
    }
    if (ePed || !pedido) throw new Error(ePed?.message || 'no se pudo crear el pedido');

    // ── La entrada, con su QR ───────────────────────────────────
    // El QR existe aunque nadie lo escanee: es la unidad que la web cuenta
    // para el aforo. Sin él, esta persona no aparece en ningún total.
    const qr = `FCC-${pedido.id}-PUERTA-0-0-${rnd()}`;
    await admin.from('items_pedido').insert({
      pedido_id:        pedido.id,
      evento_id:        eventoId,
      nombre_evento:    ev.nombre,
      nombre_ticket:    'Ingreso en puerta',
      cantidad:         1,
      precio_unitario:  monto,
      personas:         [{ nombre, rut: rut || '' }],
      qr_ids:           [qr],
      nombre_asistente: nombre,
      rut_asistente:    rut || '',
    });

    // ── Ya está adentro ─────────────────────────────────────────
    // Pagó en la puerta y entró: se marca el ingreso en el mismo acto. Si
    // no, aparecería como «emitida y no llegó» y el aforo quedaría corto.
    await admin.from('qr_usados')
      .insert({ qr_id: qr, pedido_id: pedido.id })
      .then(() => {}, () => {});

    return j({ ok: true, pedido_id: pedido.id, duplicado: false, qr_id: qr, origen, edad });
  } catch (e) {
    return j({ ok: false, error: String((e as any)?.message || e) }, 500);
  }
});
