/*
 * Vista de calendario semanal (pantalla completa dentro del escenario).
 * Mando: ◀▶ semana anterior/siguiente · OK vuelve a esta semana · Atrás cierra.
 */
(function (global) {
  'use strict';

  var cfg = global.APP_CONFIG;
  var active = false, offset = 0, el = null;
  var DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  var MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
                'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function hm(d) { return (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes(); }
  function sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }

  function weekStart(off) {
    var n = new Date(), m = new Date(n.getFullYear(), n.getMonth(), n.getDate() - ((n.getDay() + 6) % 7));
    m.setDate(m.getDate() + off * 7);
    return m;
  }

  function title(mon) {
    var sun = new Date(mon.getTime()); sun.setDate(mon.getDate() + 6);
    var a = mon.getDate() + (mon.getMonth() !== sun.getMonth() ? ' de ' + MONTHS[mon.getMonth()] : '');
    return a + ' – ' + sun.getDate() + ' de ' + MONTHS[sun.getMonth()];
  }

  function chip(e) {
    var kid = Calendar.kidOf(e);
    var style = kid ? ' style="--kid-a:' + kid.gradient[0] + ';--kid-b:' + kid.gradient[1] + '"' : '';
    var past = !e.allDay && e.end < new Date() ? ' past' : '';
    if (e.allDay) {
      return '<div class="ev allday' + (e.feed && e.feed.holidays ? ' holiday' : '') + (kid ? ' kid' : '') + '"' + style + '>' +
        (kid ? '<span class="ev-avatar">' + (kid.avatar || kid.name[0]) + '</span>' : '') +
        '<span class="ev-title">' + esc(e.title) + '</span></div>';
    }
    return '<div class="ev' + (kid ? ' kid' : '') + past + '"' + style + '>' +
      '<div class="ev-time">' + hm(e.start) + (kid ? '<span class="ev-avatar">' + (kid.avatar || kid.name[0]) + '</span>' : '') + '</div>' +
      '<div class="ev-title">' + esc(e.title) + '</div>' +
      (e.location ? '<div class="ev-loc">' + esc(e.location) + '</div>' : '') +
      '</div>';
  }

  function render() {
    var mon = weekStart(offset), today = new Date();
    var to = new Date(mon.getTime()); to.setDate(mon.getDate() + 7);
    var events = Calendar.between(mon, to);
    var info = Calendar.info();

    var cols = '';
    for (var i = 0; i < 7; i++) {
      var d = new Date(mon.getTime()); d.setDate(mon.getDate() + i);
      var next = new Date(d.getTime()); next.setDate(d.getDate() + 1);
      var dayEv = events.filter(function (e) { return e.start < next && e.end > d; });
      var isToday = sameDay(d, today), isPast = d < new Date(today.getFullYear(), today.getMonth(), today.getDate());
      var holiday = dayEv.some(function (e) { return e.allDay && e.feed && e.feed.holidays; });
      var shown = dayEv.slice(0, 6), more = dayEv.length - shown.length;
      cols += '<section class="day glass' + (isToday ? ' is-today' : '') + (isPast ? ' past' : '') + (holiday || i >= 5 ? ' weekend' : '') + '">' +
        '<header class="day-head"><span class="day-name">' + DAYS[i] + '</span><span class="day-num">' + d.getDate() + '</span></header>' +
        '<div class="day-events">' + (shown.map(chip).join('') || '<div class="day-empty">—</div>') +
        (more > 0 ? '<div class="ev-more">+' + more + ' más</div>' : '') + '</div>' +
        '</section>';
    }

    var status = info.demo
      ? 'Datos de ejemplo · añade la dirección iCal de vuestro calendario en config.js'
      : (info.feeds.length ? info.feeds.join('   ·   ') +
          (info.updated ? '   ·   actualizado ' + hm(new Date(info.updated)) : '')
        : 'Cargando…');

    el.innerHTML =
      '<header class="cal-top">' +
        '<div><h1>Calendario</h1><p class="cal-range">' + title(mon) +
          (offset === 0 ? ' · esta semana' : offset === 1 ? ' · la próxima' : offset === -1 ? ' · la pasada' : '') + '</p></div>' +
        '<div class="cal-hints">' +
          '<span class="hint glass"><b class="ok">◀ ▶</b>Semana</span>' +
          '<span class="hint glass"><b class="ok">OK</b>Hoy</span>' +
          '<span class="hint glass"><b class="ok">Atrás</b>Volver</span>' +
        '</div>' +
      '</header>' +
      '<div class="week">' + cols + '</div>' +
      '<footer class="cal-status' + (info.demo ? ' demo' : '') + (info.error ? ' error' : '') + '">' + esc(status) + '</footer>';
  }

  function open() {
    el = el || document.getElementById('calendar');
    active = true; offset = 0;
    document.body.classList.add('cal-on');
    render();
  }

  function close() {
    active = false;
    document.body.classList.remove('cal-on');
  }

  function key(code, KEY) {
    if (!active) { return false; }
    switch (code) {
      case KEY.LEFT: offset--; render(); break;
      case KEY.RIGHT: offset++; render(); break;
      case KEY.ENTER: offset = 0; render(); break;
      case KEY.BACK: close(); break;
    }
    return true;
  }

  global.CalView = {
    open: open, close: close, key: key,
    isOpen: function () { return active; },
    refresh: function () { if (active) { render(); } }
  };
})(window);
