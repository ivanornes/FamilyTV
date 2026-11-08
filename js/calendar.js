/*
 * Calendario: descarga feeds iCal (.ics), los interpreta y expande recurrencias.
 *
 * Soporta: DTSTART/DTEND (UTC "Z", hora local con o sin TZID, y días completos
 * VALUE=DATE), DURATION simple, RRULE (DAILY/WEEKLY/MONTHLY/YEARLY con
 * INTERVAL, COUNT, UNTIL, BYDAY), EXDATE y RECURRENCE-ID (instancias movidas).
 * Las horas con TZID se toman como hora local de la tele (Europe/Madrid).
 *
 * Caché en localStorage: si no hay red, se muestran los últimos datos buenos.
 */
(function (global) {
  'use strict';

  var cfg = global.APP_CONFIG;
  var CACHE = 'cal.cache.v1';
  var REFRESH_MS = 15 * 60000;
  var listeners = [];
  var state = { events: [], demo: false, updated: 0, error: null };

  /* ---------- Parser ICS ---------- */

  function unfold(text) { return text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, ''); }

  function unescapeText(v) {
    return v.replace(/\\n/gi, ' ').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
  }

  function parseDate(value, params) {
    var allDay = /VALUE=DATE(?!-)/.test(params) || /^\d{8}$/.test(value);
    var y = +value.substr(0, 4), m = +value.substr(4, 2) - 1, d = +value.substr(6, 2);
    if (allDay) { return { date: new Date(y, m, d), allDay: true }; }
    var hh = +value.substr(9, 2), mi = +value.substr(11, 2), ss = +value.substr(13, 2) || 0;
    if (value.charAt(value.length - 1) === 'Z') { return { date: new Date(Date.UTC(y, m, d, hh, mi, ss)), allDay: false }; }
    return { date: new Date(y, m, d, hh, mi, ss), allDay: false };
  }

  function parseDuration(v) {
    var m = /P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?/.exec(v);
    if (!m) { return 3600000; }
    return (((+m[1] || 0) * 7 + (+m[2] || 0)) * 24 * 60 + (+m[3] || 0) * 60 + (+m[4] || 0)) * 60000;
  }

  function parseICS(text, feed) {
    var lines = unfold(text).split(/\r?\n/), out = [], ev = null;
    lines.forEach(function (line) {
      if (line === 'BEGIN:VEVENT') { ev = { exdates: [], feed: feed }; return; }
      if (line === 'END:VEVENT') { if (ev && ev.start) { out.push(ev); } ev = null; return; }
      if (!ev) { return; }
      var i = line.indexOf(':'); if (i < 0) { return; }
      var head = line.slice(0, i), value = line.slice(i + 1);
      var name = head.split(';')[0].toUpperCase(), params = head.slice(name.length);
      switch (name) {
        case 'UID': ev.uid = value; break;
        case 'SUMMARY': ev.title = unescapeText(value); break;
        case 'LOCATION': ev.location = unescapeText(value); break;
        case 'DTSTART': var s = parseDate(value, params); ev.start = s.date; ev.allDay = s.allDay; break;
        case 'DTEND': ev.end = parseDate(value, params).date; break;
        case 'DURATION': ev.duration = parseDuration(value); break;
        case 'RRULE': ev.rrule = value; break;
        case 'EXDATE': value.split(',').forEach(function (v) { ev.exdates.push(parseDate(v, params).date.getTime()); }); break;
        case 'RECURRENCE-ID': ev.recurrenceId = parseDate(value, params).date.getTime(); break;
        case 'STATUS': ev.status = value; break;
      }
    });
    out.forEach(function (e) {
      if (!e.end) { e.end = new Date(e.start.getTime() + (e.duration || (e.allDay ? 86400000 : 3600000))); }
      e.title = e.title || '(sin título)';
    });
    return out.filter(function (e) { return e.status !== 'CANCELLED'; });
  }

  /* ---------- Recurrencias ---------- */

  var DAYMAP = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

  function rule(str) {
    var r = {};
    str.split(';').forEach(function (p) { var kv = p.split('='); r[kv[0]] = kv[1]; });
    return r;
  }

  function expand(ev, from, to) {
    var len = ev.end - ev.start;
    if (!ev.rrule) { return (ev.end > from && ev.start < to) ? [ev] : []; }
    var r = rule(ev.rrule), freq = r.FREQ, interval = +(r.INTERVAL || 1);
    var until = r.UNTIL ? parseDate(r.UNTIL, '').date : null;
    var count = r.COUNT ? +r.COUNT : Infinity;
    var byday = r.BYDAY ? r.BYDAY.split(',').map(function (d) { return DAYMAP[d.slice(-2)]; }) : null;
    var out = [], n = 0, guard = 0;
    var cur = new Date(ev.start.getTime());

    function emit(d) {
      if (until && d > until) { return false; }
      if (n >= count) { return false; }
      n++;
      if (ev.exdates.indexOf(d.getTime()) >= 0) { return true; }
      var inst = Object.assign({}, ev, { start: new Date(d.getTime()), end: new Date(d.getTime() + len), occ: d.getTime() });
      if (inst.end > from && inst.start < to) { out.push(inst); }
      return true;
    }

    while (cur < to && guard++ < 3000) {
      if (freq === 'WEEKLY' && byday) {
        // Recorre la semana de "cur" (lunes a domingo) en los días pedidos.
        var monday = new Date(cur.getTime()); monday.setDate(cur.getDate() - ((cur.getDay() + 6) % 7));
        for (var k = 0; k < 7; k++) {
          var d = new Date(monday.getTime()); d.setDate(monday.getDate() + k);
          d.setHours(ev.start.getHours(), ev.start.getMinutes(), ev.start.getSeconds(), 0);
          if (d < ev.start || byday.indexOf(d.getDay()) < 0) { continue; }
          if (!emit(d)) { return out; }
        }
        cur = new Date(monday.getTime()); cur.setDate(monday.getDate() + 7 * interval);
        cur.setHours(ev.start.getHours(), ev.start.getMinutes(), ev.start.getSeconds(), 0);
        continue;
      }
      if (!emit(cur)) { return out; }
      var nx = new Date(cur.getTime());
      if (freq === 'DAILY') { nx.setDate(nx.getDate() + interval); }
      else if (freq === 'WEEKLY') { nx.setDate(nx.getDate() + 7 * interval); }
      else if (freq === 'MONTHLY') { nx.setMonth(nx.getMonth() + interval); }
      else if (freq === 'YEARLY') { nx.setFullYear(nx.getFullYear() + interval); }
      else { break; }
      cur = nx;
    }
    return out;
  }

  /* ---------- Datos de ejemplo (sin feed familiar configurado) ---------- */

  function demoEvents() {
    var now = new Date(), monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
    function at(dayOffset, h, m, mins, title, loc) {
      var s = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + dayOffset, h, m);
      return { uid: 'demo-' + title + dayOffset, title: title, location: loc, start: s, end: new Date(s.getTime() + mins * 60000), allDay: false, exdates: [], feed: { name: 'Ejemplo' } };
    }
    return [
      at(0, 18, 0, 75, 'Fútbol Mikel'), at(2, 18, 0, 75, 'Fútbol Mikel'),
      at(1, 17, 30, 90, 'Natación Nora'), at(3, 17, 30, 90, 'Natación Nora'),
      at(3, 16, 45, 45, 'Reunión del cole'),
      at(4, 9, 30, 30, 'Dentista Leire'),
      at(5, 11, 0, 120, 'Cumpleaños en el parque'),
      at(6, 13, 30, 150, 'Comida familiar')
    ];
  }

  /* ---------- Descarga ---------- */

  // iCloud entrega enlaces webcal://: es el mismo fichero servido por https.
  function normalizeUrl(url) { return url.replace(/^webcals?:\/\//i, 'https://'); }

  function fetchText(url) {
    url = normalizeUrl(url);
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, true); xhr.timeout = 15000;
      var host = (url.match(/^https?:\/\/([^\/]+)/) || [])[1] || url;
      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) {
          if (xhr.responseText.indexOf('BEGIN:VCALENDAR') < 0) { reject(new Error('no es un calendario (' + host + ')')); return; }
          resolve(xhr.responseText);
        } else { reject(new Error('HTTP ' + xhr.status + ' (' + host + ')')); }
      };
      // status 0 sin respuesta = bloqueo de red, CORS o permiso <access> en config.xml
      xhr.onerror = function () { reject(new Error('bloqueado o sin red, status ' + xhr.status + ' (' + host + ')')); };
      xhr.ontimeout = function () { reject(new Error('tiempo agotado (' + host + ')')); };
      xhr.send();
    });
  }

  function saveCache(raw) { try { localStorage.setItem(CACHE, JSON.stringify(raw)); } catch (e) { /* lleno */ } }
  function loadCache() { try { return JSON.parse(localStorage.getItem(CACHE)) || null; } catch (e) { return null; } }

  function build(raw) {
    var events = [];
    raw.feeds.forEach(function (f) { events = events.concat(parseICS(f.text, f.feed)); });
    // Instancias movidas (RECURRENCE-ID): quitan la ocurrencia original de su serie.
    var moved = {};
    events.forEach(function (e) { if (e.recurrenceId) { moved[e.uid + '@' + e.recurrenceId] = true; } });
    events.forEach(function (e) {
      if (e.rrule) {
        Object.keys(moved).forEach(function (k) {
          var p = k.split('@'); if (p[0] === e.uid) { e.exdates.push(+p[1]); }
        });
      }
    });
    return events;
  }

  function refresh() {
    var feeds = ((cfg.calendar && cfg.calendar.feeds) || []).filter(function (f) { return f.url; });
    var hasFamily = feeds.some(function (f) { return !f.holidays; });
    return Promise.all(feeds.map(function (f) {
      return fetchText(f.url).then(function (text) { return { feed: f, text: text }; }, function (e) { return { feed: f, error: e }; });
    })).then(function (res) {
      var ok = res.filter(function (r) { return r.text; });
      var failed = res.filter(function (r) { return r.error; });
      var cached = loadCache();
      if (ok.length) {
        // Feeds que fallan: se reutiliza su última copia buena.
        if (cached && failed.length) {
          failed.forEach(function (f) {
            var old = cached.feeds.filter(function (c) { return c.feed.url === f.feed.url; })[0];
            if (old) { ok.push(old); }
          });
        }
        var raw = { feeds: ok.map(function (r) { return { feed: r.feed, text: r.text }; }), at: Date.now() };
        saveCache(raw);
        state.events = build(raw); state.updated = raw.at;
      } else if (cached) {
        state.events = build(cached); state.updated = cached.at;
      } else {
        state.events = [];
      }
      state.error = failed.length ? failed.map(function (f) { return f.feed.name + ': ' + f.error.message; }).join(' · ') : null;
      state.feeds = res.map(function (r) {
        return r.text ? r.feed.name + ' ✓ ' + parseICS(r.text, r.feed).length + ' eventos' : r.feed.name + ' ✗ ' + r.error.message;
      });
      if (failed.length) { console.error('[Calendario]', state.error); }
      state.demo = !hasFamily;
      if (state.demo) { state.events = state.events.concat(demoEvents()); }
      listeners.forEach(function (fn) { fn(); });
    });
  }

  /* ---------- Consultas ---------- */

  function between(from, to) {
    var out = [];
    state.events.forEach(function (e) { out = out.concat(expand(e, from, to)); });
    return out.sort(function (a, b) { return (b.allDay - a.allDay) || (a.start - b.start); });
  }

  function day(date) {
    var from = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    var to = new Date(from.getTime()); to.setDate(to.getDate() + 1);
    return between(from, to);
  }

  // Crío al que se refiere un evento (por nombre en el título).
  function kidOf(ev) {
    var t = (ev.title || '').toLowerCase();
    return cfg.kids.filter(function (k) { return new RegExp('\\b' + k.name.toLowerCase() + '\\b').test(t); })[0] || null;
  }

  function start() {
    refresh();
    setInterval(refresh, REFRESH_MS);
  }

  global.Calendar = {
    start: start, refresh: refresh, between: between, day: day, kidOf: kidOf,
    onChange: function (fn) { listeners.push(fn); },
    info: function () { return { demo: state.demo, updated: state.updated, error: state.error, feeds: state.feeds || [] }; },
    _parseICS: parseICS, _expand: expand   // para pruebas
  };
})(window);
