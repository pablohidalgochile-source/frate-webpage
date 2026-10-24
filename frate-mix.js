// ============================================================
// FRATE — MIX de la casa 🎵 (player de fondo configurable)
// Al entrar pregunta "¿con o sin música?" (obligatorio por la
// política de autoplay: el audio arranca tras el clic del usuario).
// Fuente configurable desde el admin: link de YouTube o MP3 subido.
// Config (config_valores): mix_on, mix_fuente, mix_youtube, mix_mp3, mix_nombre.
// ============================================================
(function () {
  'use strict';
  if (typeof sb === 'undefined') return;

  var cfg = {}, player = null, audio = null, playing = false, mini = null;
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function _mixYtId(u){ var m=String(u||'').match(/(?:v=|youtu\.be\/|embed\/|list=)([A-Za-z0-9_-]{11})/); return m?m[1]:''; }

  async function init() {
    try {
      var { data } = await sb.from('config_valores').select('clave,valor').in('clave', ['mix_on','mix_fuente','mix_youtube','mix_mp3','mix_nombre']);
      var m = new Map((data || []).map(function (x) { return [x.clave, x.valor]; }));
      cfg.on = m.get('mix_on') === '1';
      cfg.fuente = m.get('mix_fuente') || 'youtube';
      cfg.youtube = m.get('mix_youtube') || '';
      cfg.mp3 = m.get('mix_mp3') || '';
      cfg.nombre = m.get('mix_nombre') || 'FRATE Mix';
      if (!cfg.on) return;
      // Usa la fuente elegida; si está vacía, cae a la otra que sí tenga contenido.
      if (cfg.fuente === 'mp3' && !cfg.mp3 && cfg.youtube) cfg.fuente = 'youtube';
      else if (cfg.fuente !== 'mp3' && !cfg.youtube && cfg.mp3) cfg.fuente = 'mp3';
      cfg.src = cfg.fuente === 'mp3' ? cfg.mp3 : cfg.youtube;
      if (!cfg.src) { try { console.warn('[frate-mix] activado pero SIN fuente (MP3 y YouTube vacíos) — configúralo en el admin'); } catch (e) {} return; }
      montarMini();
      var choice = null; try { choice = sessionStorage.getItem('frate_mix_choice'); } catch (e) {}
      if (choice === 'on') empezar();
      else if (choice !== 'off') promptEntrada();
    } catch (e) {}
  }

  function promptEntrada() {
    if (document.getElementById('frate-mix-prompt')) return;
    var ov = document.createElement('div'); ov.id = 'frate-mix-prompt';
    ov.style.cssText = 'position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;background:rgba(5,5,6,.74);backdrop-filter:blur(5px);padding:20px;';
    ov.innerHTML = '<div style="background:#121216;border:1px solid rgba(255,255,255,.12);border-radius:22px;padding:28px 26px;max-width:340px;width:100%;text-align:center;font-family:sans-serif;box-shadow:0 30px 80px rgba(0,0,0,.65);">'
      + '<div style="font-size:34px;line-height:1;">🎧</div>'
      + '<div style="color:#fff;font-weight:800;font-size:1.25rem;margin:10px 0 3px;">' + esc(cfg.nombre) + '</div>'
      + '<div style="color:#a1a1aa;font-size:.88rem;margin-bottom:20px;">¿Quieres entrar con la música sonando?</div>'
      + '<div style="display:flex;gap:10px;">'
      + '<button id="fmix-yes" style="flex:1;background:#E8363D;color:#fff;border:none;border-radius:11px;padding:13px;font-weight:800;font-size:.92rem;cursor:pointer;">🔊 Sí, con música</button>'
      + '<button id="fmix-no" style="flex:1;background:transparent;color:#e5e5ea;border:1px solid rgba(255,255,255,.18);border-radius:11px;padding:13px;font-weight:700;font-size:.92rem;cursor:pointer;">🔇 Sin música</button>'
      + '</div></div>';
    document.body.appendChild(ov);
    ov.querySelector('#fmix-yes').onclick = function () { try { sessionStorage.setItem('frate_mix_choice', 'on'); } catch (e) {} ov.remove(); empezar(); };
    ov.querySelector('#fmix-no').onclick  = function () { try { sessionStorage.setItem('frate_mix_choice', 'off'); } catch (e) {} ov.remove(); };
  }

  function empezar() { if (cfg.fuente === 'mp3') empezarMp3(); else empezarYt(); }

  function empezarMp3() {
    try {
      if (!audio) { audio = new Audio(cfg.src); audio.loop = true; audio.volume = 0.55; }
      audio.play().then(function () { playing = true; syncMini(); }).catch(function () { playing = false; syncMini(); });
      audio.onplay = function(){ playing = true; syncMini(); };
      audio.onpause = function(){ playing = false; syncMini(); };
    } catch (e) {}
  }

  function loadYtApi(cb) {
    if (window.YT && window.YT.Player) return cb();
    var prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = function () { if (typeof prev === 'function') { try { prev(); } catch (e) {} } cb(); };
    if (!document.getElementById('yt-iframe-api')) { var t = document.createElement('script'); t.id = 'yt-iframe-api'; t.src = 'https://www.youtube.com/iframe_api'; document.head.appendChild(t); }
  }

  function empezarYt() {
    var vid = _mixYtId(cfg.youtube); if (!vid) return;
    loadYtApi(function () {
      if (player) { try { player.unMute(); player.playVideo(); } catch (e) {} return; }
      var host = document.createElement('div'); host.id = 'fmix-yt';
      host.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:2px;height:2px;opacity:0;pointer-events:none;';
      document.body.appendChild(host);
      player = new YT.Player('fmix-yt', {
        videoId: vid, width: '2', height: '2',
        playerVars: { autoplay: 1, controls: 0, loop: 1, playlist: vid, playsinline: 1, rel: 0, iv_load_policy: 3 },
        events: {
          onReady: function (e) { try { e.target.unMute(); e.target.setVolume(55); e.target.playVideo(); playing = true; syncMini(); } catch (_) {} },
          onStateChange: function (e) { playing = (e.data === 1); syncMini(); }
        }
      });
    });
  }

  function toggle() {
    if (cfg.fuente === 'mp3') {
      if (!audio) { empezarMp3(); return; }
      if (playing) audio.pause(); else audio.play().catch(function () {});
    } else {
      if (!player) { empezarYt(); return; }
      try { if (playing) player.pauseVideo(); else { player.unMute(); player.playVideo(); } } catch (e) {}
    }
  }

  function montarMini() {
    if (document.getElementById('frate-mix-mini')) return;
    mini = document.createElement('div'); mini.id = 'frate-mix-mini';
    mini.style.cssText = 'position:fixed;right:16px;bottom:90px;z-index:9500;display:flex;align-items:center;gap:9px;'
      + 'background:rgba(18,18,22,.92);border:1px solid rgba(255,255,255,.13);border-radius:99px;padding:7px 14px 7px 9px;'
      + 'box-shadow:0 12px 30px rgba(0,0,0,.5);cursor:pointer;font-family:sans-serif;backdrop-filter:blur(6px);max-width:200px;';
    mini.innerHTML = '<span id="fmix-ico" style="width:30px;height:30px;border-radius:99px;background:#E8363D;color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0;">▶</span>'
      + '<span style="min-width:0;"><span style="display:block;font-size:8px;letter-spacing:1.5px;text-transform:uppercase;color:#8a8a92;">Sonando</span>'
      + '<span id="fmix-name" style="display:block;font-size:12.5px;font-weight:700;color:#f0ede8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(cfg.nombre) + '</span></span>';
    mini.onclick = toggle;
    document.body.appendChild(mini);
    syncMini();
  }
  function syncMini() {
    var ico = document.getElementById('fmix-ico'); if (ico) ico.textContent = playing ? '❚❚' : '▶';
    var eq = document.getElementById('fmix-mini'); if (eq) eq.style.borderColor = playing ? 'rgba(232,54,61,.55)' : 'rgba(255,255,255,.13)';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
