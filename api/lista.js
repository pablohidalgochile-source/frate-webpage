// ── Vista previa por link ─────────────────────────────────────────────
// WhatsApp, Instagram y Telegram NO ejecutan javascript: leen el html tal
// como sale del servidor. Por eso el fondo que se le pone a un link se ve
// al abrirlo pero no en el chat, donde todos comparten la misma imagen.
// Esta función arma el mismo lista.html con las meta tags de ESTE link.
//
// ⚠️ REGLA: pase lo que pase, la página tiene que salir. Si la base no
// responde, si el código no existe, si algo revienta — se devuelve el
// lista.html original sin tocar. Un link sin miniatura sirve; un link
// caído deja a la gente fuera de la fiesta.

const SB = 'https://ydwlpraoaaijlfssevoh.supabase.co';
const KEY = 'sb_publishable_-_7GeDU_h84zf2v--lWQaQ_15ZFxOWt';
const BASE = 'https://www.frate.cl';

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const ytId = (u) => {
  const m = String(u || '').match(/(?:v=|youtu\.be\/|embed\/|shorts\/|live\/|\/v\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : '';
};

const DOW = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const MES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto',
             'septiembre','octubre','noviembre','diciembre'];
function fmtFecha(f) {
  if (!f) return '';
  const [a, m, d] = String(f).slice(0, 10).split('-').map(Number);
  if (!a || !m || !d) return '';
  return DOW[new Date(a, m - 1, d).getDay()] + ', ' + d + ' de ' + MES[m - 1];
}

// La miniatura en HD solo existe si el video se subió en HD; hqdefault
// siempre está. Se prueba la buena y se cae a la segura.
async function miniYt(id) {
  const hd = 'https://img.youtube.com/vi/' + id + '/maxresdefault.jpg';
  try {
    const r = await fetch(hd, { method: 'HEAD' });
    if (r.ok) return hd;
  } catch (_) {}
  return 'https://img.youtube.com/vi/' + id + '/hqdefault.jpg';
}

// CommonJS a propósito: sin package.json en el proyecto, ESM obliga a
// agregar uno, y eso puede cambiar cómo Vercel construye TODO el sitio.
// Un video que el dueño bloqueó para incrustar deja el marco NEGRO, sin
// aviso: el iframe tapa la miniatura de respaldo. Acá se le pregunta a
// youtube antes de servir la página. Con tope de tiempo: si no contesta
// rápido, se deja el video — llegar tarde es peor que un fondo imperfecto.
async function dejaIncrustar(id) {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 1200);
    const r = await fetch('https://www.youtube.com/oembed?format=json&url=' +
      encodeURIComponent('https://www.youtube.com/watch?v=' + id), { signal: ctl.signal });
    clearTimeout(t);
    return r.status !== 401 && r.status !== 403;
  } catch (_) { return true; }
}

module.exports = async function handler(req, res) {
  const url = new URL(req.url, BASE);
  const codigo = String(url.searchParams.get('c') || '').trim().toUpperCase();

  let html = '';
  try {
    const r = await fetch(BASE + '/lista.html', { headers: { 'cache-control': 'no-cache' } });
    html = await r.text();
  } catch (_) {}
  // Sin la página base no hay nada que servir: se manda al archivo estático,
  // que sabe leer el código por ?c= y funciona igual.
  if (!html || html.length < 500) {
    res.statusCode = 302;
    res.setHeader('Location', '/lista.html?c=' + encodeURIComponent(codigo));
    return res.end();
  }

  try {
    if (codigo) {
      const r = await fetch(SB + '/rest/v1/rpc/lista_publica', {
        method: 'POST',
        headers: { 'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_codigo: codigo })
      });
      const j = await r.json();
      const L = Array.isArray(j) ? j[0] : j;
      if (L && L.nombre) {
        const c = L.condiciones || {};
        const P = (c.portada && typeof c.portada === 'object') ? c.portada : {};

        let img = BASE + '/assets/og-lista.png';
        let dim = null;                       // ancho x alto, si lo sé de cierto
        if (P.modo === 'img' && P.url) { img = P.url; }
        else if (P.modo === 'video' && ytId(P.yt)) {
          const vid = ytId(P.yt);
          img = await miniYt(vid);
          dim = img.includes('maxres') ? [1280, 720] : [480, 360];
          // Si no deja incrustarse, la página muestra la miniatura fija en
          // vez de un marco negro. La decisión viaja en el html.
          if (!(await dejaIncrustar(vid))) {
            html = html.replace('</head>',
              '<script>window._ytBloqueado=' + JSON.stringify(img) + '<\/script>\n</head>');
          }
        }

        // En el chat lo que se lee de un vistazo es el título. Ahí va el
        // nombre del evento y nada más; quién invita y la fecha van abajo.
        // El dueño suele venir como «@invitafrate · Invitaciones FRATE»:
        // se corta en el primer separador para que no se repita.
        const quien = String(L.inviter_nombre || L.duenio_nombre || 'FRATE')
          .split('·')[0].trim().replace(/^@/, '') || 'FRATE';
        const titulo = L.nombre;
        const benef = String(L.benefit_text || c.benefit || '').trim();
        // El beneficio muchas veces ya empieza con «Te invita LA FRATE»:
        // anteponer el mío dejaba «Te invita X · … · Te invita LA FRATE».
        const invita = /invita/i.test(benef) ? '' : 'Te invita ' + quien;
        const partes = [invita, fmtFecha(L.fecha),
                        c.hora_max_llegada ? 'hasta ' + c.hora_max_llegada : '',
                        benef].filter(Boolean);
        let desc = partes.join(' · ');
        if (desc.length > 190) desc = desc.slice(0, 187).replace(/\s+\S*$/, '') + '…';

        const meta = {
          'og:title': titulo, 'twitter:title': titulo,
          'og:description': desc, 'twitter:description': desc,
          'og:image': img, 'twitter:image': img,
          'og:url': BASE + '/lista/' + codigo
        };
        // Se reemplaza el valor de las que ya están; las que no, se agregan.
        for (const [k, v] of Object.entries(meta)) {
          const attr = k.startsWith('og:') ? 'property' : 'name';
          const re = new RegExp('<meta\\s+' + attr + '="' + k + '"\\s+content="[^"]*"\\s*/?>', 'i');
          const tag = '<meta ' + attr + '="' + k + '" content="' + esc(v) + '" />';
          html = re.test(html) ? html.replace(re, tag) : html.replace('</head>', tag + '\n</head>');
        }
        html = html.replace(/<title>[^<]*<\/title>/i, '<title>' + esc(titulo) + '</title>');
        // El html trae 1200x630 fijo. Si la imagen mide otra cosa, whatsapp
        // recorta mal o no la muestra. Se pone la medida real, y si no la sé
        // de cierto se borran: el crawler la mide solo.
        html = html.replace(/<meta\s+property="og:image:(width|height)"\s+content="[^"]*"\s*\/?>/gi, '');
        if (dim) html = html.replace('</head>',
          '<meta property="og:image:width" content="' + dim[0] + '" />\n' +
          '<meta property="og:image:height" content="' + dim[1] + '" />\n</head>');
      }
    }
  } catch (_) { /* la página sale igual, sin miniatura propia */ }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, must-revalidate');
  res.statusCode = 200;
  return res.end(html);
};
