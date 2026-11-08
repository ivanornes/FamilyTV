/*
 * Lógica de rutinas, sin DOM: qué toca hoy, quién lo ha hecho, persistencia.
 * El estado se guarda por día y franja: routine:YYYY-MM-DD:morning
 * así cada mañana y cada noche empiezan limpias sin tener que "resetear" nada.
 */
(function (global) {
  'use strict';

  var cfg = global.APP_CONFIG;
  var PREFIX = 'routine:';
  var KEEP_DAYS = 7;

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  function minutesOf(hhmm) {
    var p = hhmm.split(':');
    return Number(p[0]) * 60 + Number(p[1] || 0);
  }

  function autoPeriod(date) {
    var m = date.getHours() * 60 + date.getMinutes();
    return m < minutesOf(cfg.morningUntil) ? 'morning' : 'evening';
  }

  function tasksFor(kid, period, date) {
    var day = date.getDay();
    return (cfg.routines[period] || []).filter(function (t) {
      var dayOk = !t.days || t.days.indexOf(day) >= 0;
      var kidOk = !t.kids || t.kids.indexOf(kid.id) >= 0;
      return dayOk && kidOk;
    });
  }

  function key(date, period) { return PREFIX + ymd(date) + ':' + period; }

  function load(date, period) {
    try { return JSON.parse(localStorage.getItem(key(date, period))) || {}; }
    catch (e) { return {}; }
  }

  function save(date, period, state) {
    try { localStorage.setItem(key(date, period), JSON.stringify(state)); } catch (e) { /* lleno */ }
  }

  function purgeOld(today) {
    var limit = new Date(today.getTime() - KEEP_DAYS * 86400000);
    var limitKey = PREFIX + ymd(limit);
    for (var i = localStorage.length - 1; i >= 0; i--) {
      var k = localStorage.key(i);
      if (k && k.indexOf(PREFIX) === 0 && k < limitKey) { localStorage.removeItem(k); }
    }
  }

  global.Routines = {
    autoPeriod: autoPeriod,
    tasksFor: tasksFor,
    purgeOld: purgeOld,

    isDone: function (date, period, kidId, taskId) {
      var s = load(date, period);
      return !!(s[kidId] && s[kidId][taskId]);
    },

    toggle: function (date, period, kidId, taskId) {
      var s = load(date, period);
      s[kidId] = s[kidId] || {};
      if (s[kidId][taskId]) { delete s[kidId][taskId]; } else { s[kidId][taskId] = Date.now(); }
      save(date, period, s);
      return !!s[kidId][taskId];
    },

    progress: function (date, period, kid) {
      var tasks = tasksFor(kid, period, date);
      var s = load(date, period)[kid.id] || {};
      var done = tasks.filter(function (t) { return s[t.id]; }).length;
      return { done: done, total: tasks.length };
    }
  };
})(window);
