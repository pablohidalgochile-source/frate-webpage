/* FRATE · cáscara única de modales por pasos
 * HTML + JS plano, sin dependencias. Mantiene todos los campos en el DOM.
 * Uso: FrateModal.registrar('modal-evento', { pasos: [...], ... })
 */
(function (global) {
  'use strict';

  const STYLE_ID = 'frate-modal-styles';
  const instancias = new Map();

  function instalarEstilos() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .fm-host{transition:opacity .12s ease;}
      .fm-host .fm-modal{display:flex;flex-direction:column;overflow:hidden;max-width:680px;max-height:min(88vh,820px);}
      .fm-host .fm-body{min-height:0;overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable;}
      .fm-host .mh{flex:0 0 auto;min-height:54px;}
      .fm-host .mht{display:flex;align-items:center;gap:8px;min-width:0;}
      .fm-host .mc{width:38px;height:38px;border-radius:var(--r);display:grid;place-items:center;flex:0 0 auto;}
      .fm-host .mc:focus-visible,.fm-step-btn:focus-visible,.fm-host .btn:focus-visible{outline:2px solid var(--text);outline-offset:2px;}
      .fm-progress-shell{flex:0 0 auto;padding:10px 18px 11px;border-bottom:1px solid var(--border);background:var(--bg2);}
      .fm-progress-meta{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px;font-size:.66rem;color:var(--muted);}
      .fm-progress-meta b{color:var(--text);font-weight:650;}
      .fm-progress{display:flex;gap:6px;overflow-x:auto;overscroll-behavior-x:contain;scroll-snap-type:x proximity;scrollbar-width:none;padding:1px;}
      .fm-progress::-webkit-scrollbar{display:none;}
      .fm-step-btn{appearance:none;min-width:86px;flex:1 0 86px;scroll-snap-align:center;display:flex;align-items:center;gap:7px;text-align:left;background:var(--bg3);color:var(--muted);border:1px solid var(--border);border-radius:9px;padding:7px 8px;cursor:pointer;font:600 .66rem/1.18 var(--font);transition:border-color .12s,background .12s,color .12s;}
      .fm-step-btn:hover{border-color:var(--border2);color:var(--text);}
      .fm-step-btn[aria-current="step"]{border-color:var(--rojo);background:rgba(232,54,61,.11);color:var(--text);}
      .fm-step-btn.is-done{color:var(--text);}
      .fm-step-btn:disabled{cursor:default;opacity:.56;}
      .fm-step-number{width:22px;height:22px;display:grid;place-items:center;border-radius:50%;flex:0 0 22px;background:var(--bg);border:1px solid var(--border2);font-size:.64rem;color:var(--muted);}
      .fm-step-btn[aria-current="step"] .fm-step-number{background:var(--rojo);border-color:var(--rojo);color:#fff;}
      .fm-step-btn.is-done .fm-step-number{background:rgba(74,222,128,.14);border-color:rgba(74,222,128,.38);color:var(--verde);}
      .fm-step-name{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;}
      .fm-question{font-family:var(--disp);font-weight:900;font-size:1.5rem;line-height:1.02;letter-spacing:-.2px;margin:0 0 6px;}
      .fm-question-help{color:var(--muted);font-size:.76rem;line-height:1.45;margin:0 0 18px;max-width:58ch;}
      .fm-step-panel[hidden]{display:none!important;}
      .fm-panel-error{display:none;margin:0 0 12px;padding:9px 11px;border:1px solid rgba(232,54,61,.42);border-radius:var(--r);background:rgba(232,54,61,.08);color:var(--rojo2);font-size:.76rem;line-height:1.4;}
      .fm-panel-error.is-visible{display:block;}
      .fm-invalid{border-color:var(--rojo)!important;box-shadow:0 0 0 3px rgba(232,54,61,.13)!important;}
      .fm-inline-error{color:var(--rojo2);font-size:.68rem;line-height:1.35;margin-top:4px;}
      .fm-save-error{display:none;flex:0 0 auto;margin:12px 18px 0;padding:11px 12px;border:1px solid rgba(232,54,61,.52);border-radius:10px;background:rgba(232,54,61,.09);color:var(--text);}
      .fm-save-error.is-visible{display:flex;gap:10px;align-items:flex-start;}
      .fm-save-error-icon{font-size:1rem;line-height:1.25;}
      .fm-save-error strong{display:block;font-size:.8rem;margin-bottom:2px;color:var(--rojo2);}
      .fm-save-error p{margin:0;color:var(--muted);font-size:.72rem;line-height:1.4;}
      .fm-save-error code{font:600 .65rem/1.3 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--text);}
      .fm-foot{flex:0 0 auto;display:flex;justify-content:space-between;align-items:center;gap:10px;background:var(--bg2);}
      .fm-foot-left,.fm-foot-right{display:flex;align-items:center;gap:6px;}
      .fm-foot .btn{min-height:38px;justify-content:center;white-space:nowrap;}
      .fm-foot .btn[hidden]{display:none!important;}
      .fm-foot .fm-primary[aria-busy="true"]{opacity:.72;pointer-events:none;}
      .fm-summary{display:grid;gap:8px;margin-top:12px;}
      .fm-summary-row{display:grid;grid-template-columns:minmax(118px,.8fr) 1.5fr;gap:12px;align-items:start;padding:9px 10px;border:1px solid var(--border);border-radius:var(--r);background:var(--bg3);font-size:.77rem;}
      .fm-summary-row dt{color:var(--muted);}
      .fm-summary-row dd{margin:0;color:var(--text);font-weight:600;text-align:right;overflow-wrap:anywhere;}
      .fm-unsaved{position:absolute;inset:0;z-index:5;display:grid;place-items:center;padding:20px;background:rgba(0,0,0,.76);}
      .fm-unsaved[hidden]{display:none;}
      .fm-unsaved-card{width:min(100%,430px);padding:18px;background:var(--bg2);border:1px solid var(--border2);border-radius:var(--r-card);box-shadow:var(--shadow);}
      .fm-unsaved-icon{font-size:1.45rem;margin-bottom:8px;}
      .fm-unsaved h3{font-size:1rem;margin:0 0 6px;}
      .fm-unsaved p{font-size:.78rem;line-height:1.5;color:var(--muted);margin:0 0 16px;}
      .fm-unsaved-actions{display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap;}
      .fm-status{display:inline-flex;align-items:center;gap:5px;width:max-content;padding:4px 9px;border:1px solid transparent;border-radius:var(--r-pill);font-size:.66rem;font-weight:750;line-height:1.2;white-space:nowrap;}
      .fm-status::before{content:'';width:6px;height:6px;border-radius:50%;background:currentColor;}
      .fm-status--borrador{color:var(--dorado);background:rgba(230,200,96,.12);border-color:rgba(230,200,96,.25);}
      .fm-status--publicado{color:var(--verde);background:rgba(74,222,128,.12);border-color:rgba(74,222,128,.24);}
      .fm-status--cerrado{color:var(--muted);background:rgba(138,138,146,.11);border-color:rgba(138,138,146,.22);}
      .fm-status--cortesia{color:var(--morado);background:rgba(196,181,253,.12);border-color:rgba(196,181,253,.25);}
      .fm-status--venta{color:var(--azul);background:rgba(96,165,250,.12);border-color:rgba(96,165,250,.25);}
      .fm-person-search{position:relative;}
      .fm-person-results{position:absolute;z-index:12;left:0;right:0;top:calc(100% + 4px);display:none;max-height:238px;overflow:auto;background:var(--bg2);border:1px solid var(--border2);border-radius:10px;box-shadow:var(--shadow);}
      .fm-person-results.is-visible{display:block;}
      .fm-person-result{appearance:none;width:100%;display:flex;align-items:center;gap:9px;padding:9px 10px;background:none;border:0;border-bottom:1px solid var(--border);color:var(--text);font:inherit;text-align:left;cursor:pointer;}
      .fm-person-result:last-child{border-bottom:0;}
      .fm-person-result:hover,.fm-person-result.is-active{background:var(--bg3);}
      .fm-person-avatar{width:30px;height:30px;display:grid;place-items:center;flex:0 0 30px;border-radius:50%;background:rgba(232,54,61,.15);color:var(--rojo2);font-weight:800;font-size:.7rem;}
      .fm-person-main{min-width:0;flex:1;}
      .fm-person-name{font-weight:700;font-size:.77rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .fm-person-meta{margin-top:2px;color:var(--muted);font-size:.66rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .fm-person-empty{padding:12px;color:var(--muted);font-size:.75rem;text-align:center;}
      .fm-person-selected{display:none;align-items:center;gap:9px;margin-top:7px;padding:9px 10px;border:1px solid rgba(74,222,128,.3);border-radius:var(--r);background:rgba(74,222,128,.07);}
      .fm-person-selected.is-visible{display:flex;}
      .fm-person-selected .fm-person-clear{margin-left:auto;background:none;border:0;color:var(--muted);cursor:pointer;font-size:.72rem;}
      .fm-night-preview{padding:10px 11px;border:1px solid var(--border);border-radius:var(--r);background:var(--bg3);font-size:.75rem;line-height:1.45;}
      .fm-night-preview b{color:var(--text);}
      .fm-night-preview span{color:var(--muted);}
      .fm-money-wrap{position:relative;}
      .fm-money-prefix{position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--muted);pointer-events:none;font-size:.8rem;}
      .fm-money-wrap input{padding-left:26px!important;}
      .fm-money-wrap.is-courtesy .fm-money-prefix{display:none;}
      .fm-money-wrap.is-courtesy input{padding-left:10px!important;color:var(--morado);font-weight:700;}
      .fm-destructive{z-index:2400;opacity:1;pointer-events:auto;transition:opacity .12s;}
      .fm-destructive .mb{max-width:460px;overflow:hidden;}
      .fm-destructive-detail{padding:10px 11px;margin:12px 0;border:1px solid var(--border);border-radius:var(--r);background:var(--bg3);font-size:.76rem;line-height:1.45;}
      .fm-destructive-warning{color:var(--rojo2);font-size:.72rem;line-height:1.45;margin-top:8px;}
      @media(max-width:600px){
        .fm-host{padding:0;align-items:stretch;}
        .fm-host .fm-modal{height:100dvh;max-height:100dvh;max-width:none;border-radius:0;border-left:0;border-right:0;}
        .fm-host .mh{padding:10px 14px;}
        .fm-progress-shell{padding:9px 14px 10px;}
        .fm-progress-meta{margin-bottom:7px;}
        .fm-step-btn{min-width:92px;flex:0 0 92px;padding:7px;}
        .fm-host .fm-body{padding:16px 14px 22px;}
        .fm-question{font-size:1.4rem;}
        .fm-foot{padding:10px 12px calc(10px + env(safe-area-inset-bottom));align-items:stretch;}
        .fm-foot-left{flex:1;}
        .fm-foot-right{flex:1;justify-content:flex-end;}
        .fm-foot .btn{padding:8px 11px;}
        .fm-save-draft{width:100%;}
        .fm-summary-row{grid-template-columns:1fr;gap:3px;}
        .fm-summary-row dd{text-align:left;}
        .fm-unsaved{padding:14px;}
        .fm-unsaved-actions{display:grid;grid-template-columns:1fr;}
      }
      .fm-mobile-demo.fm-host{padding:0;align-items:stretch;position:absolute;}
      .fm-mobile-demo.fm-host .fm-modal{height:100%;max-height:none;max-width:none;border-radius:0;border:0;}
      .fm-mobile-demo.fm-host .mh{padding:10px 14px;}
      .fm-mobile-demo .fm-progress-shell{padding:9px 14px 10px;}
      .fm-mobile-demo .fm-step-btn{min-width:92px;flex:0 0 92px;padding:7px;}
      .fm-mobile-demo.fm-host .fm-body{padding:16px 14px 22px;}
      .fm-mobile-demo .fm-question{font-size:1.4rem;}
      .fm-mobile-demo .fm-foot{padding:10px 12px;align-items:stretch;}
      .fm-mobile-demo .fm-foot-left{flex:1;}
      .fm-mobile-demo .fm-foot-right{flex:1;justify-content:flex-end;}
      .fm-mobile-demo .fm-foot .btn{padding:8px 11px;}
      .fm-mobile-demo .fm-save-draft{width:100%;}
      .fm-mobile-demo .fm-summary-row{grid-template-columns:1fr;gap:3px;}
      .fm-mobile-demo .fm-summary-row dd{text-align:left;}
      @media(prefers-reduced-motion:reduce){.fm-host,.fm-step-btn,.fm-destructive{transition:none!important;}}
    `;
    document.head.appendChild(style);
  }

  function el(ref) {
    return typeof ref === 'string' ? document.getElementById(ref.replace(/^#/, '')) : ref;
  }

  function texto(v) {
    return String(v == null ? '' : v);
  }

  function escapeHtml(v) {
    return texto(v).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
  }

  function etiquetaCampo(input) {
    const grupo = input.closest('.fg');
    const label = grupo && grupo.querySelector('label');
    return label ? label.textContent.replace(/— obligatorio/gi, '').trim() : 'este dato';
  }

  class ControladorModal {
    constructor(root, opciones) {
      instalarEstilos();
      this.root = root;
      this.opciones = opciones || {};
      this.box = root.querySelector('.mb');
      this.header = root.querySelector('.mh');
      this.body = root.querySelector('.mbody');
      if (!this.box || !this.header || !this.body) throw new Error('El modal necesita .mb, .mh y .mbody');

      this.root.classList.add('fm-host');
      this.box.classList.add('fm-modal');
      this.body.classList.add('fm-body');
      if (root.hasAttribute('data-fm-mobile')) this.root.classList.add('fm-mobile-demo');

      this.panels = Array.from(this.body.querySelectorAll('[data-fm-step]'));
      if (!this.panels.length) throw new Error('Agrega al menos un bloque [data-fm-step]');
      this.pasos = (this.opciones.pasos || this.panels.map((panel, i) => ({
        nombre: panel.dataset.fmLabel || `Paso ${i + 1}`,
        icono: panel.dataset.fmIcon || ''
      }))).map((paso, i) => typeof paso === 'string' ? { nombre: paso, icono:'', i } : { ...paso, i });

      this.paso = Math.max(0, Math.min(this.panels.length - 1, Number(this.opciones.pasoInicial) || 0));
      this.mayorVisitado = this.paso;
      this.puedeBorrador = this.opciones.permiteBorrador !== false && typeof this.opciones.guardarBorrador === 'function';
      this.sucio = false;
      this.ocupado = false;
      this.errorGuardado = '';
      this._armarCabecera();
      this._armarPie();
      this._armarAvisoCierre();
      this._eventos();
      this.render(false);
    }

    _armarCabecera() {
      this.progresoShell = document.createElement('div');
      this.progresoShell.className = 'fm-progress-shell';
      this.progresoShell.innerHTML = '<div class="fm-progress-meta"><b data-fm-current></b><span data-fm-count></span></div><div class="fm-progress" role="tablist" aria-label="Pasos del formulario"></div>';
      this.header.insertAdjacentElement('afterend', this.progresoShell);
      this.progreso = this.progresoShell.querySelector('.fm-progress');

      this.avisoError = document.createElement('div');
      this.avisoError.className = 'fm-save-error';
      this.avisoError.setAttribute('role', 'alert');
      this.avisoError.setAttribute('aria-live', 'assertive');
      this.avisoError.innerHTML = '<span class="fm-save-error-icon">⚠️</span><div><strong>No se pudo guardar</strong><p data-fm-error-text>Tus cambios siguen aquí. Revisa la conexión e inténtalo otra vez.</p></div>';
      this.progresoShell.insertAdjacentElement('afterend', this.avisoError);
    }

    _armarPie() {
      this.footer = this.root.querySelector('.mfoot');
      if (!this.footer) {
        this.footer = document.createElement('div');
        this.footer.className = 'mfoot';
        this.box.appendChild(this.footer);
      }
      this.footer.classList.add('fm-foot');
      this.footer.innerHTML = `
        <div class="fm-foot-left"><button type="button" class="btn btn-g fm-save-draft">Guardar y salir</button></div>
        <div class="fm-foot-right">
          <button type="button" class="btn btn-g fm-back">← Atrás</button>
          <button type="button" class="btn btn-p fm-primary">Siguiente →</button>
        </div>`;
      this.btnBorrador = this.footer.querySelector('.fm-save-draft');
      this.btnAtras = this.footer.querySelector('.fm-back');
      this.btnPrincipal = this.footer.querySelector('.fm-primary');
      if (!this.puedeBorrador) this.btnBorrador.hidden = true;
    }

    _armarAvisoCierre() {
      this.avisoCierre = document.createElement('div');
      this.avisoCierre.className = 'fm-unsaved';
      this.avisoCierre.hidden = true;
      this.avisoCierre.innerHTML = `
        <div class="fm-unsaved-card" role="alertdialog" aria-modal="true" aria-labelledby="fm-unsaved-title-${escapeHtml(this.root.id)}">
          <div class="fm-unsaved-icon">📝</div>
          <h3 id="fm-unsaved-title-${escapeHtml(this.root.id)}">Tienes cambios sin guardar</h3>
          <p>Si sales ahora, perderás lo que cambiaste en este formulario.</p>
          <div class="fm-unsaved-actions">
            <button type="button" class="btn btn-g" data-fm-keep>Seguir editando</button>
            <button type="button" class="btn btn-del" data-fm-discard>Salir sin guardar</button>
            <button type="button" class="btn btn-p" data-fm-save-close>Guardar y salir</button>
          </div>
        </div>`;
      this.box.style.position = 'relative';
      this.box.appendChild(this.avisoCierre);
      if (!this.puedeBorrador) this.avisoCierre.querySelector('[data-fm-save-close]').hidden = true;
    }

    _eventos() {
      this.progreso.addEventListener('click', e => {
        const btn = e.target.closest('[data-fm-go]');
        if (!btn || btn.disabled) return;
        const destino = Number(btn.dataset.fmGo);
        if (destino === this.paso + 1) this.siguiente();
        else this.ir(destino);
      });
      this.btnAtras.addEventListener('click', () => this.ir(this.paso - 1));
      this.btnPrincipal.addEventListener('click', () => this.siguiente());
      this.btnBorrador.addEventListener('click', () => this.guardarBorrador(true));

      this.root.addEventListener('input', e => {
        if (e.target.closest('.fm-unsaved')) return;
        this.marcarSucio();
        this._limpiarErrorCampo(e.target);
      });
      this.root.addEventListener('change', e => {
        if (!e.target.closest('.fm-unsaved')) this.marcarSucio();
      });
      this.root.addEventListener('click', e => {
        const cerrar = e.target.closest('[data-fm-close],.mc');
        if (!cerrar) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        this.solicitarCierre();
      }, true);
      this.root.addEventListener('mousedown', e => {
        if (e.target === this.root) this.solicitarCierre();
      });
      this.root.addEventListener('keydown', e => this._teclado(e));
      this.avisoCierre.querySelector('[data-fm-keep]').addEventListener('click', () => this._ocultarAvisoCierre());
      this.avisoCierre.querySelector('[data-fm-discard]').addEventListener('click', () => {
        this.sucio = false;
        this._ocultarAvisoCierre();
        this.cerrarAhora();
      });
      this.avisoCierre.querySelector('[data-fm-save-close]').addEventListener('click', () => this.guardarBorrador(true));
    }

    _teclado(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (!this.avisoCierre.hidden) this._ocultarAvisoCierre();
        else this.solicitarCierre();
        return;
      }
      if (e.key !== 'Tab') return;
      const visibles = Array.from(this.box.querySelectorAll('button:not([hidden]):not([disabled]),input:not([type="hidden"]):not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')).filter(x => x.offsetParent !== null);
      if (!visibles.length) return;
      const primero = visibles[0], ultimo = visibles[visibles.length - 1];
      if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
    }

    _limpiarErrorCampo(input) {
      if (!input || !input.classList) return;
      input.classList.remove('fm-invalid');
      input.removeAttribute('aria-invalid');
      const err = input.parentElement && input.parentElement.querySelector(`.fm-inline-error[data-for="${CSS.escape(input.id || '')}"]`);
      if (err) err.remove();
    }

    _errorCampo(input, mensaje) {
      input.classList.add('fm-invalid');
      input.setAttribute('aria-invalid', 'true');
      const id = input.id || `fm-field-${Math.random().toString(36).slice(2, 8)}`;
      if (!input.id) input.id = id;
      let err = input.parentElement.querySelector(`.fm-inline-error[data-for="${CSS.escape(id)}"]`);
      if (!err) {
        err = document.createElement('div');
        err.className = 'fm-inline-error';
        err.dataset.for = id;
        input.insertAdjacentElement('afterend', err);
      }
      err.textContent = mensaje;
    }

    async validarPaso() {
      const panel = this.panels[this.paso];
      panel.querySelectorAll('.fm-invalid').forEach(x => this._limpiarErrorCampo(x));
      const faltantes = Array.from(panel.querySelectorAll('[required]')).filter(input => !input.disabled && !input.value.trim());
      faltantes.forEach(input => this._errorCampo(input, `Falta completar ${etiquetaCampo(input).toLowerCase()}.`));
      if (faltantes.length) {
        this._mostrarErrorPanel(`Falta ${faltantes.length === 1 ? 'un dato obligatorio' : `${faltantes.length} datos obligatorios`} antes de seguir.`);
        faltantes[0].focus();
        return false;
      }
      if (typeof this.opciones.validarPaso === 'function') {
        const resultado = await this.opciones.validarPaso(this.paso, panel, this);
        if (resultado !== true && resultado != null) {
          this._mostrarErrorPanel(typeof resultado === 'string' ? resultado : 'Revisa los datos marcados antes de seguir.');
          return false;
        }
        if (resultado === false) return false;
      }
      this._ocultarErrorPanel(panel);
      return true;
    }

    _mostrarErrorPanel(mensaje) {
      const panel = this.panels[this.paso];
      let aviso = panel.querySelector('.fm-panel-error');
      if (!aviso) {
        aviso = document.createElement('div');
        aviso.className = 'fm-panel-error';
        aviso.setAttribute('role', 'alert');
        panel.insertAdjacentElement('afterbegin', aviso);
      }
      aviso.textContent = mensaje;
      aviso.classList.add('is-visible');
    }

    _ocultarErrorPanel(panel) {
      const aviso = (panel || this.panels[this.paso]).querySelector('.fm-panel-error');
      if (aviso) aviso.classList.remove('is-visible');
    }

    async siguiente() {
      if (this.ocupado) return;
      if (this.paso < this.panels.length - 1) {
        if (!await this.validarPaso()) return;
        this.ir(this.paso + 1, true);
        return;
      }
      await this.enviar();
    }

    ir(destino, desdeSiguiente) {
      destino = Math.max(0, Math.min(this.panels.length - 1, Number(destino) || 0));
      if (!desdeSiguiente && destino > this.mayorVisitado) return;
      this.paso = destino;
      this.mayorVisitado = Math.max(this.mayorVisitado, destino);
      this.ocultarError();
      if (destino === this.panels.length - 1 && typeof this.opciones.armarResumen === 'function') {
        this.opciones.armarResumen(this.panels[destino], this);
      }
      this.render(true);
    }

    mostrarPaso(destino) {
      this.paso = Math.max(0, Math.min(this.panels.length - 1, Number(destino) || 0));
      this.mayorVisitado = Math.max(this.mayorVisitado, this.paso);
      if (this.paso === this.panels.length - 1 && typeof this.opciones.armarResumen === 'function') this.opciones.armarResumen(this.panels[this.paso], this);
      this.render(true);
    }

    render(moverFoco) {
      this.panels.forEach((panel, i) => {
        panel.hidden = i !== this.paso;
        panel.setAttribute('role', 'tabpanel');
        panel.setAttribute('aria-hidden', i === this.paso ? 'false' : 'true');
      });
      const ultimo = this.paso === this.panels.length - 1;
      this.progreso.innerHTML = this.pasos.map((p, i) => {
        const listo = i < this.mayorVisitado;
        const activo = i === this.paso;
        const accesible = i <= this.mayorVisitado || i === this.paso + 1;
        return `<button type="button" class="fm-step-btn${listo ? ' is-done' : ''}" data-fm-go="${i}" ${activo ? 'aria-current="step"' : ''} ${accesible ? '' : 'disabled'} title="${escapeHtml(p.nombre)}"><span class="fm-step-number">${listo ? '✓' : escapeHtml(p.icono || (i + 1))}</span><span class="fm-step-name">${escapeHtml(p.nombre)}</span></button>`;
      }).join('');
      this.progresoShell.querySelector('[data-fm-current]').textContent = this.pasos[this.paso].nombre;
      this.progresoShell.querySelector('[data-fm-count]').textContent = `Paso ${this.paso + 1} de ${this.panels.length}`;
      this.btnAtras.hidden = this.paso === 0;
      this.btnPrincipal.textContent = ultimo ? (this.errorGuardado ? (this.opciones.etiquetaReintentar || 'Reintentar') : (this.opciones.etiquetaFinal || 'Publicar')) : (this.opciones.etiquetaSiguiente || 'Siguiente →');
      this.btnPrincipal.setAttribute('aria-busy', this.ocupado ? 'true' : 'false');
      this.btnPrincipal.disabled = this.ocupado;
      this.btnAtras.disabled = this.ocupado;
      this.btnBorrador.disabled = this.ocupado;
      requestAnimationFrame(() => {
        const activo = this.progreso.querySelector('[aria-current="step"]');
        if (activo) this.progreso.scrollTo({ left: activo.offsetLeft - (this.progreso.clientWidth - activo.offsetWidth) / 2, behavior: 'smooth' });
        this.body.scrollTop = 0;
        if (moverFoco) {
          const titulo = this.panels[this.paso].querySelector('.fm-question');
          if (titulo) { titulo.tabIndex = -1; titulo.focus({ preventScroll:true }); }
        }
      });
    }

    marcarSucio(valor) {
      this.sucio = valor !== false;
      this.root.dataset.fmDirty = this.sucio ? 'true' : 'false';
    }

    marcarLimpio() {
      this.marcarSucio(false);
    }

    mostrarError(error) {
      const msg = texto(error && (error.message || error)).trim() || 'La base rechazó el guardado.';
      this.errorGuardado = msg;
      this.avisoError.querySelector('[data-fm-error-text]').innerHTML = `${escapeHtml(msg)} <code>· Tus cambios siguen aquí.</code>`;
      this.avisoError.classList.add('is-visible');
      this.render(false);
      this.avisoError.scrollIntoView({ block:'nearest' });
    }

    ocultarError() {
      this.errorGuardado = '';
      this.avisoError.classList.remove('is-visible');
    }

    async enviar() {
      if (!await this.validarPaso()) return;
      this.ocupado = true;
      this.render(false);
      this.btnPrincipal.textContent = this.opciones.etiquetaGuardando || 'Publicando…';
      try {
        if (typeof this.opciones.enviar !== 'function') throw new Error('Este modal todavía no tiene una acción de guardado conectada.');
        await this.opciones.enviar(this);
        this.marcarLimpio();
        this.ocultarError();
        if (typeof this.opciones.alGuardar === 'function') this.opciones.alGuardar(this);
        if (this.opciones.cerrarAlGuardar !== false) this.cerrarAhora();
      } catch (error) {
        this.mostrarError(error);
        if (typeof this.opciones.alError === 'function') this.opciones.alError(error, this);
      } finally {
        this.ocupado = false;
        this.render(false);
      }
    }

    async guardarBorrador(cerrar) {
      if (this.ocupado) return;
      if (!this.puedeBorrador) {
        this.mostrarError(new Error('Este modal todavía no tiene guardado de borrador conectado.'));
        return;
      }
      this.ocupado = true;
      this.render(false);
      const original = this.btnBorrador.textContent;
      this.btnBorrador.textContent = 'Guardando…';
      try {
        await this.opciones.guardarBorrador(this);
        this.marcarLimpio();
        this.ocultarError();
        this._ocultarAvisoCierre();
        if (typeof this.opciones.alGuardarBorrador === 'function') this.opciones.alGuardarBorrador(this);
        if (cerrar !== false) this.cerrarAhora();
      } catch (error) {
        this._ocultarAvisoCierre();
        this.mostrarError(error);
      } finally {
        this.ocupado = false;
        this.btnBorrador.textContent = original;
        this.render(false);
      }
    }

    solicitarCierre() {
      if (!this.sucio) { this.cerrarAhora(); return; }
      this.avisoCierre.hidden = false;
      const foco = this.avisoCierre.querySelector('[data-fm-keep]');
      requestAnimationFrame(() => foco.focus());
    }

    _ocultarAvisoCierre() {
      this.avisoCierre.hidden = true;
      const cerrar = this.header.querySelector('.mc');
      if (cerrar) cerrar.focus();
    }

    abrir() {
      this.root.classList.add('open');
      this.root.setAttribute('aria-hidden', 'false');
      requestAnimationFrame(() => {
        const foco = this.panels[this.paso].querySelector('input:not([type="hidden"]),select,textarea,button') || this.header.querySelector('.mc');
        if (foco) foco.focus();
      });
      if (typeof this.opciones.alAbrir === 'function') this.opciones.alAbrir(this);
    }

    cerrarAhora() {
      this.root.classList.remove('open');
      this.root.setAttribute('aria-hidden', 'true');
      if (typeof this.opciones.alCerrar === 'function') this.opciones.alCerrar(this);
    }
  }

  function registrar(ref, opciones) {
    const root = el(ref);
    if (!root) throw new Error(`No existe el modal ${ref}`);
    if (instancias.has(root.id)) return instancias.get(root.id);
    const control = new ControladorModal(root, opciones || {});
    instancias.set(root.id, control);
    return control;
  }

  function obtener(ref) {
    const root = el(ref);
    return root ? instancias.get(root.id) : undefined;
  }

  function clp(valor, clase) {
    if (clase === 'cortesia' || valor == null) return 'Cortesía';
    const n = Number(valor);
    if (!Number.isFinite(n)) return '—';
    return '$' + Math.round(n).toLocaleString('es-CL');
  }

  function enlazarDinero(inputRef, opciones) {
    instalarEstilos();
    const input = el(inputRef);
    if (!input) throw new Error('No se encontró el campo de dinero');
    const opts = opciones || {};
    const wrap = document.createElement('div');
    wrap.className = 'fm-money-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    const prefijo = document.createElement('span');
    prefijo.className = 'fm-money-prefix';
    prefijo.textContent = '$';
    wrap.insertBefore(prefijo, input);
    input.type = 'text';
    input.inputMode = 'numeric';
    let ultimo = texto(input.value).replace(/\D/g, '');
    let clase = '';

    const formatear = () => {
      if (clase === 'cortesia') return;
      const digitos = texto(input.value).replace(/\D/g, '');
      ultimo = digitos;
      input.value = digitos ? Number(digitos).toLocaleString('es-CL') : '';
    };
    const setClase = nueva => {
      clase = nueva || '';
      const cortesia = clase === 'cortesia';
      wrap.classList.toggle('is-courtesy', cortesia);
      input.readOnly = cortesia;
      input.value = cortesia ? 'Cortesía' : (ultimo ? Number(ultimo).toLocaleString('es-CL') : '');
      input.setAttribute('aria-label', cortesia ? 'Precio: Cortesía' : (opts.etiqueta || 'Precio en pesos chilenos'));
    };
    input.addEventListener('input', formatear);
    input.addEventListener('blur', formatear);
    if (opts.clase) {
      const claseEl = el(opts.clase);
      if (claseEl) {
        claseEl.addEventListener('change', () => setClase(claseEl.value));
        setClase(claseEl.value);
      }
    } else setClase(opts.valorClase || '');
    return {
      valor: () => clase === 'cortesia' ? null : (ultimo === '' ? null : Number(ultimo)),
      clase: () => clase,
      setClase,
      formatear
    };
  }

  function noche(fecha, inicio, termino) {
    const base = /^\d{4}-\d{2}-\d{2}$/.test(texto(fecha)) ? fecha.split('-').map(Number) : null;
    const hi = /^(\d{1,2}):(\d{2})$/.exec(texto(inicio));
    const ht = /^(\d{1,2}):(\d{2})$/.exec(texto(termino));
    if (!base || !hi || !ht) return null;
    const inicioDate = new Date(base[0], base[1] - 1, base[2], Number(hi[1]), Number(hi[2]));
    const finDate = new Date(base[0], base[1] - 1, base[2], Number(ht[1]), Number(ht[2]));
    const minInicio = Number(hi[1]) * 60 + Number(hi[2]);
    const minFin = Number(ht[1]) * 60 + Number(ht[2]);
    if (minFin <= minInicio) finDate.setDate(finDate.getDate() + 1);
    const fmtDia = new Intl.DateTimeFormat('es-CL', { weekday:'short', day:'numeric', month:'short' });
    const fmtHora = new Intl.DateTimeFormat('es-CL', { hour:'2-digit', minute:'2-digit', hour12:false });
    return {
      fechaPublicada: fecha,
      inicio: inicioDate,
      termino: finDate,
      cruzaMedianoche: finDate.getDate() !== inicioDate.getDate(),
      texto: `${fmtDia.format(inicioDate)}, ${fmtHora.format(inicioDate)} → ${fmtDia.format(finDate)}, ${fmtHora.format(finDate)}`
    };
  }

  function enlazarBuscadorPersona(contenedorRef, opciones) {
    instalarEstilos();
    const contenedor = el(contenedorRef);
    const opts = opciones || {};
    const input = contenedor && contenedor.querySelector('[data-fm-person-input]');
    const resultados = contenedor && contenedor.querySelector('[data-fm-person-results]');
    const seleccionado = contenedor && contenedor.querySelector('[data-fm-person-selected]');
    if (!contenedor || !input || !resultados || !seleccionado) throw new Error('El buscador necesita input, resultados y selección');
    contenedor.classList.add('fm-person-search');
    resultados.classList.add('fm-person-results');
    seleccionado.classList.add('fm-person-selected');
    let timer = null, datos = [], actual = null, indice = -1, corrida = 0;

    const iniciales = nombre => texto(nombre).trim().split(/\s+/).slice(0, 2).map(x => x[0] || '').join('').toUpperCase();
    const cerrar = () => { resultados.classList.remove('is-visible'); indice = -1; };
    const pintar = () => {
      resultados.innerHTML = '';
      if (!datos.length) {
        const vacio = document.createElement('div');
        vacio.className = 'fm-person-empty';
        vacio.textContent = 'No encontramos a nadie. Puedes ingresar los datos a mano.';
        resultados.appendChild(vacio);
      } else datos.forEach((p, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'fm-person-result' + (i === indice ? ' is-active' : '');
        btn.innerHTML = `<span class="fm-person-avatar">${escapeHtml(iniciales(p.nombre))}</span><span class="fm-person-main"><span class="fm-person-name">${escapeHtml(p.nombre || 'Sin nombre')}</span><span class="fm-person-meta">${escapeHtml([p.rut, p.email, p.telefono].filter(Boolean).join(' · '))}</span></span>`;
        btn.addEventListener('click', () => elegir(p));
        resultados.appendChild(btn);
      });
      resultados.classList.add('is-visible');
    };
    const elegir = p => {
      actual = p;
      seleccionado.innerHTML = `<span class="fm-person-avatar">${escapeHtml(iniciales(p.nombre))}</span><span class="fm-person-main"><span class="fm-person-name">${escapeHtml(p.nombre || 'Sin nombre')}</span><span class="fm-person-meta">${escapeHtml([p.rut, p.email, p.telefono].filter(Boolean).join(' · '))}</span></span><button type="button" class="fm-person-clear">Cambiar</button>`;
      seleccionado.classList.add('is-visible');
      input.value = p.nombre || '';
      cerrar();
      seleccionado.querySelector('.fm-person-clear').addEventListener('click', limpiar);
      if (typeof opts.alElegir === 'function') opts.alElegir(p);
    };
    const limpiar = () => {
      actual = null;
      seleccionado.classList.remove('is-visible');
      seleccionado.innerHTML = '';
      input.value = '';
      input.focus();
      if (typeof opts.alLimpiar === 'function') opts.alLimpiar();
    };
    input.addEventListener('input', () => {
      clearTimeout(timer);
      const q = input.value.trim();
      if (q.length < (opts.minimo || 2)) { cerrar(); return; }
      resultados.innerHTML = '<div class="fm-person-empty">Buscando…</div>';
      resultados.classList.add('is-visible');
      const estaCorrida = ++corrida;
      timer = setTimeout(async () => {
        try {
          datos = typeof opts.buscar === 'function' ? (await opts.buscar(q) || []) : [];
          if (estaCorrida !== corrida) return;
          indice = datos.length ? 0 : -1;
          pintar();
        } catch (_) {
          if (estaCorrida !== corrida) return;
          datos = [];
          resultados.innerHTML = '<div class="fm-person-empty" style="color:var(--rojo2)">No pudimos buscar ahora. Inténtalo otra vez.</div>';
        }
      }, opts.espera == null ? 220 : opts.espera);
    });
    input.addEventListener('keydown', e => {
      if (!resultados.classList.contains('is-visible')) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); indice = Math.min(datos.length - 1, indice + 1); pintar(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); indice = Math.max(0, indice - 1); pintar(); }
      else if (e.key === 'Enter' && datos[indice]) { e.preventDefault(); elegir(datos[indice]); }
      else if (e.key === 'Escape') cerrar();
    });
    document.addEventListener('mousedown', e => { if (!contenedor.contains(e.target)) cerrar(); });
    return { valor: () => actual, elegir, limpiar };
  }

  function confirmarDestructivo(opciones) {
    instalarEstilos();
    const opts = opciones || {};
    return new Promise(resolve => {
      const root = document.createElement('div');
      root.className = 'mo open fm-destructive';
      root.innerHTML = `<div class="mb" role="alertdialog" aria-modal="true" aria-labelledby="fm-destr-title"><div class="mh"><span class="mht" id="fm-destr-title">${escapeHtml(opts.titulo || 'Confirmar acción')}</span><button type="button" class="mc" data-cancel aria-label="Cerrar">✕</button></div><div class="mbody"><p style="font-size:.82rem;line-height:1.55;color:var(--muted);margin:0">${escapeHtml(opts.mensaje || 'Revisa bien antes de continuar.')}</p>${opts.detalle ? `<div class="fm-destructive-detail">${escapeHtml(opts.detalle)}</div>` : ''}<p class="fm-destructive-warning">⚠️ ${escapeHtml(opts.aviso || 'Esta acción no se puede deshacer.')}</p>${opts.textoRequerido ? `<div class="fg" style="margin-top:12px"><label>Escribe ${escapeHtml(opts.textoRequerido)} para confirmar</label><input type="text" data-confirm-text autocomplete="off"></div>` : ''}</div><div class="mfoot"><button type="button" class="btn btn-g" data-cancel>Volver</button><button type="button" class="btn btn-del" data-confirm ${opts.textoRequerido ? 'disabled' : ''}>${escapeHtml(opts.etiqueta || 'Confirmar')}</button></div></div>`;
      document.body.appendChild(root);
      const input = root.querySelector('[data-confirm-text]');
      const confirmar = root.querySelector('[data-confirm]');
      const terminar = valor => { root.remove(); resolve(valor); };
      root.querySelectorAll('[data-cancel]').forEach(x => x.addEventListener('click', () => terminar(false)));
      root.addEventListener('mousedown', e => { if (e.target === root) terminar(false); });
      root.addEventListener('keydown', e => { if (e.key === 'Escape') terminar(false); });
      if (input) input.addEventListener('input', () => { confirmar.disabled = input.value.trim() !== opts.textoRequerido; });
      confirmar.addEventListener('click', () => terminar(true));
      requestAnimationFrame(() => (input || root.querySelector('[data-cancel]')).focus());
    });
  }

  instalarEstilos();
  global.FrateModal = {
    registrar,
    obtener,
    abrir: ref => { const x = obtener(ref); if (x) x.abrir(); },
    cerrar: ref => { const x = obtener(ref); if (x) x.solicitarCierre(); },
    clp,
    noche,
    patrones: {
      dinero: enlazarDinero,
      persona: enlazarBuscadorPersona,
      confirmarDestructivo
    }
  };
})(window);
