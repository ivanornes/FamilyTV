/*
 * Cambio de entrada HDMI. Dos estrategias con la misma interfaz; cada entrada
 * elige la suya con "via" en config.js:
 *   select(source) -> Promise<{ mode: 'inapp' | 'global' | 'preview' }>
 *   close()        -> deja de mostrar la señal dentro de la app (sólo tvwindow)
 *
 * ES2015 sin async/await a propósito: los Tizen 3.0 (TVs de 2017) llevan un
 * Chromium antiguo.
 */
(function (global) {
  'use strict';

  var cfg = global.APP_CONFIG;
  var hasTizen = typeof global.tizen !== 'undefined';

  function err(message, cause) {
    var e = new Error(message);
    e.cause = cause;
    return e;
  }

  /* ---------- Entrada asignada ----------
   * config.js da el HDMI por defecto; si se reasigna desde la tele (tecla 8 o
   * el selector que aparece cuando no hay señal) se guarda aquí y manda. */

  // La clave incluye el HDMI de config.js: si cambias config.js, las
  // asignaciones hechas en la tele dejan de aplicarse y manda el fichero.
  function key(source) { return 'hdmi:' + source.id + ':' + source.hdmi; }

  function hdmiOf(source) {
    var v = 0;
    try { v = Number(localStorage.getItem(key(source))); } catch (e) { /* sin storage */ }
    return v >= 1 && v <= 4 ? v : source.hdmi;
  }

  function setHdmi(id, n) {
    var s = cfg.sources.filter(function (x) { return x.id === id; })[0];
    if (!s) { return; }
    try { localStorage.setItem(key(s), String(n)); } catch (e) { /* sin storage */ }
  }

  /* ---------- Descubrimiento ---------- */

  function listConnected() {
    return new Promise(function (resolve) {
      if (!hasTizen || !tizen.systeminfo) {
        // Modo navegador: simulamos que todo está conectado.
        resolve(cfg.sources.map(function (s) { return { type: 'HDMI', number: hdmiOf(s) }; }));
        return;
      }
      try {
        tizen.systeminfo.getPropertyValue('VIDEOSOURCE',
          function (vs) { resolve(vs.connected || []); },
          function () { resolve([]); });
      } catch (e) {
        resolve([]);
      }
    });
  }

  /* ---------- Estrategia 1: TV Window (señal dentro de la app) ---------- */

  var tvwindow = {
    name: 'tvwindow',
    visible: false,

    select: function (source) {
      var self = this;
      var hdmi = hdmiOf(source);
      return listConnected().then(function (list) {
        var match = list.filter(function (v) {
          return v.type === 'HDMI' && Number(v.number) === Number(hdmi);
        })[0];
        if (!match) {
          var e = err(source.name + ' no da señal en HDMI ' + hdmi);
          e.code = 'NO_SIGNAL';
          e.hdmi = hdmi;
          throw e;
        }
        if (!hasTizen) { return { mode: 'preview' }; }

        return new Promise(function (resolve, reject) {
          tizen.tvwindow.setSource(match, function () {
            var rect = ['0px', '0px', global.innerWidth + 'px', global.innerHeight + 'px'];
            tizen.tvwindow.show(function () {
              self.visible = true;
              resolve({ mode: 'inapp' });
            }, function (e) { reject(err('No se pudo mostrar la entrada', e)); }, rect, 'MAIN');
          }, function (e) { reject(err('No se pudo cambiar a HDMI ' + hdmi, e)); });
        });
      });
    },

    close: function () {
      var self = this;
      return new Promise(function (resolve) {
        if (!hasTizen || !self.visible) { self.visible = false; resolve(); return; }
        tizen.tvwindow.hide(function () { self.visible = false; resolve(); },
                            function () { self.visible = false; resolve(); }, 'MAIN');
      });
    }
  };

  /* ---------- Estrategia 2: SmartThings (cambia la entrada real del TV) ----------
   * Los Personal Access Tokens nuevos caducan a las 24 h, así que usamos OAuth
   * con refresh token. Los refresh tokens rotan: guardamos siempre el último.
   */

  var ST_API = 'https://api.smartthings.com';
  var LS = {
    refresh: 'st.refreshToken',
    access: 'st.accessToken',
    expires: 'st.expiresAt'
  };

  function http(method, url, headers, body) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open(method, url, true);
      Object.keys(headers || {}).forEach(function (k) { xhr.setRequestHeader(k, headers[k]); });
      xhr.timeout = 8000;
      xhr.onload = function () {
        var data = null;
        try { data = xhr.responseText ? JSON.parse(xhr.responseText) : null; } catch (e) { data = xhr.responseText; }
        if (xhr.status >= 200 && xhr.status < 300) { resolve(data); }
        else { reject(err('SmartThings HTTP ' + xhr.status, data)); }
      };
      xhr.onerror = function () { reject(err('Sin conexión con SmartThings')); };
      xhr.ontimeout = function () { reject(err('SmartThings no responde')); };
      xhr.send(body || null);
    });
  }

  var smartthings = {
    name: 'smartthings',

    isConfigured: function () {
      var st = cfg.smartthings || {};
      return !!(st.deviceId && st.clientId && st.clientSecret &&
                (st.refreshToken || localStorage.getItem(LS.refresh)));
    },

    token: function () {
      var cached = localStorage.getItem(LS.access);
      var exp = Number(localStorage.getItem(LS.expires) || 0);
      if (cached && Date.now() < exp - 60000) { return Promise.resolve(cached); }

      var st = cfg.smartthings;
      var refresh = localStorage.getItem(LS.refresh) || st.refreshToken;
      var body = 'grant_type=refresh_token' +
                 '&client_id=' + encodeURIComponent(st.clientId) +
                 '&refresh_token=' + encodeURIComponent(refresh);
      return http('POST', ST_API + '/oauth/token', {
        'Authorization': 'Basic ' + btoa(st.clientId + ':' + st.clientSecret),
        'Content-Type': 'application/x-www-form-urlencoded'
      }, body).then(function (t) {
        localStorage.setItem(LS.access, t.access_token);
        localStorage.setItem(LS.expires, String(Date.now() + (t.expires_in || 3600) * 1000));
        if (t.refresh_token) { localStorage.setItem(LS.refresh, t.refresh_token); }
        return t.access_token;
      });
    },

    command: function (token, capability, argument) {
      var url = ST_API + '/v1/devices/' + encodeURIComponent(cfg.smartthings.deviceId) + '/commands';
      return http('POST', url, {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      }, JSON.stringify({ commands: [{
        component: 'main', capability: capability, command: 'setInputSource', arguments: [argument]
      }] }));
    },

    select: function (source) {
      var self = this;
      var arg = 'HDMI' + hdmiOf(source);
      return this.token().then(function (tok) {
        // Modelos recientes exponen a veces sólo la capability propietaria.
        return self.command(tok, 'mediaInputSource', arg)
          .catch(function () { return self.command(tok, 'samsungvd.mediaInputSource', arg); });
      }).then(function () {
        try { tizen.application.getCurrentApplication().hide(); } catch (e) { /* navegador */ }
        return { mode: 'global' };
      });
    },

    close: function () { return Promise.resolve(); }
  };

  /* ---------- Fachada: estrategia por entrada ---------- */

  global.Sources = {
    listConnected: listConnected,
    hdmiOf: hdmiOf,
    setHdmi: setHdmi,

    /* Resuelve a { mode, fallbackReason? }. Si una entrada pide SmartThings y
     * no se puede usar, cae a tvwindow y lo indica para que la UI avise. */
    select: function (source) {
      if (source.via !== 'smartthings') { return tvwindow.select(source); }

      if (!smartthings.isConfigured()) {
        return tvwindow.select(source).then(function (r) {
          r.fallbackReason = 'SmartThings sin configurar';
          return r;
        });
      }
      return smartthings.select(source).catch(function (e) {
        console.warn('SmartThings falló, uso tvwindow', e);
        return tvwindow.select(source).then(function (r) {
          r.fallbackReason = 'SmartThings no respondió';
          return r;
        });
      });
    },

    isShowingInApp: function () { return tvwindow.visible; },
    close: function () { return tvwindow.close(); }
  };
})(window);
