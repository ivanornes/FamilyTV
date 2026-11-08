/*
 * Modo lámpara: la tele como luz cálida y tenue para leer en el salón.
 *
 * Mando:  ▲▼ intensidad · ◀▶ calidez (1800–3500 K) · OK forma (completa / halo)
 *         amarillo = temporizador (off/15/30/45/60 min) · Atrás = salir
 *
 * Sin componente azul: el color sale de la curva de cuerpo negro (temperatura de
 * color en kelvin), como una bombilla incandescente. Sin parpadeo (malo para leer).
 */
(function (global) {
  'use strict';

  var LS = 'lamp.settings';
  var KMIN = 1800, KMAX = 3500;
  var TIMERS = [0, 15, 30, 45, 60];
  var defaults = { level: 0.45, kelvin: 2400, shape: 'full', timer: 0 };

  var s = load(), el = null, info = null, infoT = null, timerEnd = 0, timerTick = null, fadeT = null, active = false;

  function load() {
    try { var x = JSON.parse(localStorage.getItem(LS)); if (x) { return Object.assign({}, defaults, x, { timer: 0 }); } } catch (e) {}
    return Object.assign({}, defaults);
  }
  function save() { try { localStorage.setItem(LS, JSON.stringify(s)); } catch (e) {} }

  // Aproximación de Tanner Helland (cuerpo negro → sRGB)
  function kelvinRGB(k) {
    var t = k / 100, r, g, b;
    r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    b = t >= 66 ? 255 : (t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307);
    var c = function (v) { return Math.max(0, Math.min(255, Math.round(v))); };
    return [c(r), c(g), c(b)];
  }

  function color(level) {
    var rgb = kelvinRGB(s.kelvin);
    var f = Math.pow(level, 1 / 2.2);          // escala perceptual
    return 'rgb(' + rgb.map(function (v) { return Math.round(v * f); }).join(',') + ')';
  }

  function paint() {
    var c = color(s.level);
    if (s.shape === 'halo') {
      // Centro oscuro, luz en bordes y abajo: ilumina pared y sala sin "pantalla encendida" de frente.
      el.style.background =
        'radial-gradient(ellipse 62% 55% at 50% 42%, #000 0%, #000 38%, ' + c + ' 100%),' +
        'linear-gradient(0deg, ' + c + ' 0%, transparent 35%)';
      el.style.backgroundBlendMode = 'screen';
    } else {
      // Campo casi uniforme con viñeta muy suave: más luz útil para leer.
      el.style.background = 'radial-gradient(ellipse 85% 85% at 50% 55%, ' + c + ' 55%, ' + color(s.level * 0.82) + ' 100%)';
      el.style.backgroundBlendMode = 'normal';
    }
  }

  function showInfo() {
    var name = s.kelvin <= 2000 ? 'Vela' : s.kelvin <= 2600 ? 'Cálida' : s.kelvin <= 3000 ? 'Lectura' : 'Neutra cálida';
    var timer = timerEnd ? ' · se apaga en ' + Math.max(1, Math.ceil((timerEnd - Date.now()) / 60000)) + ' min' : '';
    info.textContent = name + ' · ' + s.kelvin + ' K · ' + Math.round(s.level * 100) + '%' +
      (s.shape === 'halo' ? ' · halo' : '') + timer;
    info.classList.add('show');
    clearTimeout(infoT);
    infoT = setTimeout(function () { info.classList.remove('show'); }, 2600);
  }

  function screensaver(on) {
    // API de producto Samsung (webapis.js). Sin ella, la tele podría poner su salvapantallas.
    try {
      var ac = global.webapis && global.webapis.appcommon;
      if (ac) { ac.setScreenSaver(on ? ac.AppCommonScreenSaverState.SCREEN_SAVER_ON : ac.AppCommonScreenSaverState.SCREEN_SAVER_OFF); }
    } catch (e) { /* navegador */ }
  }

  function setTimer(min) {
    s.timer = min;
    clearInterval(timerTick); clearTimeout(fadeT);
    el.classList.remove('fading', 'off');
    timerEnd = min ? Date.now() + min * 60000 : 0;
    if (min) {
      timerTick = setInterval(function () {
        if (Date.now() >= timerEnd - 60000 && !el.classList.contains('fading')) {
          el.classList.add('fading');                 // último minuto: fundido a negro
          fadeT = setTimeout(function () { el.classList.add('off'); screensaver(true); }, 60000);
        }
      }, 5000);
    }
  }

  function open() {
    el = el || document.getElementById('lamp');
    info = info || document.getElementById('lamp-info');
    active = true;
    document.body.classList.add('lamp-on');
    el.classList.remove('fading', 'off');
    paint(); screensaver(false); showInfo();
  }

  function close() {
    active = false;
    setTimer(0);
    document.body.classList.remove('lamp-on');
    screensaver(true);
  }

  // Devuelve true si consumió la tecla.
  function key(code, KEY) {
    if (!active) { return false; }
    if (el.classList.contains('off') && code !== KEY.BACK) { el.classList.remove('fading', 'off'); setTimer(0); paint(); showInfo(); return true; }
    switch (code) {
      case KEY.UP:    s.level = Math.min(1, Math.round((s.level + 0.05) * 100) / 100); break;
      case KEY.DOWN:  s.level = Math.max(0.05, Math.round((s.level - 0.05) * 100) / 100); break;
      case KEY.RIGHT: s.kelvin = Math.min(KMAX, s.kelvin + 100); break;   // más neutra
      case KEY.LEFT:  s.kelvin = Math.max(KMIN, s.kelvin - 100); break;   // más cálida
      case KEY.ENTER: s.shape = s.shape === 'full' ? 'halo' : 'full'; break;
      case KEY.YELLOW: setTimer(TIMERS[(TIMERS.indexOf(s.timer) + 1) % TIMERS.length]); break;
      case KEY.BACK:  close(); return true;
      default: return true;   // en modo lámpara se ignora el resto
    }
    save(); paint(); showInfo();
    return true;
  }

  global.Lamp = { open: open, close: close, key: key, isOpen: function () { return active; }, kelvinRGB: kelvinRGB };
})(window);
