/*
 * Cuenta atrás para salir de casa (sólo mañanas de los días configurados).
 *
 * Fases (con la config por defecto):
 *   07:20 → 08:30  cuenta atrás; color verde → ámbar (≤20 min) → rojo (≤5 min)
 *   08:30 → 08:40  "¡A la calle!" + minutos hasta el límite
 *   08:40 → 09:00  "Llegamos tarde" (y luego desaparece)
 *
 * Ritmo: compara la fracción de tareas hechas con la fracción de tiempo
 * transcurrida hasta "readyBy" (hora a la que deberían estar listos para
 * calzarse y abrigarse).
 */
(function (global) {
  'use strict';

  var cfg = global.APP_CONFIG;

  function at(date, hhmm) {
    var p = hhmm.split(':'), d = new Date(date.getTime());
    d.setHours(Number(p[0]), Number(p[1] || 0), 0, 0);
    return d;
  }

  function fmtMin(ms) {
    return Math.max(0, Math.ceil(ms / 60000));
  }

  function fmtClock(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000));
    var m = Math.floor(s / 60), r = s % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  }

  /* ---------- Avisos sonoros (Web Audio, sin ficheros) ---------- */

  var audioCtx = null;
  function chime(kind) {
    if (!cfg.departure.sound) { return; }
    try {
      audioCtx = audioCtx || new (global.AudioContext || global.webkitAudioContext)();
      var notes = { soft: [784, 988], warn: [880, 698, 880], go: [523, 659, 784, 1047] }[kind] || [880];
      notes.forEach(function (f, i) {
        var t = audioCtx.currentTime + i * 0.22;
        var o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
        o.connect(g); g.connect(audioCtx.destination);
        o.start(t); o.stop(t + 1);
      });
    } catch (e) { /* sin audio */ }
  }

  /* ---------- Estado ---------- */

  var fired = {};   // avisos ya sonados hoy: { 'YYYY-MM-DD:leave-10': true }

  function compute(now, progress) {
    var d = cfg.departure;
    if (!d || d.enabled === false) { return null; }
    if (d.days && d.days.indexOf(now.getDay()) < 0) { return null; }

    var start = at(now, d.start), leave = at(now, d.leave), limit = at(now, d.limit);
    var readyBy = at(now, d.readyBy || d.leave);
    var hideAt = new Date(limit.getTime() + (d.hideAfterMin || 20) * 60000);
    if (now < start || now >= hideAt) { return null; }

    var s = { now: now, leave: leave, limit: limit };

    if (now < leave) {
      var left = leave - now;
      s.phase = left <= 5 * 60000 ? 'red' : left <= (d.amberMin || 20) * 60000 ? 'amber' : 'green';
      s.big = left <= 10 * 60000 ? fmtClock(left) : fmtMin(left) + ' min';
      s.label = 'para salir · ' + d.leave;
      s.ratio = 1 - left / (leave - start);
    } else if (now < limit) {
      s.phase = 'go';
      s.big = '¡A la calle!';
      s.label = 'Límite ' + d.limit + ' · ' + fmtMin(limit - now) + ' min';
      s.ratio = 1;
    } else {
      s.phase = 'late';
      s.big = 'Llegamos tarde';
      s.label = 'Mañana lo bordamos 💪';
      s.ratio = 1;
    }

    // Ritmo
    if (progress && progress.total && now < leave) {
      var doneFrac = progress.done / progress.total;
      var timeFrac = Math.min(1, Math.max(0, (now - start) / (readyBy - start)));
      if (progress.done === progress.total) { s.pace = 'ready'; s.paceText = '¡Listos! Zapatos y abrigo'; }
      else if (doneFrac - timeFrac >= -0.1) { s.pace = 'good'; s.paceText = 'Vais bien'; }
      else if (doneFrac - timeFrac >= -0.25) { s.pace = 'tight'; s.paceText = 'Vais justos'; }
      else { s.pace = 'late'; s.paceText = 'Hay que darse prisa'; }
    }

    // Avisos: 10 min, 5 min, hora de salir, límite
    var key = now.toDateString() + ':';
    [
      { id: 'l10', t: leave - 10 * 60000, k: 'soft' },
      { id: 'l5',  t: leave - 5 * 60000,  k: 'warn' },
      { id: 'go',  t: leave.getTime(),    k: 'go' },
      { id: 'lim', t: limit.getTime(),    k: 'warn' }
    ].forEach(function (a) {
      // Suena si acabamos de cruzar la marca (margen de 60 s para no sonar al abrir la app tarde)
      if (!fired[key + a.id] && now >= a.t && now - a.t < 60000) { fired[key + a.id] = true; chime(a.k); }
    });

    return s;
  }

  global.Departure = { compute: compute, chime: chime };
})(window);
