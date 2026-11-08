/*
 * Navegación espacial con las flechas del mando, por geometría.
 * Cualquier elemento con [data-focus] es enfocable; no hay que mantener una
 * rejilla a mano, así que el layout puede cambiar sin tocar este fichero.
 */
(function (global) {
  'use strict';

  var current = null;

  function all() {
    return [].slice.call(document.querySelectorAll('[data-focus]')).filter(function (el) {
      return el.offsetParent !== null;
    });
  }

  function center(r) { return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }

  function focus(el) {
    if (!el) { return; }
    if (current) { current.classList.remove('focused'); }
    current = el;
    el.classList.add('focused');
    if (el.scrollIntoView) { el.scrollIntoView({ block: 'nearest' }); }
  }

  function move(dir) {
    var items = all();
    if (!current || items.indexOf(current) < 0) { focus(items[0]); return; }
    var from = center(current.getBoundingClientRect());
    var best = null, bestScore = Infinity;

    items.forEach(function (el) {
      if (el === current) { return; }
      var c = center(el.getBoundingClientRect());
      var dx = c.x - from.x, dy = c.y - from.y;
      var primary, ortho;
      switch (dir) {
        case 'left':  primary = -dx; ortho = Math.abs(dy); break;
        case 'right': primary =  dx; ortho = Math.abs(dy); break;
        case 'up':    primary = -dy; ortho = Math.abs(dx); break;
        default:      primary =  dy; ortho = Math.abs(dx);
      }
      if (primary <= 1) { return; }
      var score = primary + ortho * 2.5;  // penaliza saltos en diagonal
      if (score < bestScore) { bestScore = score; best = el; }
    });

    if (best) { focus(best); }
  }

  global.Nav = {
    move: move,
    focus: focus,
    current: function () { return current; },
    // Tras re-renderizar, recupera el foco por id estable.
    restore: function (id) {
      var el = id && document.querySelector('[data-focus="' + id + '"]');
      current = null;
      focus(el || all()[0]);
    }
  };
})(window);
