// ASSAULT — the workshop: one puzzle, to a board size and a difficulty.
//
// The booklet page never asks the engine for a particular board. It asks for a
// SEAT: plan() decides the tier and the difficulty band, POOL supplies the
// shape, and what comes out is whatever fits that seat. Here you pick the two
// things worth picking — how big, and how hard — and everything else is
// derived, because the rest are not questions with good answers. What makes a
// puzzle hard is the NUMBER OF UNITS, not the size of the board, so asking for
// the troops and the difficulty separately is asking the same thing twice, in
// numbers that can contradict each other.
//
// The gates are the same three build() applies for the booklet: exactly one
// solution, a difficulty inside the band, and — unless you turn it off — a
// board deducible() can finish without guessing.
window.ASSAULT_WORKSHOP = (function () {
  'use strict';
  var A = window.Assault;

  // ------------------------------------------------------------ the rungs
  // Five rungs over the meter of difficulty(): how many free cells are still
  // undecided once every DIRECT rule has been applied. That number is the work
  // left for the «if this one were a ram, that castle would overshoot» kind of
  // reasoning, so it is what the labels have to be honest about.
  //
  // The bands are the booklet's own — plan() opens on 0-5, ramps through 12-19
  // and sits at 19-26 — and they were re-cut after «gentle» was found to be
  // promising something it never delivered. It ran 0-8, and NO board in 200
  // sampled came out at 0: the meter's floor for a real puzzle is 2, so a rung
  // stretching to 8 was handing out boards with four times the leftover work of
  // its own easiest, all under the words «barely a puzzle».
  var BAND = {
    gentle:  [0, 3],
    easy:    [4, 10],
    sitting: [11, 18],
    siege:   [19, 26],
    hard:    [27, 999],
    any:     null
  };

  // Castles and troops for each board and each rung — a LIST per rung, and the
  // seed picks which. With one pair per rung, every puzzle of the same board
  // and difficulty came out with the same arsenal and the same castles, and
  // only the layout moved.
  //
  // MEASURED, not guessed: the distribution of difficulty() was sampled for
  // every (board, castles, troops) worth trying, a shortlist per rung came out
  // of that, and each candidate was then run through the actual hunt with its
  // band on and its mix drawn the way this file draws it. A pair is here only
  // if it came out on EVERY seed tried with none of them slow — a variant that
  // is merely usually fine is a coin flip that occasionally makes the page
  // look hung. `null` is a rung the board cannot reach at all: a small board
  // has no room to be hard, and pretending otherwise is a 30 s wait for
  // nothing. CLAUDE.md carries the table and how to re-measure it.
  var PICK = {                       // [castles, troops]
    6:  { gentle:  [[2, 4], [3, 4], [2, 5], [3, 5]],
          easy:    [[2, 5], [3, 5], [2, 6], [3, 6]],
          sitting: [[3, 6], [3, 7], [2, 6], [2, 7]],
          siege:   [[3, 7], [3, 8]],
          hard:    null },
    7:  { gentle:  [[2, 4], [3, 4], [2, 5], [3, 5]],
          easy:    [[2, 5], [3, 5], [2, 6], [3, 6]],
          sitting: [[3, 6], [3, 7], [2, 6], [2, 7]],
          siege:   [[3, 7], [3, 8], [4, 8]],
          hard:    [[3, 8], [4, 8]] },
    8:  { gentle:  [[3, 4], [3, 5], [4, 5]],
          easy:    [[3, 5], [3, 6], [4, 6], [2, 6]],
          sitting: [[3, 6], [4, 6], [3, 7], [4, 7]],
          siege:   [[4, 9], [3, 8], [4, 7], [3, 9], [5, 8]],
          hard:    [[4, 8], [4, 9], [4, 10]] }
  };

  // ------------------------------------------------------------ the spec
  var TYPES = ['S', 'R', 'A', 'C'];

  // The arsenal is drawn, not dealt: A.drawArsenal(n, rnd) is the engine's,
  // the same one the booklet now uses, so the two pages cannot drift apart on
  // what an arsenal of n units looks like. One of each type first, the rest
  // drawn, capped so no type is ever a majority — see js/engine.js.
  function arsenalOf(n, rnd) { return A.drawArsenal(n, rnd).join(''); }

  // Castles are added in this order, so each one asked for changes the board
  // rather than repeating it: a watchtower, then a two-cell tower, then the
  // fortress, and only then more towers. A ONE-castle board is never offered
  // anywhere, and that is measured too: with a single castle there is nothing
  // to pin the units against and the puzzle never comes out unique (~300 000
  // attempts across three board sizes, none of them unique, and it fails the
  // same way with the deducible filter off).
  var SHAPE_ORDER = ['watchtower', 'tower_v', 'fortress', 'watchtower', 'tower_h'];

  // Everything the form does not ask for. The separation drops to 2 once there
  // are four castles or more, because at 3 they simply stop fitting — the same
  // thing POOL does; forests follow the area, near what the pool uses at every
  // size.
  function spec(o) {
    var k = Math.max(2, Math.min(SHAPE_ORDER.length, o.castles));
    return {
      R: o.R,
      shapes: SHAPE_ORDER.slice(0, k),
      sep: k >= 4 ? 2 : 3,
      forests: o.forests == null ? Math.round(o.R * o.R / 10) : o.forests,
      // order() always hands the arsenal in; the fallback is for a caller that
      // asks for a spec by hand, and it needs an rng of its own to draw with.
      arsenal: o.arsenal || arsenalOf(o.troops, o.rnd || A.rng(1)),
      doubles: 1
    };
  }

  // What a board size, a rung and a seed come to. `any` borrows the siege
  // shapes and drops the band: a real puzzle's worth of units, and whatever it
  // measures. The seed picks the variant and draws the mix, so «Another one»
  // changes the arsenal and the castles, not only where they stand.
  function order(R, rung, seed) {
    var list = PICK[R] && PICK[R][rung === 'any' ? 'siege' : rung];
    if (!list) return null;
    var rnd = A.rng(seed || 1);
    var p = list[rnd.int(list.length)];
    return {
      spec: spec({ R: R, castles: p[0], arsenal: arsenalOf(p[1], rnd) }),
      band: BAND[rung]
    };
  }
  function reachable(R, rung) { return !!(PICK[R] && PICK[R][rung === 'any' ? 'siege' : rung]); }

  // ----------------------------------------------------------- the hunt
  // Sliced by the clock, not by a number of attempts: one attempt on a 6x6
  // costs a fraction of a millisecond and one on a full 7x7 can cost a second,
  // so a fixed count either stutters the page or wastes it. step(ms) returns
  // the puzzle, or null to say «call me again».
  //
  // A castle layout that cannot be placed at all is not a slow hunt, it is an
  // impossible one, and randCastles() says so by returning null every time.
  // That is caught in the first attempts instead of burning the whole budget.
  function hunt(sp, seed, human, band) {
    var rnd = A.rng(seed), tries = 0, noRoom = 0;
    var shapes = sp.shapes.map(function (f) { return A.SHAPES[f]; });
    var inv = sp.arsenal.split('');
    return {
      tries: function () { return tries; },
      step: function (ms) {
        var t0 = Date.now();
        while (Date.now() - t0 < ms) {
          tries++;
          var cs = A.randCastles(sp.R, shapes, rnd, sp.sep);
          if (!cs) {
            if (++noRoom >= 40) throw new Error('no-room');
            continue;
          }
          var d = A.build(rnd, sp.R, cs, sp.forests, inv,
                          { doubles: sp.doubles, human: human, band: band || null });
          if (d) { A.verify(d); d.diff = A.difficulty(d); return d; }
        }
        return null;
      }
    };
  }

  return { TYPES: TYPES, BAND: BAND, PICK: PICK, arsenalOf: arsenalOf,
           spec: spec, order: order, reachable: reachable, hunt: hunt };
})();

// ------------------------------------------------------------- the page
(function () {
  'use strict';
  if (!document.getElementById('gen')) return;      // not the workshop page

  var W = window.ASSAULT_WORKSHOP;
  var ART = window.ASSAULT_ART;
  var draw = window.ASSAULT_SHEET.draw;
  var PAL = ART.PAL;

  var $ = function (id) { return document.getElementById(id); };
  var num = function (id) { return parseInt($(id).value, 10) || 0; };

  var NAMES = { gentle: 'gentle', easy: 'easy', sitting: 'steady',
                siege: 'a siege', hard: 'hard', any: 'any' };
  // The band is printed next to the measurement, so the number means
  // something on sight: it is what the rung asked the search for.
  function band(rung) {
    var b = W.BAND[rung];
    return b ? ' (' + b[0] + '-' + (b[1] > 900 ? 'up' : b[1]) + ')' : '';
  }
  var ONE = { S: 'soldier', R: 'ram', A: 'archer', C: 'catapult' };
  var MANY = { S: 'soldiers', R: 'rams', A: 'archers', C: 'catapults' };

  var current = null;      // the puzzle on screen
  var running = null;      // the hunt in progress
  var timer = null;

  function say(txt, kind) {
    var s = $('status');
    s.textContent = txt;
    s.style.color = kind === 'bad' ? '#af2b21' : '';
  }

  // ---- a board that cannot be hard must not offer «hard». The option is
  // greyed out rather than removed, so the list does not change length under
  // the pointer, and a selection that stops being reachable falls back to the
  // hardest rung that is.
  function refreshRungs() {
    var R = num('board'), sel = $('diff'), fallback = 'any';
    Array.prototype.forEach.call(sel.options, function (o) {
      var ok = W.reachable(R, o.value);
      o.disabled = !ok;
      o.textContent = o.textContent.replace(/ · not on this board$/, '');
      if (!ok) o.textContent += ' · not on this board';
      // The fallback is the hardest rung the board does reach, which is the
      // last enabled one before «any» — dropping someone from «hard» to
      // «whatever comes out» would be a bigger change than they asked for.
      else if (o.value !== 'any') fallback = o.value;
    });
    if (sel.options[sel.selectedIndex].disabled) sel.value = fallback;
  }

  // ---- the sheet on screen
  function paint() {
    if (!current) return;
    draw($('sheet'), current, {
      width: 580, index: 0, solution: $('sol').checked,
      title: $('title').value.trim() || 'Workshop', badge: $('badge').value.trim() || '00'
    });
    var legend = $('legend');
    legend.innerHTML = '';
    current.castles.forEach(function (cells, k) {
      var li = document.createElement('li');
      li.style.color = PAL[k % PAL.length];
      li.textContent = 'Castle ' + (k + 1) + ' · ' + cells.length
        + (cells.length === 1 ? ' cell' : ' cells') + '  ·  exact resistance ' + current.res[k];
      legend.appendChild(li);
    });
    // What was decided on your behalf, and what it measured. The rung asks for
    // a band; the number is what this particular board came out at.
    var mix = {};
    current.inv.forEach(function (t) { mix[t] = (mix[t] || 0) + 1; });
    var troops = W.TYPES.filter(function (t) { return mix[t]; })
      .map(function (t) { return mix[t] + ' ' + (mix[t] > 1 ? MANY[t] : ONE[t]); }).join(', ');
    $('meter').textContent = current.R + 'x' + current.R + ' · ' + current.castles.length
      + ' castles · ' + current.forests.length + ' forests · ' + current.inv.length
      + ' troops (' + troops + ') · difficulty ' + current.diff
      + ' — asked for ' + NAMES[$('diff').value] + band($('diff').value);
    $('out').hidden = false;
  }

  // ---- the search, driven a slice at a time so the page stays alive
  function stop() {
    if (timer) clearTimeout(timer);
    timer = null; running = null;
    $('gen').disabled = false; $('cancel').hidden = true;
  }
  function tick(t0) {
    var got = null;
    try {
      got = running.step(70);
    } catch (e) {
      stop();
      say(e.message === 'no-room'
        ? 'the castles do not fit on this board.'
        : 'the search failed: ' + e.message, 'bad');
      return;
    }
    var ms = Date.now() - t0;
    if (got) {
      var tries = running.tries();      // stop() lets the hunt go
      current = got;
      stop();
      say('found in ' + tries + ' attempts (' + ms + ' ms)');
      paint();
      return;
    }
    if (ms > 30000) {
      stop();
      say('nothing came out in 30 s. This board can reach that difficulty, but not '
        + 'from this seed — press «Another one» to roll a different board.', 'bad');
      return;
    }
    say('searching… ' + running.tries() + ' attempts, ' + (ms / 1000).toFixed(1) + ' s');
    timer = setTimeout(function () { tick(t0); }, 0);
  }

  function generate() {
    stop();
    var o = W.order(num('board'), $('diff').value, num('seed'));
    if (!o) { say('a ' + num('board') + 'x' + num('board') + ' board cannot be that hard.', 'bad'); return; }
    $('gen').disabled = true; $('cancel').hidden = false;
    $('out').hidden = true;
    running = W.hunt(o.spec, num('seed'), $('human').checked, o.band);
    say('searching…');
    var t0 = Date.now();
    timer = setTimeout(function () { tick(t0); }, 0);
  }

  function png(solution) {
    var tmp = document.createElement('canvas');
    // The same 874 x dpr 2 the booklet exports: 1748x1240 px, half an A5 at
    // exactly 300 dpi.
    draw(tmp, current, {
      width: 874, dpr: 2, index: 0, solution: solution,
      title: $('title').value.trim() || 'Workshop', badge: $('badge').value.trim() || '00'
    });
    var a = document.createElement('a');
    a.download = 'assault_' + current.R + 'x' + current.R + '_' + $('diff').value
      + '_seed' + num('seed') + (solution ? '_solution' : '') + '.png';
    a.href = tmp.toDataURL('image/png');
    a.click();
  }

  // ---- wiring
  $('board').onchange = function () { refreshRungs(); generate(); };
  $('diff').onchange = generate;
  $('gen').onclick = generate;
  $('cancel').onclick = function () { stop(); say('search called off.'); };
  $('random').onclick = function () {
    $('seed').value = 1 + Math.floor(Math.random() * 999999);
    generate();
  };
  $('sol').onchange = paint;
  $('title').oninput = paint;
  $('badge').oninput = paint;
  $('pngPuzzle').onclick = function () { png(false); };
  $('pngSolution').onclick = function () { png(true); };
  $('print').onclick = function () { window.print(); };

  refreshRungs();
  // Nothing is drawn before the font and the icons are in: the canvas never
  // retries, and a sheet drawn early comes out in the fallback font with the
  // icon boxes empty.
  ART.ready.then(generate);
})();
