/*
 * División silábica del español + coloreado alterno rojo/azul (lectoescritura).
 *
 * Reglas implementadas:
 *  - Dígrafos ch, ll, rr = una consonante. "qu"/"gu" ante e/i = una consonante.
 *  - Diptongos/triptongos (vocal débil i/u sin tilde) en la misma sílaba;
 *    hiato entre dos fuertes (a, e, o) o con í/ú acentuadas.
 *  - "y" es vocal al final de palabra o ante consonante (muy, hay).
 *  - Entre vocales: V-CV · VC-CV · V-CCV si el grupo es inseparable
 *    (pr br tr dr cr gr fr pl bl cl gl fl) · VC-CCV · VCC-CV.
 */
(function (global) {
  'use strict';

  var VOWELS = 'aeiouáéíóúü';
  var STRONG = 'aeoáéóíú';          // í/ú acentuadas cuentan como fuertes (hiato)
  var INSEP = ['pr', 'br', 'tr', 'dr', 'cr', 'gr', 'fr', 'pl', 'bl', 'cl', 'gl', 'fl', 'kr', 'kl'];

  function isV(ch) { return VOWELS.indexOf(ch) >= 0; }

  // Convierte la palabra en unidades {t: texto original, l: minúsculas, v: vocal?}
  function units(word) {
    var lw = word.toLowerCase(), out = [], i = 0;
    while (i < lw.length) {
      var c = lw[i], n = lw[i + 1], n2 = lw[i + 2];
      var two = c + (n || '');
      if (two === 'ch' || two === 'll' || two === 'rr') {
        out.push({ t: word.substr(i, 2), l: two, v: false }); i += 2; continue;
      }
      if ((c === 'q' || c === 'g') && n === 'u' && (n2 === 'e' || n2 === 'i' || n2 === 'é' || n2 === 'í')) {
        out.push({ t: word.substr(i, 2), l: two, v: false }); i += 2; continue;
      }
      if (c === 'y') {
        var vowelY = (i === lw.length - 1) || !isV(n || '');
        if (vowelY && i > 0) { out.push({ t: word[i], l: 'i', v: true }); i++; continue; }
        out.push({ t: word[i], l: 'y', v: false }); i++; continue;
      }
      out.push({ t: word[i], l: c, v: isV(c) }); i++;
    }
    return out;
  }

  function syllabify(word) {
    if (!/[a-záéíóúüñ]/i.test(word)) { return [word]; }
    var u = units(word);

    // Núcleos vocálicos: [inicio, fin] en índices de unidades
    var nuclei = [], i = 0;
    while (i < u.length) {
      if (!u[i].v) { i++; continue; }
      var start = i;
      while (i + 1 < u.length && u[i + 1].v) {
        var a = u[i].l, b = u[i + 1].l;
        var hiatus = (STRONG.indexOf(a) >= 0 && STRONG.indexOf(b) >= 0) ||
                     ('íú'.indexOf(a) >= 0) || ('íú'.indexOf(b) >= 0) || (a === b);
        if (hiatus) { break; }
        i++;
      }
      nuclei.push([start, i]);
      i++;
    }
    if (nuclei.length <= 1) { return [word]; }

    // Cortes entre núcleos consecutivos
    var cuts = [];
    for (var k = 0; k < nuclei.length - 1; k++) {
      var endV = nuclei[k][1], nextV = nuclei[k + 1][0];
      var cons = nextV - endV - 1;
      var cut;
      if (cons <= 0) { cut = nextV; }
      else if (cons === 1) { cut = endV + 1; }
      else {
        var lastTwo = u[nextV - 2].l + u[nextV - 1].l;
        var insep = INSEP.indexOf(lastTwo) >= 0;
        if (cons === 2) { cut = insep ? endV + 1 : endV + 2; }
        else { cut = insep ? nextV - 2 : nextV - 1; }
      }
      cuts.push(cut);
    }

    var sylls = [], from = 0;
    cuts.concat([u.length]).forEach(function (c) {
      sylls.push(u.slice(from, c).map(function (x) { return x.t; }).join(''));
      from = c;
    });
    return sylls;
  }

  function esc(s) {
    return s.replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }

  // HTML con sílabas alternas. mode 'word' (defecto): cada palabra empieza en rojo.
  // mode 'continuous': la alternancia sigue de una palabra a la siguiente.
  function colorize(text, mode) {
    var n = 0;
    return text.split(/(\s+)/).map(function (tok) {
      if (/^\s+$/.test(tok) || !tok) { return tok; }
      var m = tok.match(/^([¡¿"'(]*)(.*?)([.,;:!?"')]*)$/);
      var parts = syllabify(m[2]);
      if (mode !== 'continuous') { n = 0; }
      return esc(m[1]) + parts.map(function (s) {
        return '<span class="syl ' + (n++ % 2 ? 'syl-b' : 'syl-r') + '">' + esc(s) + '</span>';
      }).join('') + esc(m[3]);
    }).join('');
  }

  global.Syllables = { syllabify: syllabify, colorize: colorize };
  if (typeof module !== 'undefined') { module.exports = global.Syllables; }
})(typeof window !== 'undefined' ? window : globalThis);
