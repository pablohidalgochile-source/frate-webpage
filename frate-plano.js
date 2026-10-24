/* ============================================================
 * FRATE — Motor de render del plano/disposición (compartido)
 * Dibuja un mapa (JSON) en SVG. Read-only o con selección de ZONA.
 * Formato: { w, h, espacios:[ {tipo,forma,x,y,w,h,d,r,rot,nombre,color,cap,precio,sel} ] }
 *   forma: 'rect' | 'circle' | 'path'   ·   tipo: escenario|zona|mesa|pared|barra|bano|otro
 *   sel:true  → seleccionable por el cliente (zona/mesa)
 * Uso:
 *   FratePlano.render(el, plano, { selectable:true, selected:'ZONA B', onPick:(esp)=>{...} });
 * ============================================================ */
(function (global) {
  var NS = 'http://www.w3.org/2000/svg';
  function esc(s){ return String(s == null ? '' : s).replace(/[<>&"]/g, function(c){ return {'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]; }); }
  function tipoColor(t){
    return ({ escenario:'#3f3f46', pared:'#27272a', barra:'#5b3a1a', bano:'#1e3a5f', zona:'#E8363D', mesa:'#D4A832' })[t] || '#71717a';
  }
  function hexA(h, a){
    h = String(h||'').replace('#',''); if (h.length===3) h = h.split('').map(function(x){return x+x;}).join('');
    var n = parseInt(h,16); if (isNaN(n)) return 'rgba(113,113,122,'+a+')';
    return 'rgba('+((n>>16)&255)+','+((n>>8)&255)+','+(n&255)+','+a+')';
  }
  function clp(n){ return '$' + Number(n||0).toLocaleString('es-CL'); }

  function render(el, plano, opts){
    opts = opts || {};
    if (!el) return;
    plano = plano || {};
    var W = plano.w || 320, H = plano.h || 360;
    var esps = Array.isArray(plano.espacios) ? plano.espacios : [];
    var selectable = !!opts.selectable;
    var selected = opts.selected || null;

    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('width', '100%');
    svg.style.cssText = 'height:auto;max-height:'+(opts.maxHeight||420)+'px;display:block;background:#0d0d0f;border:1px solid #1c1c1f;border-radius:12px;';

    esps.forEach(function(sp){
      var isZonaMesa = (sp.tipo === 'zona' || sp.tipo === 'mesa');
      var canPick = selectable && (sp.sel !== false) && isZonaMesa;
      var base = sp.color || tipoColor(sp.tipo);
      var isSel = selected != null && String(selected) === String(sp.nombre);
      var g = document.createElementNS(NS, 'g');
      if (canPick){ g.style.cursor = 'pointer'; }

      var shape;
      if (sp.forma === 'circle'){
        shape = document.createElementNS(NS,'circle');
        shape.setAttribute('cx', sp.x + (sp.r||sp.w/2||10));
        shape.setAttribute('cy', sp.y + (sp.r||sp.h/2||10));
        shape.setAttribute('r', sp.r || Math.min(sp.w||20, sp.h||20)/2);
      } else if (sp.forma === 'path' && sp.d){
        shape = document.createElementNS(NS,'path');
        shape.setAttribute('d', sp.d);
      } else {
        shape = document.createElementNS(NS,'rect');
        shape.setAttribute('x', sp.x||0); shape.setAttribute('y', sp.y||0);
        shape.setAttribute('width', sp.w||40); shape.setAttribute('height', sp.h||30);
        shape.setAttribute('rx', sp.rx != null ? sp.rx : (sp.tipo==='mesa'?5:8));
        if (sp.rot){ var cx=(sp.x||0)+(sp.w||40)/2, cy=(sp.y||0)+(sp.h||30)/2; shape.setAttribute('transform','rotate('+sp.rot+' '+cx+' '+cy+')'); }
      }
      var occupied = (sp.estado === 'ocupada' || sp.estado === 'ocupado');
      var fill = isSel ? hexA('#ffffff', 0.16) : (occupied ? hexA('#52525b', 0.35) : hexA(base, sp.tipo==='escenario'||sp.tipo==='pared'? 0.9 : (isZonaMesa?0.18:0.5)));
      var stroke = isSel ? '#ffffff' : (occupied ? '#52525b' : (sp.tipo==='escenario'||sp.tipo==='pared'? '#3f3f46' : hexA(base, 0.6)));
      shape.setAttribute('fill', fill);
      shape.setAttribute('stroke', stroke);
      shape.setAttribute('stroke-width', isSel ? 2 : 1);
      g.appendChild(shape);

      if (sp.nombre){
        var bb = shapeCenter(sp);
        var txt = document.createElementNS(NS,'text');
        txt.setAttribute('x', bb.cx); txt.setAttribute('y', bb.cy + 3);
        txt.setAttribute('text-anchor','middle');
        txt.setAttribute('font-size', sp.tipo==='mesa'?9:(sp.tipo==='escenario'?11:11));
        txt.setAttribute('font-weight','700');
        txt.setAttribute('letter-spacing', sp.tipo==='escenario'?2:1);
        txt.setAttribute('fill', isSel ? '#fff' : (occupied ? '#71717a' : (isZonaMesa ? lighten(base) : '#a1a1aa')));
        txt.style.pointerEvents = 'none';
        txt.textContent = sp.nombre;
        g.appendChild(txt);
      }

      if (canPick){
        g.addEventListener('click', function(){
          if (occupied) return;
          if (opts.onPick) opts.onPick(sp);
        });
        var t = document.createElementNS(NS,'title');
        t.textContent = sp.nombre + (sp.cap?(' · hasta '+sp.cap):'') + (sp.precio?(' · '+clp(sp.precio)):'') + (occupied?' · ocupada':'');
        g.appendChild(t);
      }
      svg.appendChild(g);
    });

    el.innerHTML = '';
    el.appendChild(svg);
    return svg;
  }

  function shapeCenter(sp){
    if (sp.forma === 'path' && sp.d){
      var nums = (sp.d.match(/-?\d+(\.\d+)?/g)||[]).map(Number);
      var xs=[], ys=[]; for (var i=0;i+1<nums.length;i+=2){ xs.push(nums[i]); ys.push(nums[i+1]); }
      if (xs.length) return { cx: avg(xs), cy: avg(ys) };
      return { cx:0, cy:0 };
    }
    if (sp.forma === 'circle') return { cx: sp.x+(sp.r||sp.w/2||10), cy: sp.y+(sp.r||sp.h/2||10) };
    return { cx: (sp.x||0)+(sp.w||40)/2, cy: (sp.y||0)+(sp.h||30)/2 };
  }
  function avg(a){ return a.reduce(function(s,x){return s+x;},0)/a.length; }
  function lighten(hex){
    hex = String(hex||'').replace('#',''); if (hex.length===3) hex = hex.split('').map(function(x){return x+x;}).join('');
    var n = parseInt(hex,16); if (isNaN(n)) return '#e4e4e7';
    var r=Math.min(255,((n>>16)&255)+90), g=Math.min(255,((n>>8)&255)+90), b=Math.min(255,(n&255)+90);
    return 'rgb('+r+','+g+','+b+')';
  }

  global.FratePlano = { render: render, clp: clp };
})(typeof window !== 'undefined' ? window : this);
