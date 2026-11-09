/*
 * Pronóstico del tiempo para vestir a los críos (Open-Meteo: gratis, sin clave).
 *
 *   Weather.start(onChange)  descarga ya y cada 30 min; llama a onChange al llegar datos
 *   Weather.forDay(date)     -> { code, icon, max, min, rain, atLeave, clothes } | null
 *
 * "rain" es la probabilidad máxima de lluvia entre las 7 y las 20 h (lo que pilla
 * a los críos), no la del día completo. "atLeave" es la temperatura a la hora de
 * salir de casa (departure.leave): es la que decide la ropa.
 * Se guarda la última respuesta para que sin red se siga viendo algo.
 */
(function (global) {
  'use strict';

  var cfg = global.APP_CONFIG;
  var wcfg = cfg.weather || {};
  var LS = 'weather.cache';
  var data = null;
  var listener = null;

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  function url() {
    return 'https://api.open-meteo.com/v1/forecast' +
      '?latitude=' + wcfg.lat + '&longitude=' + wcfg.lon +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min' +
      '&hourly=temperature_2m,precipitation_probability' +
      '&timezone=auto&forecast_days=3';
  }

  function load() {
    try { data = JSON.parse(localStorage.getItem(LS) || 'null'); } catch (e) { data = null; }
  }

  function refresh() {
    if (!wcfg.enabled) { return; }
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url(), true);
    xhr.timeout = 10000;
    xhr.onload = function () {
      if (xhr.status !== 200) { console.warn('Tiempo: HTTP ' + xhr.status); return; }
      try {
        var json = JSON.parse(xhr.responseText);
        if (!json.daily || !json.hourly) { return; }
        data = { at: Date.now(), daily: json.daily, hourly: json.hourly };
        try { localStorage.setItem(LS, JSON.stringify(data)); } catch (e) { /* lleno */ }
        if (listener) { listener(); }
      } catch (e) { console.warn('Tiempo: respuesta no válida', e); }
    };
    xhr.onerror = function () { console.warn('Tiempo: sin red'); };
    xhr.send();
  }

  // Códigos WMO → emoji.
  function icon(code) {
    if (code === 0) { return '☀️'; }
    if (code <= 2) { return '🌤️'; }
    if (code === 3) { return '☁️'; }
    if (code === 45 || code === 48) { return '🌫️'; }
    if (code >= 51 && code <= 57) { return '🌦️'; }
    if (code >= 61 && code <= 67) { return '🌧️'; }
    if (code >= 71 && code <= 77) { return '🌨️'; }
    if (code >= 80 && code <= 82) { return '🌧️'; }
    if (code >= 85 && code <= 86) { return '🌨️'; }
    if (code >= 95) { return '⛈️'; }
    return '🌡️';
  }

  function clothesFor(temp) {
    var list = wcfg.clothes || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].upTo === undefined || temp <= list[i].upTo) { return list[i]; }
    }
    return null;
  }

  function forDay(date) {
    if (!data) { return null; }
    var key = ymd(date);
    var i = data.daily.time.indexOf(key);
    if (i < 0) { return null; }

    var leaveH = Number(((cfg.departure && cfg.departure.leave) || '08:30').split(':')[0]);
    var atLeave = null, rain = 0;
    var times = data.hourly.time;
    for (var h = 0; h < times.length; h++) {
      if (times[h].indexOf(key) !== 0) { continue; }
      var hour = Number(times[h].substr(11, 2));
      if (hour === leaveH) { atLeave = data.hourly.temperature_2m[h]; }
      if (hour >= 7 && hour <= 20) { rain = Math.max(rain, data.hourly.precipitation_probability[h] || 0); }
    }
    var max = Math.round(data.daily.temperature_2m_max[i]);
    var min = Math.round(data.daily.temperature_2m_min[i]);
    var code = data.daily.weather_code[i];
    var ref = atLeave === null ? min : atLeave;
    return {
      code: code,
      icon: icon(code),
      max: max,
      min: min,
      rain: rain,
      rainy: rain >= (wcfg.rainFrom || 40),
      atLeave: atLeave === null ? null : Math.round(atLeave),
      clothes: clothesFor(ref)
    };
  }

  global.Weather = {
    start: function (onChange) {
      listener = onChange;
      load();
      if (!wcfg.enabled) { return; }
      refresh();
      setInterval(refresh, 30 * 60 * 1000);
    },
    refresh: refresh,
    forDay: forDay,
    enabled: function () { return !!wcfg.enabled; }
  };
})(window);
