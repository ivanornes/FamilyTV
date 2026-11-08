/*
 * Configuración privada de Casa TV. PLANTILLA: cópiala como js/config.local.js.
 * Se carga DESPUÉS de config.js y sobrescribe lo que haga falta.
 * La copia (config.local.js) está en .gitignore: no la subas.
 */
(function (c) {
  'use strict';

  // Calendario familiar: borra esta línea si no tienes.
  // Calendario familiar (enlace público iCal; quien lo tenga puede leerlo).
  c.calendar.feeds.unshift({ name: 'Familia', url: 'webcal://pXX-caldav.icloud.com/published/2/TU-ENLACE' });

  // Críos de la casa.
  c.kids = [
    { id: 'mikel', name: 'Mikel', avatar: '🦊', gradient: ['#64d2ff', '#0a84ff'], syllables: true },
    { id: 'nora',  name: 'Nora',  avatar: '🐼', gradient: ['#ffb38a', '#ff375f'], syllables: false }
  ];

  // Tareas de mañana con días o críos concretos (sustituyen a las de ejemplo).
  c.routines.morning = c.routines.morning.filter(function (t) { return !t.kids; }).concat([
    { id: 'mochila-futbol', label: 'Mochila de fútbol', order: 'Prepara la mochila', icon: '⚽', days: [1, 3], kids: ['mikel'] }
  ]);

  // SmartThings (opcional; sólo si una entrada usa via: 'smartthings').
  // c.smartthings = { deviceId: '', clientId: '', clientSecret: '', refreshToken: '' };
})(window.APP_CONFIG);
