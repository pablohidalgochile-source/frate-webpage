// FRATE — Plantilla del correo de campaña. Separada para poder probarla sin enviar.
export type CampanaCfg = {
  asunto?: string; preheader?: string; logo_url?: string; imagen_url?: string; imagen_alt?: string; antetitulo?: string;
  titulo?: string; texto?: string; pasos?: string; boton_texto?: string; boton_url?: string; nota?: string;
  excluir_evento?: number | string | null; excluir_x?: boolean;
  // Bloque 2: una segunda llamada, opcional y secundaria. Todo con prefijo `b2_`
  // para que se vea de una que son del mismo bloque y no se mezclen con los de arriba.
  b2_kicker?: string; b2_titulo?: string; b2_texto?: string; b2_lista?: string;
  b2_boton_texto?: string; b2_boton_url?: string; b2_nota?: string;
  // Por qué le llega este correo a esta persona. Vacío = el texto de siempre.
  pie_motivo?: string;
};
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as Record<string, string>)[c]);
// Solo el PRIMER nombre, y con mayúscula inicial.
//
// Los nombres vienen del checkout y el 91% está EN MAYÚSCULAS, muchos con el
// nombre completo: «Hola ALLYSON TAMARA DOMINGUEZ GONZALEZ» se lee como carta
// del banco, no como FRATE. Con esto queda «Hola Allyson».
// Si no hay nombre, el saludo se queda sin él y la frase igual funciona.
const soloPila = (n: string) => {
  const p = String(n || '').trim().split(/\s+/)[0] || '';
  return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : '';
};
const conNombre = (s: string, nombre: string) => {
  const p = soloPila(nombre);
  return String(s || '').replace(/\s*\{nombre\}/g, p ? ' ' + p : '');
};

// Enlaces PERSONALES dentro de una campaña.
//
// Hasta ahora `boton_url` viajaba igual para todos, así que no se podía mandar
// un link que fuera «de» cada persona. Con esto, una campaña puede escribir
//   https://www.frate.cl/vaso.html?e={correo}&t={vaso}
// y a cada quien le llega el suyo. `{vaso}` es el HMAC del correo (ver
// _shared/vaso.ts): el servidor lo verifica, nadie puede fabricar el de otro.
//
// Una campaña que no use estas llaves no cambia en nada.
const conEnlace = (s: string, o: { correo?: string; vaso?: string }) =>
  String(s || '')
    .replace(/\{correo\}/g, encodeURIComponent(o.correo || ''))
    .replace(/\{vaso\}/g, encodeURIComponent(o.vaso || ''));
const lineas = (s: string) => String(s || '').split(/\n+/).map(x => x.trim()).filter(Boolean);

export function htmlCampana(cfg: CampanaCfg, o: { nombre: string; bajaUrl: string; logo?: string; color?: string; correo?: string; vaso?: string }) {
  const color = o.color || '#E8363D';
  const titulo = conNombre(cfg.titulo || '', o.nombre);
  const botonUrl = conEnlace(cfg.boton_url || '', o);
  const parrafos = lineas(conNombre(cfg.texto || '', o.nombre)).map(p =>
    `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#d4d4d8;">${esc(p)}</p>`).join('');
  const pasos = lineas(cfg.pasos || '').map(p =>
    `<tr><td style="padding:5px 0;font-size:14px;line-height:1.5;color:#f0e2b0;">${esc(p)}</td></tr>`).join('');
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(cfg.asunto || 'FRATE')}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Helvetica Neue',Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${esc(cfg.preheader || '')}</div>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px;"><tr><td align="center">
<!--[if mso]><table width="560" align="center" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
<table width="100%" cellpadding="0" cellspacing="0" bgcolor="#0A0A0B" style="max-width:560px;background:#0A0A0B;border-radius:6px;overflow:hidden;">
  <tr><td style="background:${esc(color)};padding:20px 28px;text-align:center;">
    ${cfg.logo_url
      // Logo propio de la campaña (ancho, p. ej. «FRATERNIDAD CAMPUS CENTRAL» en blanco)
      ? `<img src="${esc(cfg.logo_url)}" alt="Fraternidad Campus Central" width="220" style="display:inline-block;width:220px;max-width:70%;height:auto;border:0;color:#ffffff;font-size:16px;">`
      : o.logo ? `<img src="${esc(o.logo)}" alt="FRATE" height="40" style="display:inline-block;max-height:46px;border:0;">`
               : `<div style="font-size:24px;font-weight:900;color:#fff;letter-spacing:6px;">FRATE</div>`}
  </td></tr>
  ${cfg.imagen_url ? `<tr><td style="padding:0;"><img src="${esc(cfg.imagen_url)}" alt="${esc(cfg.imagen_alt || cfg.titulo || 'FRATE')}" width="560" style="display:block;width:100%;max-width:560px;height:auto;border:0;color:#f4f4f6;font-size:16px;"></td></tr>` : ''}
  <tr><td style="padding:28px 28px 8px;">
    ${cfg.antetitulo ? `<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#E6C860;margin-bottom:8px;">${esc(cfg.antetitulo)}</div>` : ''}
    <div style="font-size:24px;font-weight:800;line-height:1.25;color:#ffffff;margin:0 0 16px;">${esc(titulo)}</div>
    ${parrafos}
    ${pasos ? `<table width="100%" cellpadding="0" cellspacing="0" style="background:#17150c;border:1px solid #6b5a1e;border-radius:8px;margin:6px 0 20px;"><tr><td style="padding:12px 16px;"><table width="100%" cellpadding="0" cellspacing="0">${pasos}</table></td></tr></table>` : ''}
    ${botonUrl ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 18px;"><tr><td align="center"><table cellpadding="0" cellspacing="0"><tr><td align="center" bgcolor="${esc(color)}" style="border-radius:8px;">
      <a href="${esc(botonUrl)}" style="display:inline-block;background:${esc(color)};color:#ffffff;text-decoration:none;font-weight:800;font-size:15px;letter-spacing:1px;padding:15px 28px;border-radius:8px;">${esc(cfg.boton_texto || 'Ver más')}</a>
    </td></tr></table></td></tr></table>` : ''}
    ${cfg.nota ? `<p style="margin:0 0 20px;font-size:12px;line-height:1.6;color:#8a8a92;text-align:center;">${esc(cfg.nota)}</p>` : ''}
    ${/* ⭐ BLOQUE 2 — una segunda llamada, deliberadamente SECUNDARIA (borde dorado,
          botón vacío) para que no le compita a la principal. Sólo se dibuja si la
          campaña lo trae: las que no, quedan exactamente igual que antes.
          Nació para invitar a crear cuenta en el correo del vaso, donde 227 de 253
          compraron como invitados. */ ''}
    ${(cfg.b2_titulo || cfg.b2_boton_url) ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 4px;border-top:1px solid #1f1f22;"><tr><td style="padding-top:20px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#121214;border:1px solid rgba(230,200,96,.3);border-radius:10px;"><tr><td style="padding:16px 18px;">
        ${cfg.b2_kicker ? `<div style="font-size:10px;letter-spacing:2.5px;text-transform:uppercase;color:#E6C860;margin-bottom:7px;">${esc(cfg.b2_kicker)}</div>` : ''}
        ${cfg.b2_titulo ? `<div style="font-size:17px;font-weight:800;color:#ffffff;margin-bottom:9px;line-height:1.3;">${esc(cfg.b2_titulo)}</div>` : ''}
        ${cfg.b2_texto ? lineas(cfg.b2_texto).map(x => `<p style="margin:0 0 10px;font-size:13px;line-height:1.65;color:#a1a1aa;">${esc(x)}</p>`).join('') : ''}
        ${lineas(cfg.b2_lista || '').length ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 14px;">${lineas(cfg.b2_lista || '').map(x => `<tr><td style="padding:3px 0;font-size:13px;line-height:1.5;color:#c3c3ca;">· ${esc(x)}</td></tr>`).join('')}</table>` : ''}
        ${cfg.b2_boton_url ? `<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
          <a href="${esc(conEnlace(cfg.b2_boton_url, o))}" style="display:inline-block;border:1px solid #E6C860;color:#E6C860;text-decoration:none;font-weight:700;font-size:14px;padding:12px 26px;border-radius:9px;">${esc(cfg.b2_boton_texto || 'Ver más')}</a>
        </td></tr></table>` : ''}
        ${cfg.b2_nota ? `<div style="text-align:center;font-size:11px;color:#6b6b73;margin-top:9px;">${esc(cfg.b2_nota)}</div>` : ''}
      </td></tr></table>
    </td></tr></table>` : ''}
  </td></tr>
  <tr><td style="border-top:1px solid #1f1f22;padding:16px 28px;text-align:center;font-size:11px;line-height:1.6;color:#71717a;">
    ${/* El motivo REAL por el que le llega. Importa: es lo que mira alguien antes de
         marcar spam, y una queja fuerte acá también lo suprime para los correos de
         su entrada (misma cuenta de Resend). En la campaña del vaso, 227 de 253 NO
         tienen cuenta: decirles «porque tienes cuenta» era falso. */ ''}
    ${esc(cfg.pie_motivo || 'Recibes este correo porque tienes cuenta en frate.cl')} · Fraternidad Campus Central<br>
    <a href="${esc(o.bajaUrl)}" style="color:#a1a1aa;">Dejar de recibir estos correos</a>
  </td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
}

export function textoCampana(cfg: CampanaCfg, o: { nombre: string; bajaUrl: string; correo?: string; vaso?: string }) {
  return [...(cfg.antetitulo ? [cfg.antetitulo, ''] : []), conNombre(cfg.titulo || '', o.nombre), '', ...lineas(conNombre(cfg.texto || '', o.nombre)), '',
          ...lineas(cfg.pasos || ''), '', cfg.boton_url ? `${cfg.boton_texto || 'Ver más'}: ${conEnlace(cfg.boton_url, o)}` : '',
          cfg.nota || '',
          ...(cfg.b2_titulo || cfg.b2_boton_url ? ['', '— — —', cfg.b2_titulo || '', cfg.b2_texto || '',
              ...lineas(cfg.b2_lista || '').map(x => '· ' + x),
              cfg.b2_boton_url ? `${cfg.b2_boton_texto || 'Ver más'}: ${conEnlace(cfg.b2_boton_url, o)}` : ''] : []),
          '', `Dejar de recibir estos correos: ${o.bajaUrl}`].join('\n');
}
