// ASSAULT — the interactive board.
//
// This is the fourth kind of surface, beside the puzzle sheet, the rule
// figures and the campaign road: the one a finger touches. It paints the
// SAME board the printed sheet paints — it borrows tree(), castleArt() and
// the palette from js/art.js on purpose — but it is square, it is sized to
// the screen instead of to the paper, and it knows where every cell is, so
// a tap can be turned into a row and a column.
//
// It could not be bolted onto js/sheet.js: draw() keeps its cell side, its
// origin and its mm() as locals and returns only the canvas, and the cell it
// computes depends on measuring the arsenal panel. Hit testing needs the
// geometry, so the geometry has to live somewhere that will hand it over.
//
// It knows nothing about the daily challenge, about dates or about storage.
// It takes a puzzle and the player's marks and draws them; everything that
// decides what a tap MEANS is the page's business (js/daily.js).
window.ASSAULT_PLAY = (function () {
  'use strict';
  var A = window.Assault, ART = window.ASSAULT_ART;
  var INK = ART.INK, MUTED = ART.MUTED, PAL = ART.PAL, TINT = ART.TINT;
  var GRID = ART.GRID, DOT = ART.DOT, BORDER = ART.BORDER;
  var FOREST_BG = ART.FOREST_BG;
  var roundBox = ART.roundBox, tree = ART.tree, castleArt = ART.castleArt;

  // The engine encodes a cell as an integer to put it in a Set, and it does
  // not export the encoder. It is re-stated here because the block sets this
  // file hands to A.damageTo() have to speak the same language; change one
  // and you must change the other. Only valid under 100 cells a side.
  function key(r, c) { return r * 100 + c; }
  function rowOf(k) { return Math.floor(k / 100); }
  function colOf(k) { return k % 100; }

  // The room reserved along the right edge and the bottom for the counts,
  // measured in cells — the same 0.62 the printed sheet reserves, so the
  // board on the screen and the board on the paper are the same proportions.
  var COUNTS = .62;
  // The sheet's own cell comes out around 9.2 mm on an 8x8 (79 mm of band
  // over 8.62 cells). Pinning that here is what lets every hairline, badge
  // and disc keep the millimetre measurements the sheet uses: mm() maps a
  // page millimetre onto this board's cell instead of onto a page width. No
  // fixed pixels anywhere, same rule as the sheets.
  var CELL_MM = 9.2;

  // ------------------------------------------------------------- the state
  // The player's state is ONLY what the player put there: a type per cell
  // and a pencil mark per cell. Everything else a board can say — how many
  // units a row holds, what is left of the arsenal, what each castle has
  // taken, which units touch, whether it is finished — is recomputed by
  // read() on every change. Sixty-four cells makes that free, and a cached
  // derived field is exactly how a board comes to lie after an undo.
  function newState() { return { units: {}, empty: {} }; }

  // Compact enough to be both the storage format and an undo snapshot: four
  // characters a unit, three a pencil mark, so a full 8x8 is under 100 bytes
  // and the undo ring can simply keep whole boards.
  function pad3(k) { return (k < 10 ? '00' : k < 100 ? '0' : '') + k; }
  function encode(st) {
    var u = [], e = [], k;
    for (k in st.units) if (st.units[k]) u.push(pad3(+k) + st.units[k]);
    for (k in st.empty) if (st.empty[k]) e.push(pad3(+k));
    return u.sort().join('') + '|' + e.sort().join('');
  }
  function decode(s) {
    var st = newState(), parts = String(s || '|').split('|'), i;
    for (i = 0; i + 3 < parts[0].length + 1; i += 4) {
      st.units[+parts[0].slice(i, i + 3)] = parts[0].charAt(i + 3);
    }
    for (i = 0; i + 2 < parts[1].length + 1; i += 3) {
      st.empty[+parts[1].slice(i, i + 3)] = 1;
    }
    return st;
  }

  // What a cell will take. It is the single place that decides, so the page
  // never has to re-derive it and the two can never disagree.
  function legal(d, st, r, c) {
    var k = key(r, c), i, j;
    for (i = 0; i < d.castles.length; i++) {
      for (j = 0; j < d.castles[i].length; j++) {
        if (key(d.castles[i][j][0], d.castles[i][j][1]) === k) return 'castle';
      }
    }
    for (i = 0; i < d.forests.length; i++) {
      if (key(d.forests[i][0], d.forests[i][1]) === k) return 'forest';
    }
    return null;
  }

  // ------------------------------------------------------------ the reading
  // One pure function, run after every change. It reports the board as it
  // stands — including everything that is WRONG with it, because a board that
  // quietly refused an illegal placement would be hiding the player's own
  // mistake, and showing it is what the board is for.
  function read(d, st) {
    var R = d.R, i, k, r, c;
    var rowUsed = [], colUsed = [], rowState = [], colState = [];
    for (i = 0; i < R; i++) { rowUsed.push(0); colUsed.push(0); }

    var cells = [], used = { S: 0, R: 0, A: 0, C: 0 };
    for (k in st.units) {
      if (!st.units[k]) continue;
      r = rowOf(+k); c = colOf(+k);
      rowUsed[r]++; colUsed[c]++;
      used[st.units[k]] = (used[st.units[k]] || 0) + 1;
      cells.push({ k: +k, cell: [r, c], type: st.units[k] });
    }
    for (i = 0; i < R; i++) {
      rowState.push(rowUsed[i] === d.rowc[i] ? 'met' : rowUsed[i] > d.rowc[i] ? 'over' : 'under');
      colState.push(colUsed[i] === d.colc[i] ? 'met' : colUsed[i] > d.colc[i] ? 'over' : 'under');
    }

    var have = {}, left = {}, over = {};
    d.inv.forEach(function (t) { have[t] = (have[t] || 0) + 1; });
    Object.keys(used).forEach(function (t) {
      left[t] = (have[t] || 0) - used[t];
      over[t] = left[t] < 0;
    });

    // Units that touch, diagonals included. Both cells are flagged: the pair
    // is the mistake, and marking only one of them reads as an accusation.
    var touching = {};
    for (i = 0; i < cells.length; i++) {
      for (var j = i + 1; j < cells.length; j++) {
        if (A.adjacent(cells[i].cell, cells[j].cell)) {
          touching[cells[i].k] = 1; touching[cells[j].k] = 1;
        }
      }
    }

    // What each castle has taken so far. The block sets are built exactly as
    // the engine builds them, and the firing unit's own cell is taken OUT of
    // `all` and put back for each measurement — leave that out and every
    // unit blocks itself, and the tally silently reads zero.
    var all = new Set(), cast = new Set();
    d.forests.forEach(function (p) { all.add(key(p[0], p[1])); });
    d.castles.forEach(function (cs) {
      cs.forEach(function (p) { all.add(key(p[0], p[1])); cast.add(key(p[0], p[1])); });
    });
    cells.forEach(function (u) { all.add(u.k); });
    var blocks = { all: all, castles: cast };

    var dealt = d.castles.map(function () { return 0; });
    var idle = {};
    cells.forEach(function (u) {
      all['delete'](u.k);
      var hit = 0;
      d.castles.forEach(function (cs, q) {
        var dm = A.damageTo(u.cell, u.type, cs, blocks);
        dealt[q] += dm; if (dm) hit++;
      });
      all.add(u.k);
      if (!hit) idle[u.k] = 1;      // a unit that reaches nothing: never valid
    });

    return {
      rowUsed: rowUsed, colUsed: colUsed,
      rowState: rowState, colState: colState,
      used: used, left: left, over: over,
      touching: touching, idle: idle, dealt: dealt,
      placed: cells.length, total: d.inv.length
    };
  }

  // The solution is unique, so comparing sets is exact — there is no second
  // right answer to be unfair about.
  function solved(d, st) {
    var n = 0, k;
    for (k in st.units) if (st.units[k]) n++;
    if (n !== d.sol.length) return false;
    for (var i = 0; i < d.sol.length; i++) {
      var s = d.sol[i];
      if (st.units[key(s.cell[0], s.cell[1])] !== s.type) return false;
    }
    return true;
  }

  function wrong(d, st) {
    var right = {}, out = [], k;
    d.sol.forEach(function (s) { right[key(s.cell[0], s.cell[1])] = s.type; });
    for (k in st.units) if (st.units[k] && right[k] !== st.units[k]) out.push(+k);
    return out;
  }

  function fill(d, st) {
    st.units = {}; st.empty = {};
    d.sol.forEach(function (s) { st.units[key(s.cell[0], s.cell[1])] = s.type; });
    return st;
  }

  // ------------------------------------------------------------- the board
  // create() returns a live object: it owns the canvas, its geometry and its
  // resize handling, and hands the geometry back through geom() and hit().
  function create(canvas, opts) {
    opts = opts || {};
    var max = opts.max || 560, min = opts.min || 200;
    var g = canvas.getContext('2d');
    var d = null, st = null, view = {};
    var side = 0, c = 0, x0 = 0, y0 = 0, dpr = 1;
    var timer = null, obs = null;

    function mm(v) { return v * c / CELL_MM; }
    function face(size, weight) {
      return (weight || 400) + ' ' + mm(size) + 'px "Roboto Slab", Georgia, serif';
    }
    function X(q) { return x0 + q * c; }
    function Y(q) { return y0 + q * c; }

    // The side the parent box allows, in CSS pixels.
    function fit() {
      var box = canvas.parentNode, pw = 0, ph = 0;
      if (box && box.getBoundingClientRect) {
        var b = box.getBoundingClientRect();
        pw = b.width; ph = b.height;
      }
      return Math.max(min, Math.floor(Math.min(pw || max, ph || max, max)));
    }

    function layout() {
      side = fit();
      var pad = Math.max(2, side * .012);
      c = (side - pad * 2) / ((d ? d.R : 8) + COUNTS);
      x0 = pad; y0 = pad;
      dpr = opts.dpr || window.devicePixelRatio || 1;
      g.setTransform(1, 0, 0, 1, 0, 0);
      canvas.width = Math.round(side * dpr);
      canvas.height = Math.round(side * dpr);
      canvas.style.width = side + 'px';
      canvas.style.height = side + 'px';
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.imageSmoothingQuality = 'high';
    }

    function render() {
      if (!d) return;
      var R = d.R, rd = read(d, st), i;
      g.clearRect(0, 0, side, side);
      g.fillStyle = '#fff'; g.fillRect(0, 0, side, side);

      // ---- grounds
      d.castles.forEach(function (cells, k) {
        g.fillStyle = TINT[k % TINT.length];
        cells.forEach(function (p) { g.fillRect(X(p[1]), Y(p[0]), c, c); });
      });
      d.forests.forEach(function (p) {
        g.fillStyle = FOREST_BG; g.fillRect(X(p[1]), Y(p[0]), c, c);
      });

      // ---- the pencil marks, under the grid: they are a note to self, not
      // a piece on the board, and they must never compete with a unit.
      g.fillStyle = DOT;
      Object.keys(st.empty).forEach(function (k) {
        if (!st.empty[k]) return;
        g.beginPath();
        g.arc(X(colOf(+k)) + c / 2, Y(rowOf(+k)) + c / 2, c * .11, 0, Math.PI * 2);
        g.fill();
      });

      // ---- grid
      g.strokeStyle = GRID; g.lineWidth = mm(.22);
      g.beginPath();
      for (i = 0; i <= R; i++) {
        g.moveTo(X(0), Y(i)); g.lineTo(X(R), Y(i));
        g.moveTo(X(i), Y(0)); g.lineTo(X(i), Y(R));
      }
      g.stroke();
      g.fillStyle = DOT;
      for (var r1 = 1; r1 < R; r1++) {
        for (var c1 = 1; c1 < R; c1++) {
          g.beginPath(); g.arc(X(c1), Y(r1), mm(.34), 0, Math.PI * 2); g.fill();
        }
      }
      g.strokeStyle = BORDER; g.lineWidth = mm(.5);
      g.strokeRect(X(0), Y(0), R * c, R * c);

      // The trees go over the grid: in black and white a hairline across a
      // black fir is all the eye sees of the cell.
      d.forests.forEach(function (p) { tree(g, X(p[1]), Y(p[0]), c); });

      // ---- castles, exactly as the sheet draws them
      d.castles.forEach(function (cells, k) {
        var col = PAL[k % PAL.length];
        var rs = cells.map(function (p) { return p[0]; });
        var cs = cells.map(function (p) { return p[1]; });
        var r0 = Math.min.apply(null, rs), r9 = Math.max.apply(null, rs);
        var c0 = Math.min.apply(null, cs), c9 = Math.max.apply(null, cs);
        var bw = (c9 - c0 + 1) * c, bh = (r9 - r0 + 1) * c;

        var ins0 = mm(.5);
        g.strokeStyle = col; g.lineWidth = mm(.45);
        roundBox(g, X(c0) + ins0, Y(r0) + ins0, bw - ins0 * 2, bh - ins0 * 2, mm(1.2));
        g.stroke();
        castleArt(g, X(c0), Y(r0), bw, bh, col, c);

        var sq = Math.min(c * .38, mm(4.6)), ins = mm(.45);
        var ex = X(c0) + ins, ey = Y(r0) + ins;
        roundBox(g, ex, ey, sq, sq, sq * .26);
        g.fillStyle = '#fff'; g.fill();
        g.strokeStyle = col; g.lineWidth = mm(.4); g.stroke();
        var res = String(d.res[k]), fs = sq * .70 / mm(1);
        do { g.font = face(fs, 700); fs -= .15; }
        while (g.measureText(res).width > sq * .70 && fs > .5);
        g.fillStyle = col;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(res, ex + sq / 2, ey + sq / 2 + mm(.1));

        // ---- the running tally, the one thing the paper cannot do. It is
        // arithmetic the player could do by hand on every move, and doing it
        // by hand on a phone is the part that stops being a game.
        if (view.damage) {
          var got = rd.dealt[k], txt = got + '/' + d.res[k];
          var exact = got === d.res[k], past = got > d.res[k];
          g.font = face(Math.min(3.1, c * .22 / mm(1)), 700);
          var tw = g.measureText(txt).width, tp = mm(.9);
          var cw = tw + tp * 2, ch = mm(3.9);
          var cx = X(c0) + bw - cw - mm(.5), cy = Y(r0) + bh - ch - mm(.5);
          roundBox(g, cx, cy, cw, ch, ch * .32);
          g.fillStyle = '#fff'; g.fill();
          g.strokeStyle = exact ? INK : MUTED;
          g.lineWidth = exact ? mm(.55) : mm(.3);
          g.stroke();
          g.fillStyle = exact ? INK : MUTED;
          g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText(txt, cx + cw / 2, cy + ch / 2 + mm(.1));
          if (past) {                       // overshooting is as invalid as falling short
            g.strokeStyle = INK; g.lineWidth = mm(.4);
            g.beginPath();
            g.moveTo(cx + tp * .4, cy + ch / 2); g.lineTo(cx + cw - tp * .4, cy + ch / 2);
            g.stroke();
          }
        }
      });

      // ---- the counts. They fade when the line is satisfied and are struck
      // through when it holds too many: the player's own arithmetic read
      // back, never a hint about the answer.
      g.font = face(Math.min(4.4, c / mm(1) * .48), 700);
      for (i = 0; i < R; i++) {
        count(String(d.colc[i]), X(i) + c / 2, Y(R) + c * .34, rd.colState[i]);
        count(String(d.rowc[i]), X(R) + c * .34, Y(i) + c / 2, rd.rowState[i]);
      }

      // ---- the player's units: the solution sheet's disc, so what is on the
      // screen is what would have been on the paper.
      var bad = {};
      (view.wrong || []).forEach(function (k) { bad[k] = 1; });
      Object.keys(st.units).forEach(function (k) {
        var t = st.units[k];
        if (!t) return;
        var cx = X(colOf(+k)) + c / 2, cy = Y(rowOf(+k)) + c / 2;
        g.beginPath(); g.arc(cx, cy, c * .32, 0, Math.PI * 2);
        g.fillStyle = '#fff'; g.fill();
        g.strokeStyle = INK; g.lineWidth = mm(.35); g.stroke();
        g.fillStyle = INK; g.font = face(Math.min(4.4, c / mm(1) * .44), 700);
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(t, cx, cy + mm(.2));
        // A second ring for a unit that touches another or reaches nothing.
        // Monochrome, so the mark is a shape and never a colour.
        if (rd.touching[k] || rd.idle[k]) {
          g.beginPath(); g.arc(cx, cy, c * .42, 0, Math.PI * 2);
          g.strokeStyle = INK; g.lineWidth = mm(.3);
          if (g.setLineDash) g.setLineDash([mm(1), mm(.9)]);
          g.stroke();
          if (g.setLineDash) g.setLineDash([]);
        }
        if (bad[k]) {                        // what Check lights up
          g.strokeStyle = INK; g.lineWidth = mm(.55);
          var a = c * .22;
          g.beginPath();
          g.moveTo(cx - a, cy - a); g.lineTo(cx + a, cy + a);
          g.moveTo(cx + a, cy - a); g.lineTo(cx - a, cy + a);
          g.stroke();
        }
      });

      // ---- the flash: the answer to a tap that could not land anywhere
      if (view.flash != null) {
        g.fillStyle = 'rgba(20,20,20,.14)';
        g.fillRect(X(colOf(view.flash)), Y(rowOf(view.flash)), c, c);
      }
    }

    function count(txt, cx, cy, state) {
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = state === 'met' ? DOT : INK;
      g.fillText(txt, cx, cy);
      if (state === 'over') {
        var w = g.measureText(txt).width;
        g.strokeStyle = INK; g.lineWidth = mm(.4);
        g.beginPath(); g.moveTo(cx - w * .8, cy); g.lineTo(cx + w * .8, cy); g.stroke();
      }
    }

    // Assigning canvas.width wipes the canvas, so layout() and render() only
    // ever go together: a relayout that skipped the repaint left a blank board.
    function resize() {
      if (fit() === side) return;
      layout();
      render();
    }
    // The mobile URL bar shows and hides on every scroll and fires resize the
    // whole way; a full relayout per event is visible jank, so the work is
    // debounced and then skipped outright when the board's side has not moved.
    function bounce() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () { timer = null; resize(); }, 80);
    }

    if (typeof ResizeObserver !== 'undefined' && canvas.parentNode) {
      obs = new ResizeObserver(bounce);
      obs.observe(canvas.parentNode);
    } else {
      window.addEventListener('resize', bounce);
      window.addEventListener('orientationchange', bounce);
    }

    return {
      canvas: canvas,
      setPuzzle: function (p, s) { d = p; st = s; layout(); render(); },
      setView: function (v) {
        for (var k in v) view[k] = v[k];
        render();
      },
      resize: resize,
      render: render,
      geom: function () { return { R: d ? d.R : 0, c: c, x0: x0, y0: y0, side: side }; },
      cellBox: function (r, cc) { return { x: X(cc), y: Y(r), w: c, h: c }; },
      // Client coordinates, never canvas.width: that is the dpr-multiplied
      // backing store, and CSS may have letterboxed the element besides.
      hit: function (clientX, clientY) {
        if (!d) return null;
        var b = canvas.getBoundingClientRect();
        if (!b.width) return null;
        var s = side / b.width;
        var cc = Math.floor(((clientX - b.left) * s - x0) / c);
        var rr = Math.floor(((clientY - b.top) * s - y0) / c);
        if (rr < 0 || cc < 0 || rr >= d.R || cc >= d.R) return null;
        return [rr, cc];
      },
      destroy: function () {
        if (timer) clearTimeout(timer);
        if (obs) obs.disconnect();
        window.removeEventListener('resize', bounce);
        window.removeEventListener('orientationchange', bounce);
      }
    };
  }

  return {
    key: key, rowOf: rowOf, colOf: colOf,
    newState: newState, encode: encode, decode: decode,
    legal: legal, read: read, solved: solved, wrong: wrong, fill: fill,
    create: create
  };
})();
