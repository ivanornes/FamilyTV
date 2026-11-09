/*
 * Casa TV — configuración pública con valores de ejemplo.
 *
 * Lo personal (críos, calendario familiar, credenciales) va en js/config.local.js,
 * que se carga después de este fichero y lo sobrescribe. Ese fichero no se sube
 * al repositorio: copia js/config.local.example.js y rellénalo.
 *
 * Días de la semana (como Date.getDay()): 0=domingo, 1=lunes ... 6=sábado.
 * Una tarea sin "days" aparece todos los días; sin "kids", para todos los críos.
 * "from" / "until" ('YYYY-MM-DD', incluidos) la limitan a un periodo, p. ej. un trimestre.
 * "order" es la orden directa (imperativo) que ven los críos en modo focusMode.
 */
window.APP_CONFIG = {

  /* ---------- Entradas HDMI ----------
   * Montaje: los tres aparatos directos a la tele; el Marantz NR1200 en el
   * puerto (e)ARC sólo para el sonido. Ajusta "hdmi" al puerto real: la app
   * muestra abajo las entradas con señal para comprobar el mapeo.
   *
   * "via" decide cómo se cambia a cada entrada:
   *   'tvwindow'    → la señal se ve a pantalla completa DENTRO de la app
   *                   (cero configuración; "Atrás" vuelve al menú).
   *   'smartthings' → cambia la entrada REAL del televisor por la API de
   *                   SmartThings (OAuth, ver README). Se usa para la PS5 para
   *                   no arriesgar Modo Juego / VRR / 120 Hz. Si SmartThings no
   *                   está configurado o falla, se usa tvwindow y se avisa.
   */
  // art: ilustración (SVG/PNG/JPG en img/); si falta, se usa el emoji de icon sobre gradient.
  sources: [
    { id: 'appletv',   name: 'Apple TV',  hdmi: 2, via: 'tvwindow',    icon: '🎬', art: 'img/appletv-3d.png', gradient: ['#5b5b66', '#121216'], key: 'red'    },
    { id: 'ps5',       name: 'PS5',       hdmi: 4, via: 'tvwindow',    icon: '🎮', art: 'img/ps5-3d-v2.png', gradient: ['#3d7bff', '#0a1d73'], key: 'green'  },
    { id: 'euskaltel', name: 'Euskaltel', hdmi: 1, via: 'tvwindow',    icon: '📺', art: 'img/tele.png',      gradient: ['#ff4fae', '#6e0a4c'], key: 'yellow' }
  ],

  /* ---------- Aspecto ----------
   * transparency: como el deslizador de Liquid Glass de iOS 27.
   *   0 = cristal casi opaco (máxima legibilidad) · 1 = cristal muy transparente.
   * motion: false desactiva fondo animado y efectos de parallax.
   */
  ui: {
    transparency: 0.55,
    motion: true,
    // 'auto': modo ligero en la tele y completo en el navegador · 'lite' · 'full'
    // Ligero = fondo quieto, desenfoque sólo en paneles grandes, sin balanceo 3D.
    performance: 'auto',
    // false: el panel no muestra los botones de entradas (se siguen cambiando con
    // los botones de colores o 1-2-3 del mando) y su hueco lo ocupa el tiempo.
    sourcesOnBoard: false
  },

  smartthings: {
    // Rellénalo en config.local.js: el secret no debe acabar en el repo.
    deviceId: '',      // id del televisor en SmartThings
    clientId: '',      // de tu app OAuth (smartthings apps:create)
    clientSecret: '',
    refreshToken: ''   // semilla inicial; luego la app rota y guarda el suyo
  },

  /* ---------- Calendario ----------
   * Feeds iCal (.ics). Se aceptan enlaces webcal:// tal cual.
   * iCloud (iPhone): Calendario → Calendarios → (i) junto al calendario →
   *   activa "Calendario público" → "Compartir enlace" → Copiar.
   * Google: Configuración del calendario → "Dirección secreta en formato iCal".
   * Quien tenga el enlace puede ver el calendario: ponlo en config.local.js, nunca aquí.
   * holidays: true marca el feed como festivos (se resaltan los días).
   */
  calendar: {
    feeds: [
      { name: 'Festivos', holidays: true,
        url: 'https://calendar.google.com/calendar/ical/es.spain%23holiday%40group.v.calendar.google.com/public/basic.ics' }
    ]
  },

  /* ---------- Tiempo (Open-Meteo, sin clave) ----------
   * Por la mañana muestra el día de hoy; por la noche, el de mañana (para
   * dejar la ropa preparada). La ropa se elige con la temperatura a la hora de
   * salir de casa (departure.leave): la primera fila cuyo upTo la cubra.
   * rainFrom: % de lluvia (7–20 h) a partir del cual se avisa del chubasquero.
   * La ubicación de casa va en config.local.js; aquí, una de ejemplo.
   */
  weather: {
    enabled: true,
    place: 'Madrid',
    lat: 40.4168,
    lon: -3.7038,
    rainFrom: 40,
    hours: [8, 11, 14, 17, 20],   // franja horaria de la tarjeta grande
    clothes: [
      { upTo: 9,  icon: '🧣', label: 'Abrigo' },
      { upTo: 15, icon: '🧥', label: 'Chaqueta' },
      { upTo: 21, icon: '👕', label: 'Sudadera' },
      {           icon: '🩳', label: 'Manga corta' }
    ]
  },

  /* ---------- Cuenta atrás para salir de casa ----------
   * Sólo por la mañana y en los días indicados (1=lunes … 5=viernes).
   * start:   empieza la cuenta (se enciende la luz de los críos)
   * readyBy: deberían tener las tareas hechas (luego: zapatos y abrigo)
   * leave:   hora de salir · limit: como muy tarde
   */
  departure: {
    enabled: true,
    days: [1, 2, 3, 4, 5],
    start: '07:20',
    readyBy: '08:20',
    leave: '08:30',
    limit: '08:40',
    amberMin: 20,       // a partir de aquí la barra pasa a ámbar
    hideAfterMin: 20,   // minutos tras el límite en que desaparece
    sound: true         // campanitas a -10, -5, hora de salir y límite
  },

  /* ---------- Rutinas ---------- */
  morningUntil: '14:00',   // antes de esta hora se muestra la rutina de mañana

  kids: [
    // avatar: emoji o letra dentro del anillo de progreso (que lo elijan ellos)
    // focusMode: una orden cada vez (tarea actual grande + la siguiente en pequeño)
    // syllables: texto en sílabas alternando rojo/azul. true = cada palabra empieza en rojo;
    //            'continuous' = la alternancia sigue entre palabras
    // Ejemplo: los críos reales van en js/config.local.js (no se sube al repo).
    { id: 'mikel', name: 'Mikel', avatar: '🦊', gradient: ['#64d2ff', '#0a84ff'], syllables: true },
    { id: 'nora',  name: 'Nora',  avatar: '🐼', gradient: ['#ffb38a', '#ff375f'], syllables: true },
    { id: 'leire', name: 'Leire', avatar: '🦋', gradient: ['#e0b0ff', '#bf5af2'], syllables: true }
  ],

  routines: {
    morning: [
      { id: 'desayunar', label: 'Desayunar',          order: 'Desayuna',           icon: '🥣' },
      { id: 'vestirse',  label: 'Vestirse',           order: 'Vístete',            icon: '👕' },
      { id: 'dientes-m', label: 'Lavarse los dientes', order: 'Lávate los dientes', icon: '🪥' },
      // Tareas de días concretos (days) o de un crío (kids):
      { id: 'mochila-piscina', label: 'Mochila de la piscina', order: 'Prepara la mochila', icon: '🏊', days: [2, 4], kids: ['nora'] },
      { id: 'mochila-futbol',  label: 'Mochila de fútbol',     order: 'Prepara la mochila', icon: '⚽', days: [1, 3], kids: ['mikel'] }
    ],
    evening: [
      { id: 'deberes', label: 'Hacer los deberes',  order: 'Haz los deberes',  icon: '📚', days: [1, 2, 3, 4, 5] },
      { id: 'cenar',   label: 'Cenar',              order: 'Cena',             icon: '🍽️' },
      { id: 'pijama',  label: 'Ponerse el pijama',  order: 'Ponte el pijama',  icon: '🌙' },
      { id: 'dientes-n', label: 'Lavarse los dientes', order: 'Lávate los dientes', icon: '🪥' },
      { id: 'leer',    label: 'Leer un poco',       order: 'Lee un ratito',    icon: '📖' },
      { id: 'cama',    label: 'Irse a la cama',     order: 'Vete a la cama',   icon: '🛏️' }
    ]
  }
};
