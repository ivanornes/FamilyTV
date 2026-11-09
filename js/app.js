(function (global) {
  'use strict';

  var cfg = global.APP_CONFIG;
  var hasTizen = typeof global.tizen !== 'undefined';
  var $ = function (sel) { return document.querySelector(sel); };

  var KEY = {
    LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13,
    BACK: 10009, RED: 403, GREEN: 404, YELLOW: 405, BLUE: 406
  };

  var RING_C = 2 * Math.PI * 44;   // circunferencia del anillo de progreso (r = 44)

  var state = {
    date: new Date(),
    period: null,
    manualPeriod: null,   // pulsar azul fuerza mañana/noche hasta el siguiente cambio automático
    lastAuto: null,
    busy: false
  };

  function kidById(id) { return cfg.kids.filter(function (k) { return k.id === id; })[0]; }
  function grad(g) { return 'linear-gradient(145deg,' + g[0] + ',' + g[1] + ')'; }

  /* ---------- Aspecto (deslizador de cristal) ---------- */

  function sourcesOnBoard() { return (cfg.ui || {}).sourcesOnBoard !== false; }

  function applyUi() {
    var ui = cfg.ui || {};
    document.body.classList.toggle('no-sources', !sourcesOnBoard());
    var t = Math.max(0, Math.min(1, ui.transparency == null ? 0.55 : ui.transparency));
    var root = document.documentElement.style;
    // Relleno del cristal: más transparencia = menos blanco y menos oscurecido del fondo.
    root.setProperty('--glass-fill', (0.06 + (1 - t) * 0.16).toFixed(3));
    root.setProperty('--glass-tint', (0.10 + (1 - t) * 0.35).toFixed(3));
    document.body.classList.toggle('no-motion', ui.motion === false);
    var perf = ui.performance || 'auto';
    document.body.classList.toggle('lite', perf === 'lite' || (perf === 'auto' && hasTizen));
  }

  /* ---------- Medidor de fotogramas (tecla 7) ---------- */

  var fps = { on: false, el: null, frames: 0, last: 0, worst: 0, prev: 0 };
  function toggleFps() {
    fps.on = !fps.on;
    if (!fps.el) {
      fps.el = document.createElement('div');
      fps.el.className = 'fps-meter';
      document.body.appendChild(fps.el);
    }
    fps.el.style.display = fps.on ? 'block' : 'none';
    if (fps.on) { fps.frames = 0; fps.worst = 0; fps.last = fps.prev = performance.now(); requestAnimationFrame(fpsLoop); }
  }
  function fpsLoop(t) {
    if (!fps.on) { return; }
    fps.frames++;
    fps.worst = Math.max(fps.worst, t - fps.prev); fps.prev = t;
    if (t - fps.last >= 1000) {
      fps.el.textContent = Math.round(fps.frames * 1000 / (t - fps.last)) + ' fps · peor ' + Math.round(fps.worst) + ' ms' +
        (document.body.classList.contains('lite') ? ' · ligero' : ' · completo');
      fps.frames = 0; fps.worst = 0; fps.last = t;
    }
    requestAnimationFrame(fpsLoop);
  }

  /* ---------- Escalado ----------
   * Mantiene la maqueta de 1920×1080 y la ajusta al viewport sin deformarla. */

  function fit() {
    var s = Math.min(global.innerWidth / 1920, global.innerHeight / 1080);
    document.documentElement.style.setProperty('--scale', s.toFixed(4));
  }

  /* ---------- Mando ---------- */

  function registerKeys() {
    if (!hasTizen || !tizen.tvinputdevice) { return; }
    ['ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue', '0', '1', '2', '3', '4', '7', '8', '9'].forEach(function (k) {
      try { tizen.tvinputdevice.registerKey(k); } catch (e) { /* no soportada en este modelo */ }
    });
  }

  function exitApp() {
    try { tizen.application.getCurrentApplication().exit(); } catch (e) { /* navegador */ }
  }

  function onKey(e) {
    var code = e.keyCode;
    // Equivalencias de teclado para probar en el navegador del Mac.
    var kb = { 27: KEY.BACK, 8: KEY.BACK, 82: KEY.RED, 71: KEY.GREEN, 89: KEY.YELLOW, 66: KEY.BLUE };
    if (!hasTizen && kb[code]) { code = kb[code]; }

    if (picker.open) {
      if (pickerKey(code)) { e.preventDefault(); }
      return;
    }

    if (global.CalView && CalView.isOpen()) {
      if (CalView.key(code, KEY)) { e.preventDefault(); }
      return;
    }

    if (global.Lamp && Lamp.isOpen()) {
      if (Lamp.key(code, KEY)) { e.preventDefault(); }
      return;
    }

    if (Sources.isShowingInApp() || document.body.classList.contains('watching')) {
      if (code === KEY.BACK || code === 56) {
        e.preventDefault();
        var watched = state.watching;
        Sources.close().then(function () {
          document.body.classList.remove('watching');
          // 8 viendo una entrada = "esto no es lo que quería": reasignar.
          if (code === 56 && watched) { openPicker(watched, 'Elige en qué HDMI está ' + watched.name + '.'); }
        });
      }
      return;
    }

    switch (code) {
      case KEY.LEFT:  Nav.move('left');  break;
      case KEY.RIGHT: Nav.move('right'); break;
      case KEY.UP:    Nav.move('up');    break;
      case KEY.DOWN:  Nav.move('down');  break;
      case KEY.ENTER: activate(Nav.current()); break;
      case KEY.RED:    selectByKey('red');    break;
      case KEY.GREEN:  selectByKey('green');  break;
      case KEY.YELLOW: selectByKey('yellow'); break;
      case KEY.BLUE:   togglePeriod(); break;
      case KEY.BACK:   exitApp(); break;
      default:
        if (code === 48) { Lamp.open(); break; }
        if (code === 57) { CalView.open(); break; }
        if (code === 55) { toggleFps(); break; }
        if (code === 56) { openPicker(focusedSource() || cfg.sources[0], 'Elige en qué HDMI está conectado.'); break; }
        if (code >= 49 && code <= 57) { selectSource(cfg.sources[code - 49]); }
        return;
    }
    e.preventDefault();
  }

  function activate(el) {
    if (!el) { return; }
    var kind = el.getAttribute('data-kind');
    if (kind === 'source') {
      selectSource(cfg.sources.filter(function (s) { return s.id === el.getAttribute('data-id'); })[0]);
    } else if (kind === 'lamp') {
      Lamp.open();
    } else if (kind === 'calendar') {
      CalView.open();
    } else if (kind === 'task') {
      toggleTask(el.getAttribute('data-kid'), el.getAttribute('data-task'), el);
    }
  }

  /* ---------- Entradas ---------- */

  function selectByKey(color) {
    selectSource(cfg.sources.filter(function (s) { return s.key === color; })[0]);
  }

  function selectSource(source) {
    if (!source || state.busy) { return; }
    state.busy = true;
    var tile = document.querySelector('.tile[data-id="' + source.id + '"]');
    if (tile) { tile.classList.add('pressed'); setTimeout(function () { tile.classList.remove('pressed'); }, 250); }
    toast('Cambiando a ' + source.name + '…');
    Sources.select(source).then(function (r) {
      if (r.mode === 'inapp' || r.mode === 'preview') {
        state.watching = source;
        document.body.classList.add('watching');
        $('#watching-label').textContent = source.name + (r.mode === 'preview' ? ' · vista previa' : '');
      }
      if (r.fallbackReason) { toast(source.name + ' dentro de la app: ' + r.fallbackReason, true); }
      else { hideToast(); }
    }).catch(function (e) {
      if (e.code === 'NO_SIGNAL') {
        hideToast();
        openPicker(source, 'HDMI ' + e.hdmi + ' no tiene señal. Si ' + source.name +
          ' está apagado, enciéndelo y vuelve a pulsar. Si está en otra entrada, elígela.');
      } else {
        toast(e.message || 'No se pudo cambiar de entrada', true);
      }
    }).then(function () { state.busy = false; });
  }

  function focusedSource() {
    var el = Nav.current();
    if (!el || el.getAttribute('data-kind') !== 'source') { return null; }
    return cfg.sources.filter(function (s) { return s.id === el.getAttribute('data-id'); })[0];
  }

  /* ---------- Selector de HDMI ----------
   * Se abre solo cuando la entrada asignada no da señal, o con la tecla 8.
   * Guarda la elección en la tele; si el HDMI elegido era de otra entrada,
   * las intercambia. */

  var picker = { open: false, source: null, idx: 0, ports: [1, 2, 3, 4] };

  function openPicker(source, reason) {
    if (!source) { return; }
    Sources.listConnected().then(function (list) {
      var live = {};
      list.forEach(function (v) { if (v.type === 'HDMI') { live[Number(v.number)] = true; } });
      var owners = {};
      cfg.sources.forEach(function (s) { if (s.id !== source.id) { owners[Sources.hdmiOf(s)] = s.name; } });
      var cur = Sources.hdmiOf(source);
      // Propuesta: la actual si tiene señal; si no, la primera con señal libre.
      var liveFree = picker.ports.filter(function (n) { return live[n] && !owners[n]; })[0];
      var liveAny = picker.ports.filter(function (n) { return live[n]; })[0];
      var guess = live[cur] ? cur : (liveFree || liveAny || cur);

      var el = $('#hdmi-picker');
      if (!el) {
        el = document.createElement('div');
        el.id = 'hdmi-picker';
        el.className = 'hdmi-picker';
        $('#stage').appendChild(el);
      }
      el.innerHTML = '<div class="picker-sheet glass">' +
        '<div class="picker-title">¿Dónde está ' + source.name + '?</div>' +
        '<div class="picker-sub">' + (reason || '') + '</div>' +
        '<div class="picker-row">' + picker.ports.map(function (n) {
          return '<div class="picker-opt' + (live[n] ? ' live' : '') + (n === cur ? ' current' : '') + '" data-n="' + n + '">' +
            '<b>HDMI ' + n + '</b>' +
            '<span class="picker-state">' + (live[n] ? '● con señal' : 'sin señal') + '</span>' +
            '<span class="picker-owner">' + (n === cur ? 'actual' : (owners[n] ? 'ahora: ' + owners[n] : '')) + '</span>' +
          '</div>';
        }).join('') + '</div>' +
        '<div class="picker-help">◀ ▶ elegir · OK guardar y abrir · ATRÁS cancelar</div>' +
      '</div>';
      picker.open = true;
      picker.source = source;
      picker.idx = picker.ports.indexOf(guess);
      el.classList.add('show');
      paintPicker();
    });
  }

  function paintPicker() {
    var opts = document.querySelectorAll('#hdmi-picker .picker-opt');
    for (var i = 0; i < opts.length; i++) { opts[i].classList.toggle('focused', i === picker.idx); }
  }

  function closePicker() {
    picker.open = false;
    var el = $('#hdmi-picker');
    if (el) { el.classList.remove('show'); }
  }

  function choosePort(n) {
    var src = picker.source;
    var old = Sources.hdmiOf(src);
    if (n !== old) {
      cfg.sources.forEach(function (s) {
        if (s.id !== src.id && Sources.hdmiOf(s) === n) { Sources.setHdmi(s.id, old); }   // intercambio
      });
      Sources.setHdmi(src.id, n);
      renderSources();
      Nav.restore('src-' + src.id);
      renderDetected();
    }
    closePicker();
    selectSource(src);
  }

  function pickerKey(code) {
    if (code === KEY.LEFT)  { picker.idx = Math.max(0, picker.idx - 1); paintPicker(); return true; }
    if (code === KEY.RIGHT) { picker.idx = Math.min(picker.ports.length - 1, picker.idx + 1); paintPicker(); return true; }
    if (code === KEY.ENTER) { choosePort(picker.ports[picker.idx]); return true; }
    if (code >= 49 && code <= 52) { choosePort(code - 48); return true; }
    if (code === KEY.BACK || code === 56) { closePicker(); return true; }
    return true;   // modal: el resto de teclas no atraviesa
  }

  function renderSources() {
    $('#sources').innerHTML = cfg.sources.map(function (s) {
      return '<button class="tile" data-focus="src-' + s.id + '" data-kind="source" data-id="' + s.id + '">' +
        '<span class="tile-art" style="background:' + grad(s.gradient) + '">' +
          (s.art
            ? '<img class="tile-img" src="' + s.art + '" alt="">'
            : '<span class="tile-glyph">' + s.icon + '</span>') +
          '<span class="tile-gloss"></span><span class="tile-shine"></span>' +
        '</span>' +
        '<span class="tile-meta">' +
          '<span class="tile-name">' + s.name + '</span>' +
          '<span class="tile-hint"><i class="key key-' + s.key + '"></i>HDMI ' + Sources.hdmiOf(s) + '</span>' +
        '</span>' +
        '</button>';
    }).join('');
  }

  function renderDetected() {
    Sources.listConnected().then(function (list) {
      var names = list.map(function (v) { return v.type + ' ' + v.number; });
      $('#detected').textContent = names.length ? 'Con señal: ' + names.join(' · ') : 'Ninguna entrada HDMI con señal';
    });
  }

  /* ---------- Widget "Hoy" ---------- */

  function renderToday() {
    var period = currentPeriod();
    var day = state.date;
    // Actividades especiales del día (tareas con "days"), agrupando críos.
    // Sólo de la franja actual: por la noche no interesa la mochila de la mañana.
    var special = {};
    cfg.kids.forEach(function (kid) {
      Routines.tasksFor(kid, period, day).forEach(function (t) {
        if (!t.days) { return; }
        special[t.id] = special[t.id] || { t: t, kids: [] };
        special[t.id].kids.push(kid.name);
      });
    });
    var items = [];
    if (global.Calendar) {
      Calendar.day(day).forEach(function (e) {
        if (!e.allDay && e.end < new Date()) { return; }          // ya pasado
        var kid = Calendar.kidOf(e);
        var hhmm = e.allDay ? '' : (e.start.getHours() < 10 ? '0' : '') + e.start.getHours() + ':' + (e.start.getMinutes() < 10 ? '0' : '') + e.start.getMinutes() + ' ';
        items.push({ t: { icon: e.feed && e.feed.holidays ? '🎉' : (kid ? (kid.avatar || '📅') : '📅'), label: hhmm + e.title }, kids: [] });
      });
    }
    items = items.concat(Object.keys(special).map(function (id) { return special[id]; }));

    var done = 0, total = 0;
    cfg.kids.forEach(function (k) {
      var p = Routines.progress(day, period, k);
      done += p.done; total += p.total;
    });
    var pct = total ? Math.round(done / total * 100) : 0;

    $('#today').innerHTML =
      '<div class="today-head"><span class="today-title">Hoy</span>' +
      '<span class="today-count">' + done + ' de ' + total + '</span></div>' +
      '<div class="today-bar"><i style="width:' + pct + '%"></i></div>' +
      '<ul class="today-list">' + (items.length ? items.slice(0, sourcesOnBoard() ? 2 : 3).map(function (it) {
        return '<li><span class="today-icon">' + it.t.icon + '</span>' +
               '<span class="today-label">' + it.t.label + '</span>' +
               '<span class="today-who">' + it.kids.join(', ') + '</span></li>';
      }).join('') : '<li class="today-empty"><span class="today-icon">🌤️</span><span class="today-label">Nada especial hoy</span></li>') +
      '</ul>';
  }

  /* ---------- Rutinas ---------- */

  function currentPeriod() { return state.manualPeriod || Routines.autoPeriod(state.date); }

  function togglePeriod() {
    state.manualPeriod = currentPeriod() === 'morning' ? 'evening' : 'morning';
    document.body.classList.add('period-switch');
    setTimeout(function () { document.body.classList.remove('period-switch'); }, 600);
    renderBoard();
  }

  function toggleTask(kidId, taskId, el) {
    var period = currentPeriod();
    var kid = kidById(kidId);
    var before = Routines.progress(state.date, period, kid);
    var nowDone = Routines.toggle(state.date, period, kidId, taskId);
    var after = Routines.progress(state.date, period, kid);

    if (kid.focusMode) {
      // Pasa a la siguiente orden y deja el foco en ella.
      var pending = Routines.tasksFor(kid, period, state.date).filter(function (t) {
        return !Routines.isDone(state.date, period, kidId, t.id);
      });
      renderBoard(pending.length ? 'task-' + kidId + '-' + pending[0].id : null);
      var card = document.querySelector('.kid[data-kid="' + kidId + '"] .focus-card, .kid[data-kid="' + kidId + '"] .focus-alldone');
      if (card) { card.classList.add('enter'); }
      renderToday(); renderDeparture();
      if (nowDone && after.done === after.total && before.done < before.total) { celebrate(kid); }
      return;
    }

    el.classList.toggle('done', nowDone);
    el.classList.remove('pop'); void el.offsetWidth;
    if (nowDone) { el.classList.add('pop'); }
    updateKidHeader(kid, after);
    renderToday();
    renderDeparture();

    if (nowDone && after.done === after.total && before.done < before.total) { celebrate(kid); }
  }

  function updateKidHeader(kid, p) {
    var col = document.querySelector('.kid[data-kid="' + kid.id + '"]');
    if (!col) { return; }
    var ratio = p.total ? p.done / p.total : 0;
    col.querySelector('.ring-fg').style.strokeDashoffset = (RING_C * (1 - ratio)).toFixed(1);
    col.querySelector('.kid-sub').textContent = p.total
      ? (p.done === p.total ? '¡Todo hecho!' : p.done + ' de ' + p.total + ' hechas')
      : 'Nada pendiente';
    col.classList.toggle('complete', p.total > 0 && p.done === p.total);
  }

  function escHtml(t) {
    return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }
  // Texto para un crío: sílabas en rojo/azul si lo tiene activado.
  function kidText(kid, t) { return kid.syllables ? Syllables.colorize(t, kid.syllables === 'continuous' ? 'continuous' : 'word') : escHtml(t); }
  function taskText(kid, t) { return kidText(kid, kid.focusMode ? (t.order || t.label) : t.label); }

  var CHECK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 12.5l3.8 3.8L17.8 8.5"/></svg>';

  // Columna en modo foco: una orden cada vez.
  function focusColumnBody(kid, tasks, period) {
    var isDone = function (t) { return Routines.isDone(state.date, period, kid.id, t.id); };
    var pending = tasks.filter(function (t) { return !isDone(t); });
    var done = tasks.filter(isDone);
    var cur = pending[0], next = pending[1], html = '';

    if (cur) {
      html += '<div class="focus-label">Ahora</div>' +
        '<button class="task focus-card" data-focus="task-' + kid.id + '-' + cur.id + '" data-kind="task"' +
        ' data-kid="' + kid.id + '" data-task="' + cur.id + '">' +
          '<span class="focus-icon">' + cur.icon + '</span>' +
          '<span class="focus-text' + (kid.syllables ? ' syl-card' : '') + '">' + taskText(kid, cur) + '</span>' +
          '<span class="task-check">' + CHECK_SVG + '</span>' +
        '</button>';
      if (next) {
        html += '<div class="focus-next"><span class="focus-next-label">Después</span>' +
          '<span class="focus-next-icon">' + next.icon + '</span>' +
          '<span class="focus-next-text">' + escHtml(next.order || next.label) + '</span></div>';
      }
    } else if (tasks.length) {
      html += '<div class="focus-alldone"><span class="focus-alldone-star">⭐</span>' +
        '<span class="focus-text' + (kid.syllables ? ' syl-card' : '') + '">' + kidText(kid, '¡Todo hecho!') + '</span></div>';
    }
    if (done.length) {
      html += '<div class="focus-chips">' + done.map(function (t) {
        return '<button class="task chip done" data-focus="task-' + kid.id + '-' + t.id + '" data-kind="task"' +
          ' data-kid="' + kid.id + '" data-task="' + t.id + '" title="' + escHtml(t.label) + '">' +
          '<span class="task-icon">' + t.icon + '</span><span class="task-check">' + CHECK_SVG + '</span></button>';
      }).join('') + '</div>';
    }
    return html || '<p class="empty">¡Nada pendiente! 🎈</p>';
  }

  function renderBoard(focusOverride) {
    var period = currentPeriod();
    state.period = period;
    var focusedId = focusOverride || (Nav.current() && Nav.current().getAttribute('data-focus'));

    document.body.setAttribute('data-period', period);
    $('#period-title').textContent = period === 'morning' ? 'Buenos días' : 'Buenas noches';
    $('#period-pill').innerHTML = period === 'morning' ? '☀️ Rutina de mañana' : '🌙 Rutina de noche';

    $('#board').innerHTML = cfg.kids.map(function (kid, i) {
      var tasks = Routines.tasksFor(kid, period, state.date);
      var items = tasks.map(function (t) {
        var done = Routines.isDone(state.date, period, kid.id, t.id);
        return '<button class="task' + (done ? ' done' : '') + '" data-focus="task-' + kid.id + '-' + t.id + '"' +
          ' data-kind="task" data-kid="' + kid.id + '" data-task="' + t.id + '">' +
          '<span class="task-icon">' + t.icon + '</span>' +
          '<span class="task-label' + (kid.syllables ? ' syl-card' : '') + '">' + taskText(kid, t) + '</span>' +
          '<span class="task-check">' + CHECK_SVG + '</span>' +
          '</button>';
      }).join('');

      return '<section class="kid glass" data-kid="' + kid.id + '"' +
        ' style="--kid-a:' + kid.gradient[0] + ';--kid-b:' + kid.gradient[1] + ';--i:' + i + '">' +
        '<header class="kid-header">' +
          '<span class="avatar">' +
            '<svg class="ring" viewBox="0 0 100 100" aria-hidden="true">' +
              '<defs><linearGradient id="g-' + kid.id + '" x1="0" y1="0" x2="1" y2="1">' +
              '<stop offset="0" stop-color="' + kid.gradient[0] + '"/><stop offset="1" stop-color="' + kid.gradient[1] + '"/>' +
              '</linearGradient></defs>' +
              '<circle class="ring-bg" cx="50" cy="50" r="44"/>' +
              '<circle class="ring-fg" cx="50" cy="50" r="44" stroke="url(#g-' + kid.id + ')"' +
              ' stroke-dasharray="' + RING_C.toFixed(1) + '" stroke-dashoffset="' + RING_C.toFixed(1) + '"/>' +
            '</svg>' +
            '<span class="avatar-initial">' + (kid.avatar || kid.name.charAt(0)) + '</span>' +
            '<span class="avatar-badge">⭐</span>' +
          '</span>' +
          '<span class="kid-titles"><span class="kid-name">' + kid.name + '</span><span class="kid-sub"></span></span>' +
        '</header>' +
        '<div class="tasks' + (kid.focusMode ? ' focus' : '') + '">' +
          (kid.focusMode ? focusColumnBody(kid, tasks, period) : (items || '<p class="empty">¡Nada pendiente! 🎈</p>')) +
        '</div>' +
        '</section>';
    }).join('');

    cfg.kids.forEach(function (kid) {
      var p = Routines.progress(state.date, period, kid);
      // Arranca vacío y anima hasta el valor real (el anillo "se llena").
      requestAnimationFrame(function () { requestAnimationFrame(function () { updateKidHeader(kid, p); }); });
    });
    renderToday();
    if (global.Departure) { renderDeparture(); }
    renderWeather();
    Nav.restore(focusedId || defaultFocus());
  }

  /* ---------- Tiempo ----------
   * Mañana: el de hoy. Noche: el de mañana, para dejar la ropa preparada. */

  function renderWeather() {
    var pill = $('#weather'), card = $('#forecast');
    if (!pill || !global.Weather || !Weather.enabled()) { return; }
    var tomorrow = currentPeriod() === 'evening';
    var day = new Date(state.date.getFullYear(), state.date.getMonth(), state.date.getDate() + (tomorrow ? 1 : 0));
    var w = Weather.forDay(day);
    var big = !sourcesOnBoard();
    // Con la tarjeta grande la cabecera no lleva pastilla (y el reloj recupera su tamaño).
    document.body.classList.toggle('has-weather', !!w && !big);
    pill.hidden = true;
    card.hidden = true;
    if (!w) { return; }

    if (big) {
      card.innerHTML =
        '<div class="fc-now">' +
          '<span class="fc-icon">' + w.icon + '</span>' +
          '<span class="fc-temps">' +
            '<span class="fc-day">' + (tomorrow ? 'Mañana' : 'Hoy') + '</span>' +
            '<span><b>' + w.max + '°</b><i>' + w.min + '°</i></span>' +
          '</span>' +
        '</div>' +
        '<div class="fc-wear">' +
          (w.clothes ? '<span class="fc-item"><span class="fc-emoji">' + w.clothes.icon + '</span><span class="fc-label">' + w.clothes.label + '</span></span>' : '') +
          (w.rainy ? '<span class="fc-item wet"><span class="fc-emoji">☔</span><span class="fc-label">Chubasquero</span></span>' : '') +
        '</div>' +
        '<div class="fc-hours">' + (w.hours || []).map(function (h) {
          return '<span class="fc-hour">' +
            '<span class="fc-h">' + h.hour + ':00</span>' +
            '<span class="fc-hi">' + (h.icon || '') + '</span>' +
            '<span class="fc-ht">' + h.temp + '°</span>' +
            '<span class="fc-hr' + (h.rain >= (cfg.weather.rainFrom || 40) ? ' wet' : '') + '">💧' + h.rain + '%</span>' +
          '</span>';
        }).join('') + '</div>';
      card.hidden = false;
      return;
    }

    var wear = [];
    if (w.clothes) { wear.push(w.clothes.icon + ' ' + w.clothes.label); }
    if (w.rainy) { wear.push('☔ Chubasquero'); }
    pill.innerHTML =
      '<span class="w-icon">' + w.icon + '</span>' +
      '<span class="w-main">' +
        '<span class="w-temps">' + (tomorrow ? '<em>Mañana</em>' : '') +
          '<b>' + w.max + '°</b><i>' + w.min + '°</i>' +
          '<span class="w-rain' + (w.rainy ? ' wet' : '') + '">💧' + w.rain + '%</span></span>' +
        '<span class="w-wear">' + wear.join(' · ') + '</span>' +
      '</span>';
    pill.hidden = false;
  }

  // Por defecto, la primera entrada; sin entradas en el panel, la primera tarea.
  function defaultFocus() {
    if (sourcesOnBoard()) { return 'src-' + cfg.sources[0].id; }
    var t = document.querySelector('.task[data-focus]');
    return t ? t.getAttribute('data-focus') : null;
  }

  function celebrate(kid) {
    var period = currentPeriod();
    var all = cfg.kids.every(function (k) {
      var p = Routines.progress(state.date, period, k);
      return p.done === p.total;
    });
    var el = $('#celebration');
    el.querySelector('.sheet-emoji').textContent = all ? '🏆' : '⭐';
    el.querySelector('.sheet-title').textContent = all ? '¡Lo habéis hecho todo!' : '¡Bravo, ' + kid.name + '!';
    el.querySelector('.sheet-sub').textContent = all
      ? 'Rutina de ' + (period === 'morning' ? 'mañana' : 'noche') + ' completa'
      : 'Has terminado la rutina de ' + (period === 'morning' ? 'mañana' : 'noche');
    el.style.setProperty('--kid-a', kid.gradient[0]);
    el.style.setProperty('--kid-b', kid.gradient[1]);
    el.classList.remove('show'); void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(celebrate.t);
    celebrate.t = setTimeout(function () { el.classList.remove('show'); }, 3800);
  }

  /* ---------- Cuenta atrás ---------- */

  function renderDeparture() {
    var body = document.body, el = $('#departure');
    var now = new Date();
    var s = null;
    if (currentPeriod() === 'morning') {
      var done = 0, total = 0;
      cfg.kids.forEach(function (k) {
        var p = Routines.progress(now, 'morning', k);
        done += p.done; total += p.total;
      });
      s = Departure.compute(now, { done: done, total: total });
    }
    body.classList.toggle('has-departure', !!s);
    body.classList.toggle('dep-urgent', !!s && (s.phase === 'red' || s.phase === 'go'));
    if (!s) { return; }
    el.setAttribute('data-phase', s.phase);
    el.querySelector('.dep-big').textContent = s.big;
    el.querySelector('.dep-label').textContent = s.label;
    var pace = el.querySelector('.dep-pace');
    pace.textContent = s.paceText || '';
    pace.setAttribute('data-pace', s.pace || '');
    el.querySelector('.dep-bar i').style.width = (s.ratio * 100).toFixed(1) + '%';
  }

  /* ---------- Reloj ---------- */

  var DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  var MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
                'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  function tick() {
    var now = new Date();
    var dayChanged = now.toDateString() !== state.date.toDateString();
    state.date = now;

    var hh = now.getHours(), mm = now.getMinutes();
    $('#clock').textContent = (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
    var dayName = DAYS[now.getDay()];
    $('#date').textContent = dayName.charAt(0).toUpperCase() + dayName.slice(1) + ', ' + now.getDate() + ' de ' + MONTHS[now.getMonth()];

    var auto = Routines.autoPeriod(now);
    if (auto !== state.lastAuto) { state.manualPeriod = null; }  // el cambio automático manda
    state.lastAuto = auto;

    if (dayChanged) { Routines.purgeOld(now); }
    if (dayChanged || currentPeriod() !== state.period) { renderBoard(); }
  }

  /* ---------- Avisos ---------- */

  var toastTimer = null;
  function toast(msg, isError) {
    var el = $('#toast');
    el.textContent = msg;
    el.classList.toggle('error', !!isError);
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, isError ? 5000 : 8000);
  }
  function hideToast() { $('#toast').classList.remove('show'); }

  /* ---------- Arranque ---------- */

  function init() {
    fit();
    global.addEventListener('resize', fit);
    applyUi();
    registerKeys();
    Routines.purgeOld(new Date());
    renderSources();
    tick();
    renderBoard();
    renderDetected();
    document.addEventListener('keydown', onKey);
    setInterval(tick, 15000);
    renderDeparture();
    setInterval(renderDeparture, 1000);
    // Al volver a la app (p. ej. tras SmartThings), refresca entradas y hora.
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) { tick(); renderDetected(); }
    });
    requestAnimationFrame(function () { document.body.classList.add('ready'); });
    Calendar.onChange(function () { renderToday(); CalView.refresh(); });
    Calendar.start();
    if (global.Weather) { Weather.start(renderWeather); }
  }

  document.addEventListener('DOMContentLoaded', init);
})(window);
