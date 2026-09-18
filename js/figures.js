// ASSAULT — the diagrams that go with the rules.
//
// They reuse the sheet palette and its tree/castleArt helpers on purpose:
// what the instructions show has to be literally what the printed puzzle
// shows, so changing the art of a castle updates the rules on its own.
window.ASSAULT_FIGURES = (function () {
  'use strict';
  var ART = window.ASSAULT_ART;
  var INK = ART.INK, MUTED = ART.MUTED, PAL = ART.PAL, TINT = ART.TINT;
  var GRID = ART.GRID, BORDER = ART.BORDER, FOREST_BG = ART.FOREST_BG;
  var diamond = ART.diamond, roundBox = ART.roundBox;
  var tree = ART.tree, castleArt = ART.castleArt;

  // Black and white like everything else: what tells a legal placement from
  // an illegal one is the SHAPE of the mark, the tick or the cross, not its
  // colour — which is the only thing that survives a photocopier anyway.
  var OK = INK, NO = INK, HIT = '#e7e5e0';

  function ff(size, peso) {
    return (peso || 400) + ' ' + size + 'px "Roboto Slab", Georgia, serif';
  }

  // Unit marker: the same white token with the letter that marks the solution.
  function token(g, cx, cy, u, t, faded) {
    g.globalAlpha = faded ? .4 : 1;
    g.beginPath(); g.arc(cx, cy, u * .33, 0, Math.PI * 2);
    g.fillStyle = '#fff'; g.fill();
    g.strokeStyle = INK; g.lineWidth = u * .055; g.stroke();
    g.fillStyle = INK; g.font = ff(u * .44, 700);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(t, cx, cy + u * .02);
    g.globalAlpha = 1;
  }

  function crossMark(g, cx, cy, r, col) {
    g.strokeStyle = col; g.lineWidth = r * .42; g.lineCap = 'round';
    g.beginPath();
    g.moveTo(cx - r * .58, cy - r * .58); g.lineTo(cx + r * .58, cy + r * .58);
    g.moveTo(cx + r * .58, cy - r * .58); g.lineTo(cx - r * .58, cy + r * .58);
    g.stroke(); g.lineCap = 'butt';
  }

  function tickMark(g, cx, cy, r, col) {
    g.strokeStyle = col; g.lineWidth = r * .42;
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(cx - r * .62, cy); g.lineTo(cx - r * .12, cy + r * .5);
    g.lineTo(cx + r * .64, cy - r * .52);
    g.stroke(); g.lineCap = 'butt';
  }

  // "You may not put a unit here": a ring with a slash, which leaves the
  // forest or the castle underneath still readable.
  function banSign(g, cx, cy, r, col) {
    var d = r * Math.SQRT1_2;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.moveTo(cx - d, cy + d); g.lineTo(cx + d, cy - d);
    // white halo first: the sign also has to read on top of a red castle
    g.strokeStyle = '#fff'; g.lineWidth = r * .50; g.stroke();
    g.strokeStyle = col; g.lineWidth = r * .30; g.stroke();
  }

  // Line of fire: straight for the melee and the flat shot, arced for the
  // catapult; dashed and crossed out where something cuts it.
  function shot(g, x1, y1, x2, y2, u, o) {
    var col = o.ok === false ? NO : OK;
    var dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
    var ux = dx / len, uy = dy / len;
    // On an adjacent target the two cells almost touch: with fixed margins
    // the arrow came out a few pixels long and simply was not seen.
    var tail = Math.min(u * .36, len * .26), head = Math.min(u * .40, len * .28);
    var sx = x1 + ux * tail, sy = y1 + uy * tail;         // leaves the token
    var ex = x2 - ux * head, ey = y2 - uy * head;         // stops at the target
    var bulge = o.arc ? Math.min(len * .34, u * .95) : 0;
    var qx = (sx + ex) / 2 - uy * bulge, qy = (sy + ey) / 2 + ux * bulge;
    // midpoint of the curve, where the damage tag goes
    var mx = o.arc ? (sx + 2 * qx + ex) / 4 : (sx + ex) / 2;
    var my = o.arc ? (sy + 2 * qy + ey) / 4 : (sy + ey) / 2;

    g.strokeStyle = col; g.lineWidth = u * .07;
    if (o.ok === false) g.setLineDash([u * .16, u * .14]);
    g.beginPath();
    g.moveTo(sx, sy);
    if (o.arc) g.quadraticCurveTo(qx, qy, ex, ey); else g.lineTo(ex, ey);
    g.stroke();
    g.setLineDash([]);

    if (o.ok !== false) {                       // arrowhead on the target
      var ax = o.arc ? ex - qx : dx, ay = o.arc ? ey - qy : dy;
      var al = Math.hypot(ax, ay) || 1, hx = ax / al, hy = ay / al, s = u * .24;
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(ex, ey);
      g.lineTo(ex - hx * s - hy * s * .55, ey - hy * s + hx * s * .55);
      g.lineTo(ex - hx * s + hy * s * .55, ey - hy * s - hx * s * .55);
      g.closePath(); g.fill();
    }
    if (o.lab) {                                // damage tag, on the line
      g.font = ff(u * .40, 700);
      var w = g.measureText(o.lab).width + u * .34, h = u * .42;
      roundBox(g, mx - w / 2, my - h / 2, w, h, h * .45);
      g.fillStyle = '#fff'; g.fill();
      g.strokeStyle = col; g.lineWidth = u * .05; g.stroke();
      g.fillStyle = col;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(o.lab, mx, my + u * .02);
    }
  }

  // One little board. Everything in the scene is optional: it declares only
  // what its rule needs to be visible.
  function scene(g, s, ox, oy, u) {
    var X = function (c) { return ox + c * u; }, Y = function (r) { return oy + r * u; };
    var mid = function (p) { return [X(p[1]) + u / 2, Y(p[0]) + u / 2]; };

    (s.hits || []).forEach(function (p) {       // cells the unit can reach
      g.fillStyle = HIT; g.fillRect(X(p[1]), Y(p[0]), u, u);
      g.fillStyle = MUTED; diamond(g, X(p[1]) + u / 2, Y(p[0]) + u / 2, u * .11);
    });
    (s.forests || []).forEach(function (p) {
      g.fillStyle = FOREST_BG; g.fillRect(X(p[1]), Y(p[0]), u, u);
      tree(g, X(p[1]), Y(p[0]), u);
    });
    (s.castles || []).forEach(function (k) {
      var col = PAL[(k.p || 0) % PAL.length], w = (k.w || 1) * u, h = (k.h || 1) * u;
      g.fillStyle = TINT[(k.p || 0) % TINT.length];
      g.fillRect(X(k.c), Y(k.r), w, h);
      castleArt(g, X(k.c), Y(k.r), w, h, col, u);
      g.strokeStyle = col; g.lineWidth = u * .05;
      roundBox(g, X(k.c) + u * .05, Y(k.r) + u * .05, w - u * .1, h - u * .1, u * .12);
      g.stroke();
      if (k.res == null) return;
      var side = u * .42, ex = X(k.c) + u * .07, ey = Y(k.r) + u * .07;
      roundBox(g, ex, ey, side, side, side * .26);
      g.fillStyle = '#fff'; g.fill();
      g.strokeStyle = col; g.lineWidth = u * .045; g.stroke();
      g.fillStyle = col; g.font = ff(side * .74, 700);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(k.res), ex + side / 2, ey + side / 2 + u * .01);
    });

    g.strokeStyle = GRID; g.lineWidth = 1;
    g.beginPath();
    for (var i = 0; i <= s.h; i++) { g.moveTo(X(0), Y(i)); g.lineTo(X(s.w), Y(i)); }
    for (var j = 0; j <= s.w; j++) { g.moveTo(X(j), Y(0)); g.lineTo(X(j), Y(s.h)); }
    g.stroke();
    g.strokeStyle = BORDER; g.lineWidth = 1.2;
    g.strokeRect(X(0), Y(0), s.w * u, s.h * u);

    (s.bans || []).forEach(function (p) {       // cells no other unit may use
      var m = mid(p);
      g.globalAlpha = .55; crossMark(g, m[0], m[1], u * .19, NO); g.globalAlpha = 1;
    });
    (s.shots || []).forEach(function (o) {
      var a = mid(o.a), b = mid(o.b);
      shot(g, a[0], a[1], b[0], b[1], u, o);
    });
    (s.units || []).forEach(function (p) {
      var m = mid([p.r, p.c]); token(g, m[0], m[1], u, p.t);
    });
    (s.bad || []).forEach(function (p) {        // a cell no unit may occupy
      var m = mid(p);
      banSign(g, m[0], m[1], u * .27, NO);
    });
    (s.stops || []).forEach(function (p) {      // what cuts the line of fire
      var m = mid(p);
      g.beginPath(); g.arc(m[0], m[1], u * .26, 0, Math.PI * 2);
      g.fillStyle = '#fff'; g.globalAlpha = .55; g.fill(); g.globalAlpha = 1;
      crossMark(g, m[0], m[1], u * .22, NO);
    });

    g.fillStyle = INK; g.font = ff(u * .46, 700);
    if (s.cols) {
      g.textAlign = 'center'; g.textBaseline = 'bottom';
      s.cols.forEach(function (v, k) { g.fillText(String(v), X(k) + u / 2, Y(0) - u * .18); });
    }
    if (s.rows) {
      g.textAlign = 'left'; g.textBaseline = 'middle';
      s.rows.forEach(function (v, k) { g.fillText(String(v), X(s.w) + u * .24, Y(k) + u / 2); });
    }
    if (s.ruler) {                              // distance from the unit, in cells
      g.fillStyle = MUTED; g.font = ff(u * .44, 700);
      g.textAlign = 'center'; g.textBaseline = 'bottom';
      for (var d = 1; d < s.w; d++) g.fillText(String(d), X(d) + u / 2, Y(0) - u * .18);
    }
  }

  // A figure is one or more scenes in a row, each with its caption. The grids
  // are aligned to a common top so that the pair reads as a comparison.
  //
  // Measuring and painting are split because the same figure goes to two
  // places: its own canvas inside the rules on the page (screen pixels) and
  // straight onto the A5 sheet of the rules PNG (millimetres). Everything
  // scales with u and with the metrics in m, so neither knows about the other.
  function figureBox(g, scenes, u, m) {
    m = { pad: (m && m.pad) || 4, gap: (m && m.gap) || 18,
          cap: (m && m.cap) || 17, fs: (m && m.fs) || 11.5 };
    var top = scenes.reduce(function (a, s) {
      return Math.max(a, (s.cols || s.ruler) ? u * .78 : m.pad);
    }, m.pad);
    g.font = ff(m.fs);
    var boxes = scenes.map(function (s) {
      // the box has to hold the caption too, or two narrow scenes side
      // by side end up with their captions written on top of each other
      var grid = s.w * u + m.pad + (s.rows ? u * .8 : m.pad);
      var cap = s.cap ? g.measureText(s.cap).width
                        + (s.ok == null ? 0 : m.fs * 1.30) + m.fs * .52 : 0;
      return { s: s, grid: grid, w: Math.max(grid, cap),
               h: top + s.h * u + m.pad + (s.cap ? m.cap : 0) };
    });
    return {
      boxes: boxes, top: top, u: u, m: m,
      w: boxes.length ? boxes.reduce(function (a, b) { return a + b.w; }, 0)
                        + m.gap * (boxes.length - 1) : 0,
      h: boxes.reduce(function (a, b) { return Math.max(a, b.h); }, 0)
    };
  }

  // Paints a measured figure with its top-left corner at (ox, oy).
  function figurePaint(g, fb, ox, oy) {
    var u = fb.u, m = fb.m, x = ox;
    fb.boxes.forEach(function (b) {
      scene(g, b.s, x + (b.w - b.grid) / 2 + m.pad, oy + fb.top, u);
      if (b.s.cap) {
        var y = oy + fb.h - m.cap / 2 + m.fs * .09;
        var r = m.fs * .48, pad = b.s.ok == null ? 0 : r * 2.7;
        g.font = ff(m.fs);
        var tw = g.measureText(b.s.cap).width;
        var cx = x + b.w / 2 - (tw + pad) / 2;
        if (b.s.ok === true) tickMark(g, cx + r, y, r, OK);
        if (b.s.ok === false) crossMark(g, cx + r, y, r, NO);
        g.fillStyle = b.s.ok === false ? NO : (b.s.ok ? OK : MUTED);
        g.textAlign = 'left'; g.textBaseline = 'middle';
        g.fillText(b.s.cap, cx + pad, y);
      }
      x += b.w + m.gap;
    });
  }

  function drawFigure(canvas, scenes, u) {
    var g = canvas.getContext('2d');
    var fb = figureBox(g, scenes, u);
    var dpr = 2;                                // fixed: these are small drawings
    canvas.width = Math.round(fb.w * dpr); canvas.height = Math.round(fb.h * dpr);
    canvas.style.width = fb.w + 'px'; canvas.style.height = fb.h + 'px';
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    figurePaint(g, fb, 0, 0);
    return canvas;
  }

  // The scenes, one per rule. The key is the data-fig of the <li>, or of the
  // cell in the unit table; a rule with no figure simply comes out as text.
  var K = function (r, c, extra) {
    var o = { r: r, c: c };
    for (var p in extra) o[p] = extra[p];
    return o;
  };
  var FIGS = {
    // --- unit table: how far each one reaches, counted from its own cell
    'range-S': [{ w: 5, h: 1, ruler: 1, units: [{ r: 0, c: 0, t: 'S' }], hits: [[0, 1]] }],
    'range-R': [{ w: 5, h: 1, ruler: 1, units: [{ r: 0, c: 0, t: 'R' }], hits: [[0, 1]] }],
    'range-A': [{ w: 5, h: 1, ruler: 1, units: [{ r: 0, c: 0, t: 'A' }], hits: [[0, 2], [0, 3]] }],
    'range-C': [{ w: 6, h: 1, ruler: 1, units: [{ r: 0, c: 0, t: 'C' }], hits: [[0, 3], [0, 4], [0, 5]] }],

    // --- the daily's unit cards: where each unit hits from, and where it
    // does not. The daily draws each scene on its own canvas so they wrap
    // on a narrow phone; nothing in the booklet reads these.
    'unit-S': [
      { w: 2, h: 1, cap: 'next to it', ok: true, castles: [K(0, 0, { p: 0 })],
        units: [{ r: 0, c: 1, t: 'S' }], shots: [{ a: [0, 1], b: [0, 0] }] },
      { w: 2, h: 2, cap: 'diagonal', ok: false, castles: [K(0, 0, { p: 0 })],
        units: [{ r: 1, c: 1, t: 'S' }], shots: [{ a: [1, 1], b: [0, 0], ok: false }] }
    ],
    'unit-R': [
      { w: 2, h: 1, cap: 'next to it', ok: true, castles: [K(0, 0, { p: 0 })],
        units: [{ r: 0, c: 1, t: 'R' }], shots: [{ a: [0, 1], b: [0, 0] }] },
      { w: 3, h: 1, cap: 'two cells away', ok: false, castles: [K(0, 0, { p: 0 })],
        units: [{ r: 0, c: 2, t: 'R' }], shots: [{ a: [0, 2], b: [0, 0], ok: false }] }
    ],
    'unit-A': [
      { w: 4, h: 1, cap: 'clear line', ok: true, castles: [K(0, 0, { p: 0 })],
        units: [{ r: 0, c: 3, t: 'A' }], shots: [{ a: [0, 3], b: [0, 0], lab: '1' }] },
      { w: 3, h: 1, cap: 'forest in the way', ok: false, castles: [K(0, 0, { p: 0 })],
        forests: [[0, 1]], units: [{ r: 0, c: 2, t: 'A' }],
        shots: [{ a: [0, 2], b: [0, 0], ok: false }], stops: [[0, 1]] },
      { w: 2, h: 1, cap: 'too close', ok: false, castles: [K(0, 0, { p: 0 })],
        units: [{ r: 0, c: 1, t: 'A' }] }
    ],
    'unit-C': [
      { w: 5, h: 1, cap: 'over forest and units', ok: true, castles: [K(0, 0, { p: 0 })],
        forests: [[0, 1]], units: [{ r: 0, c: 2, t: 'A' }, { r: 0, c: 4, t: 'C' }],
        shots: [{ a: [0, 4], b: [0, 0], arc: true }] },
      { w: 4, h: 1, cap: 'castle in the way', ok: false,
        castles: [K(0, 0, { p: 0 }), K(0, 2, { p: 1 })], units: [{ r: 0, c: 3, t: 'C' }],
        shots: [{ a: [0, 3], b: [0, 0], arc: true, ok: false }], stops: [[0, 2]] },
      { w: 3, h: 1, cap: 'too close', ok: false, castles: [K(0, 0, { p: 0 })],
        units: [{ r: 0, c: 2, t: 'C' }] }
    ],

    // --- the rules, in the order of the list
    fixed: [
      { w: 3, h: 1, cap: '2 cells away', castles: [K(0, 0, { p: 2 })],
        units: [{ r: 0, c: 2, t: 'A' }], shots: [{ a: [0, 2], b: [0, 0], lab: '1' }] },
      { w: 4, h: 1, cap: '3 cells away', castles: [K(0, 0, { p: 2 })],
        units: [{ r: 0, c: 3, t: 'A' }], shots: [{ a: [0, 3], b: [0, 0], lab: '1' }] }
    ],
    empty: [
      { w: 1, h: 1, u: 38, cap: 'empty cell', ok: true, units: [{ r: 0, c: 0, t: 'S' }] },
      { w: 1, h: 1, cap: 'forest', ok: false, forests: [[0, 0]], bad: [[0, 0]] },
      { w: 1, h: 1, cap: 'castle', ok: false, castles: [K(0, 0, { p: 0 })], bad: [[0, 0]] }
    ],
    touch: [
      { w: 4, h: 3, cap: 'two cells apart is enough', ok: true,
        units: [{ r: 1, c: 1, t: 'S' }, { r: 1, c: 3, t: 'A' }],
        bans: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 2], [2, 0], [2, 1], [2, 2]] }
    ],
    counts: [
      { w: 3, h: 3, cols: [1, 0, 1], rows: [1, 0, 1],
        units: [{ r: 0, c: 0, t: 'S' }, { r: 2, c: 2, t: 'C' }] }
    ],
    idle: [
      { w: 4, h: 1, cap: 'it damages', ok: true, castles: [K(0, 0, { p: 1 })],
        units: [{ r: 0, c: 1, t: 'S' }], shots: [{ a: [0, 1], b: [0, 0] }] },
      { w: 4, h: 1, cap: 'reaches nothing', ok: false, castles: [K(0, 0, { p: 1 })],
        units: [{ r: 0, c: 3, t: 'S' }] }
    ],
    exact: [
      { w: 3, h: 3, cap: '3 = 3', ok: true, castles: [K(1, 1, { p: 0, res: 3 })],
        units: [{ r: 1, c: 0, t: 'R' }], shots: [{ a: [1, 0], b: [1, 1] }] },
      { w: 3, h: 3, cap: '3 + 1 = 4', ok: false, castles: [K(1, 1, { p: 0, res: 3 })],
        units: [{ r: 1, c: 0, t: 'R' }, { r: 1, c: 2, t: 'S' }],
        shots: [{ a: [1, 0], b: [1, 1] }, { a: [1, 2], b: [1, 1] }] }
    ],
    archer: [
      { w: 3, h: 1, cap: 'clear line', ok: true, castles: [K(0, 0, { p: 3 })],
        units: [{ r: 0, c: 2, t: 'A' }], shots: [{ a: [0, 2], b: [0, 0], lab: '1' }] },
      { w: 3, h: 1, cap: 'forest in the way', ok: false, castles: [K(0, 0, { p: 3 })],
        forests: [[0, 1]], units: [{ r: 0, c: 2, t: 'A' }],
        shots: [{ a: [0, 2], b: [0, 0], ok: false }], stops: [[0, 1]] }
    ],
    catapult: [
      { w: 4, h: 1, cap: 'flies over the forest', ok: true, castles: [K(0, 0, { p: 4 })],
        forests: [[0, 2]], units: [{ r: 0, c: 3, t: 'C' }],
        shots: [{ a: [0, 3], b: [0, 0], arc: true, lab: '2' }] },
      { w: 4, h: 1, cap: 'not over a castle', ok: false,
        castles: [K(0, 0, { p: 4 }), K(0, 2, { p: 1 })],
        units: [{ r: 0, c: 3, t: 'C' }],
        shots: [{ a: [0, 3], b: [0, 0], arc: true, ok: false }], stops: [[0, 2]] }
    ],
    multi: [
      { w: 5, h: 2, cap: 'measured to the nearest cell', ok: true,
        castles: [K(0, 0, { p: 0, w: 2, h: 2, res: 5 })],
        units: [{ r: 0, c: 4, t: 'A' }], shots: [{ a: [0, 4], b: [0, 1], lab: '1' }] }
    ],
    double: [
      { w: 5, h: 1, cap: 'one unit, two counts',
        castles: [K(0, 0, { p: 0, res: 1 }), K(0, 4, { p: 2, res: 1 })],
        units: [{ r: 0, c: 2, t: 'A' }],
        shots: [{ a: [0, 2], b: [0, 0], lab: '1' }, { a: [0, 2], b: [0, 4], lab: '1' }] }
    ],
    // The deduction the solver leans on hardest, drawn as the pair it is:
    // one placement is ruled out by arithmetic, so the other one is the answer.
    deduce: [
      { w: 3, h: 1, cap: 'a ram would make 3', ok: false,
        castles: [K(0, 0, { p: 1, res: 1 })],
        units: [{ r: 0, c: 1, t: 'R' }], shots: [{ a: [0, 1], b: [0, 0] }] },
      { w: 3, h: 1, cap: 'so it is the soldier', ok: true,
        castles: [K(0, 0, { p: 1, res: 1 })],
        units: [{ r: 0, c: 1, t: 'S' }], shots: [{ a: [0, 1], b: [0, 0] }] }
    ],
    fortress: [
      { w: 7, h: 3, cap: 'the fortress always takes the most',
        castles: [K(0, 0, { p: 0, w: 2, h: 2, res: 7 }),
                  K(1, 3, { p: 1, w: 1, h: 2, res: 3 }),
                  K(0, 5, { p: 2, res: 4 })] }
    ]
  };

  // The text of the rules lives in the HTML; here we only hang its drawing on
  // it. A data-fig with no entry in FIGS leaves the rule as plain text.
  function drawFigures() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-fig]'), function (el) {
      var f = FIGS[el.getAttribute('data-fig')];
      if (!f || el.querySelector('canvas')) return;
      var cv = document.createElement('canvas');
      drawFigure(cv, f, f[0].u || (el.tagName === 'TD' ? 21 : 26));
      el.insertBefore(cv, el.firstChild);
    });
  }


  return { FIGS: FIGS, token: token, figureBox: figureBox,
           figurePaint: figurePaint, drawFigure: drawFigure,
           drawFigures: drawFigures };
})();
