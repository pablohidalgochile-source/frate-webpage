// ============================================================
// FRATE — Edge Function: mi-vaso (público, por enlace firmado)
//
// Para quien YA compró su entrada y quiere sumar el vaso coleccionable.
//
// El problema que resuelve: el vaso sólo se podía agregar DENTRO del checkout
// de entradas. `crear-pago` cuenta las entradas QUE VAN EN ESE CARRITO, así que
// quien ya compró llegaba con un carrito sin entradas y se le rechazaba con
// «Los extras van junto a una entrada». La regla era correcta; miraba el lugar
// equivocado. Acá se cuentan las entradas que la persona YA PAGÓ.
//
// GET ?e=<correo>&t=<token>  →  { ok, nombre, noches:[{evento_id, fecha, nombre,
//                                  entradas, vasos_comprados, puede, addon:{...}}] }
//
// ⚠️ El token es un HMAC del correo con la llave de servicio (ver _shared/vaso.ts):
//    no se guarda en ninguna tabla y nadie puede fabricar el de otra persona.
//    Aun así este endpoint devuelve SÓLO lo necesario para armar la compra:
//    nunca el RUT, ni los QR, ni el detalle de los pedidos.
//
// verify_jwt = false (público, igual que form-submit y correo-baja).
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.111.0';
import { tokenVaso, tokenOk } from '../_shared/vaso.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
};

const NO = () => new Response(JSON.stringify({ error: 'link_invalido' }), { status: 404, headers: cors });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'GET') return new Response(JSON.stringify({ error: 'metodo' }), { status: 405, headers: cors });

  try {
    const u = new URL(req.url);
    const email = String(u.searchParams.get('e') || '').trim().toLowerCase();
    const t = String(u.searchParams.get('t') || '').trim();
    if (!email || !t) return NO();
    if (!tokenOk(t, await tokenVaso(email))) return NO();

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Lo que esta persona PAGÓ. Se mira por correo del pedido porque la gran
    // mayoría compró sin cuenta (228 de 243 pedidos no tienen cliente_id).
    const { data: pedidos } = await sb.from('pedidos')
      .select('id, nombre_cliente, items_pedido(evento_id, cantidad, producto_tipo, producto_id, qr_ids)')
      .eq('estado', 'pagado').ilike('email_cliente', email).limit(200);
    if (!pedidos || !pedidos.length) return new Response(JSON.stringify({ ok: true, nombre: '', noches: [] }), { headers: cors });

    // Entradas y vasos ya comprados, por noche.
    const entradas = new Map<number, number>();
    const vasos = new Map<number, number>();
    let nombre = '';
    for (const p of pedidos) {
      if (!nombre && p.nombre_cliente) nombre = String(p.nombre_cliente);
      for (const it of (p.items_pedido || []) as any[]) {
        const tipo = String(it.producto_tipo || 'ticket');
        if (tipo === 'ticket') {
          // Las entradas se cuentan por QR, que es una persona cada uno; `cantidad`
          // es el respaldo para pedidos viejos que no traen qr_ids.
          const n = Array.isArray(it.qr_ids) ? it.qr_ids.length : (Number(it.cantidad) || 0);
          if (it.evento_id) entradas.set(it.evento_id, (entradas.get(it.evento_id) || 0) + n);
        } else if (tipo === 'addon') {
          // Los addons no guardan evento_id: se resuelve por el addon comprado.
          const aid = Number(it.producto_id);
          if (Number.isFinite(aid)) vasos.set(aid, (vasos.get(aid) || 0) + (Number(it.cantidad) || 0));
        }
      }
    }
    if (!entradas.size) return new Response(JSON.stringify({ ok: true, nombre, noches: [] }), { headers: cors });

    const evIds = [...entradas.keys()];
    const [{ data: evs }, { data: addons }] = await Promise.all([
      sb.from('eventos').select('id, nombre, fecha').in('id', evIds),
      // Puerta 3: el producto tiene que tener `por_link` encendido. Un producto
      // con esa puerta apagada no se puede comprar por este camino aunque alguien
      // tenga un enlace válido.
      sb.from('tiendita').select('id, nombre, descripcion, precio, stock, eventos, max_por_entrada, imagen_url')
        .eq('disponible', true).eq('por_link', true),
    ]);

    const noches = evIds.map((evId) => {
      const ev = (evs || []).find((e: any) => e.id === evId);
      const addon = (addons || []).find((a: any) => !Array.isArray(a.eventos) || !a.eventos.length || a.eventos.includes(evId));
      if (!ev || !addon) return null;              // noche sin vaso ofrecido: no se muestra
      const tengo = entradas.get(evId) || 0;
      const ya = vasos.get(addon.id) || 0;
      const stock = addon.stock == null ? 9999 : addon.stock;
      // El tope lo manda el producto, igual que en el checkout. Acá se multiplica
      // por las entradas YA PAGADAS, que es la diferencia de esta puerta.
      const porEntrada = (addon.max_por_entrada == null) ? Infinity : tengo * Math.max(0, Number(addon.max_por_entrada));
      return {
        evento_id: evId, fecha: ev.fecha, nombre: ev.nombre,
        entradas: tengo,
        vasos_comprados: ya,
        // Uno por entrada, y nunca más de lo que queda en bodega.
        puede: Math.max(0, Math.min(porEntrada - ya, stock)),
        agotado: stock <= 0,
        addon: { id: addon.id, nombre: addon.nombre, descripcion: addon.descripcion, precio: addon.precio, imagen_url: addon.imagen_url },
      };
    }).filter(Boolean);

    return new Response(JSON.stringify({ ok: true, nombre, noches }), { headers: cors });
  } catch (e) {
    console.error('[mi-vaso]', e);
    return new Response(JSON.stringify({ error: 'error' }), { status: 500, headers: cors });
  }
});
