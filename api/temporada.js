// ── Vista previa por link · TEMPORADA ───────────────────────────────────
// WhatsApp, Instagram y Telegram NO ejecutan javascript: leen el html tal
// como sale del servidor. Esta función arma el mismo temporada.html con las
// meta tags de la temporada VIGENTE, para que el link que se pega en una
// historia muestre su nombre, sus noches y su flyer.
//
// Mismo criterio que api/lista.js, del que está copiada:
// ⚠️ REGLA: pase lo que pase, la página tiene que salir. Si la base no
// responde o algo revienta, se devuelve el temporada.html original sin
// tocar — se ve igual al abrirlo, solo pierde la miniatura propia.

const SB = 'https://ydwlpraoaaijlfssevoh.supabase.co';
const KEY = 'sb_publishable_-_7GeDU_h84zf2v--lWQaQ_15ZFxOWt';
const BASE = 'https://www.frate.cl';

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const MES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto',
             'septiembre','octubre','noviembre','diciembre'];

function enVentana(t) {
  const n = new Date();
  const d = t.venta_desde ? new Date(t.venta_desde) : null;
  const h = t.venta_hasta ? new Date(t.venta_hasta) : null;
  if (d && !isNaN(+d) && n < d) return false;
  if (h && !isNaN(+h) && n >= h) return false;
  return true;
}

async function sbGet(path) {
  const r = await fetch(SB + '/rest/v1/' + path, {
    headers: { apikey: KEY, Authorization: 'Bearer ' + KEY }
  });
  if (!r.ok) throw new Error('rest ' + r.status);
  return r.json();
}

module.exports = async function handler(req, res) {
  let html = '';
  try {
    const r = await fetch(BASE + '/temporada.html', { headers: { 'cache-control': 'no-cache' } });
    html = await r.text();
  } catch (_) {}
  if (!html || html.length < 500) {
    res.statusCode = 302;
    res.setHeader('Location', '/temporada.html');
    return res.end();
  }

  try {
    const evs = await sbGet('eventos?select=nombre,fecha,descripcion,brief,activo,tipos_ticket(precio,estado,solo_web,disponible,venta_desde,venta_hasta)&activo=eq.true&order=fecha.asc');
    const noches = (evs || []).filter(e =>
      e && e.brief && e.brief.especial &&
      e.brief.produccion && e.brief.produccion.temporada && e.brief.produccion.temporada.nombre);

    if (noches.length >= 2) {
      const nombre = noches[0].brief.produccion.temporada.nombre;

      // El precio que se anuncia es el del tramo VIGENTE, igual que la
      // vitrina: prometer uno que ya no se vende es peor que no prometer.
      let min = 0;
      for (const ev of noches) {
        for (const t of (ev.tipos_ticket || [])) {
          if (t.estado !== 'Activo' || t.solo_web === false) continue;
          if ((t.disponible == null ? 1 : t.disponible) <= 0) continue;
          if (!enVentana(t)) continue;
          if (!min || t.precio < min) min = t.precio;
        }
      }

      const dias = noches.map(e => Number(String(e.fecha).slice(8, 10)));
      const mes = MES[Number(String(noches[0].fecha).slice(5, 7)) - 1] || '';
      const cuando = dias.length > 1
        ? dias.slice(0, -1).join(', ') + ' y ' + dias[dias.length - 1]
        : String(dias[0] || '');

      const titulo = nombre + ' · ' + noches.length + ' noches en FRATE';
      let desc = cuando + ' de ' + mes + '. '
        + noches.map(e => e.nombre).join(', ')
        + (min ? '. Preventa desde $' + min.toLocaleString('es-CL') : '');
      if (desc.length > 190) desc = desc.slice(0, 187).replace(/\s+\S*$/, '') + '…';

      // La imagen de la tarjeta es la horizontal, no el flyer vertical:
      // WhatsApp recorta una vertical a un cuadrado diminuto.
      let img = BASE + '/assets/og.png', dim = [1200, 630];
      try {
        const cfg = await sbGet("config_valores?select=clave,valor&clave=in.(temporada_og,temporada_imagen)");
        const m = {}; (cfg || []).forEach(x => { m[x.clave] = x.valor || ''; });
        if (m.temporada_og) { img = m.temporada_og; dim = null; }
        else if (m.temporada_imagen) { img = m.temporada_imagen; dim = null; }
      } catch (_) {}

      const meta = {
        'og:title': titulo, 'twitter:title': titulo,
        'og:description': desc, 'twitter:description': desc,
        'og:image': img, 'twitter:image': img,
        'og:url': BASE + '/temporada'
      };
      for (const [k, v] of Object.entries(meta)) {
        const attr = k.startsWith('og:') ? 'property' : 'name';
        const re = new RegExp('<meta\\s+' + attr + '="' + k + '"\\s+content="[^"]*"\\s*/?>', 'i');
        const tag = '<meta ' + attr + '="' + k + '" content="' + esc(v) + '" />';
        html = re.test(html) ? html.replace(re, tag) : html.replace('</head>', tag + '\n</head>');
      }
      html = html.replace(/<title>[^<]*<\/title>/i, '<title>' + esc(titulo) + '</title>');
      // Las medidas fijas del html sólo valen para la imagen por defecto.
      html = html.replace(/<meta\s+property="og:image:(width|height)"\s+content="[^"]*"\s*\/?>/gi, '');
      if (dim) html = html.replace('</head>',
        '<meta property="og:image:width" content="' + dim[0] + '" />\n' +
        '<meta property="og:image:height" content="' + dim[1] + '" />\n</head>');
    }
  } catch (_) { /* la página sale igual, sin miniatura propia */ }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');
  res.statusCode = 200;
  res.end(html);
};
