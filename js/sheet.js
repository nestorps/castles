// ASSAULT — the puzzle sheet.
//
// Every puzzle is drawn as a COMPLETE A5 PORTRAIT PAGE (148x210 mm), not as
// a bare board: banner with the number, the title and the rank; the grey
// instruction band; the board with its counts; the arsenal panel; a ruled
// space to work in; and the closing ornament. That way every puzzle comes
// out the same size even though the board runs from 6x6 to 8x8, and the
// printed booklet stays uniform.
//
// It is drawn in BLACK AND WHITE, palette included: see js/art.js.
//
// ALL measurements are in page millimetres and go through mm(). Do not put
// in fixed pixels: the same code draws the on-screen preview (width ~580
// px) and the 1748x2480 PNG (A5 portrait at 300 dpi), and any absolute
// measurement throws one of the two out.
window.ASSAULT_SHEET = (function () {
  'use strict';
  var ART = window.ASSAULT_ART;
  // The puzzle sheet is HALF an A5: the width of the shared page, half its
  // height. The rules and the campaign keep the whole A5 (ART.PAGE).
  var PAGE = { w: ART.PAGE.w, h: ART.PAGE.h / 2 }, MAR = ART.MARGIN;
  var INK = ART.INK, PAL = ART.PAL, TINT = ART.TINT;
  var GRID = ART.GRID, DOT = ART.DOT, BORDER = ART.BORDER;
  var FOREST_BG = ART.FOREST_BG;
  var puzzleTitle = ART.puzzleTitle;
  var puzzleNumber = ART.puzzleNumber, puzzleRank = ART.puzzleRank;
  var IMG = ART.IMG, arsenal = ART.arsenal;
  var roundBox = ART.roundBox, tree = ART.tree, castleArt = ART.castleArt;
  var sheetHead = ART.sheetHead;

  // The vertical plan of the page, in millimetres, and it is FIXED: the band
  // the board lives in does not move with the size of the board or with the
  // length of the title. That is what makes the booklet read as a booklet
  // (the grid lands on the same millimetre on every page) and it is also what
  // keeps the solution sheet overlaying its puzzle cell for cell.
  var HEAD_TOP = 5, PLAQUE_H = 11;  // the banner: shorter than the rules pages'
  var BOARD_TOP = 22, BOARD_BOT = 101;
  var PANEL_GAP = 4;                // between the board and the arsenal panel

  // ---------------------------------------------------------------- the page
  // Draws one puzzle as a complete A5 portrait sheet.
  //   width    canvas width in logical pixels (the height follows from it)
  //   dpr      physical pixels per logical one
  //   index    position of the puzzle in the booklet: gives number and title
  //   solution if true, marks the units on the board and drops everything
  //            that is there to be written on (the panel's boxes) and the
  //            banner, all but a small number. Nobody plays on the answer
  //   title    overrides the name the seat would get. The workshop needs it:
  //   badge    its puzzles have no seat in a booklet, so there is no list to
  //            take a name from and no position to number them by
  function draw(canvas, d, opts) {
    opts = opts || {};
    var W = opts.width || 580;
    var mm = function (v) { return v * W / PAGE.w; };   // 1 mm of page
    var H = PAGE.h * W / PAGE.w;
    var i = opts.index || 0;
    // A workshop puzzle has no seat, so it carries its own name and number.
    var badge = opts.badge || puzzleNumber(i);
    var title = opts.title || puzzleTitle(i, d);
    var R = d.R;
    var g = canvas.getContext('2d');
    var dpr = opts.dpr || window.devicePixelRatio || 1;

    g.setTransform(1, 0, 0, 1, 0, 0);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
    g.imageSmoothingQuality = 'high';

    var face = function (size, peso) {
      return (peso || 400) + ' ' + mm(size) + 'px "Roboto Slab", Georgia, serif';
    };
    var tracking = function (v) {           // not in every browser
      try { g.letterSpacing = mm(v) + 'px'; } catch (e) {}
    };

    // ---- banner: number, title and rank, and nothing else. There is no
    // instruction band: the same sentence on every sheet is a rule, and the
    // rules have their own pages. The millimetres it took go to the board.
    // The solution sheet has no banner: see the number tab under the board.
    if (!opts.solution) {
      sheetHead(g, mm, face, tracking, {
        badge: badge, title: title, rank: puzzleRank(d),
        top: HEAD_TOP, plaqueH: PLAQUE_H
      });
    }

    // ---- arsenal panel (on the right, width driven by its contents).
    // Note the panel is MEASURED even on the solution sheet, where it is not
    // drawn: the board keeps the width it would have had, so the answer
    // overlays the puzzle cell for cell.
    var rows = arsenal(d);
    var pPad = 3, pIcon = 8.6, pTxt = 2.2, pRow = 14, pHead = 9.5, pPitch = 5.6;
    g.font = face(2.9, 700);
    tracking(.25);         // the same as when drawing it, or the measure falls short
    var pLabel = 0, pMax = 0;
    rows.forEach(function (e) {
      pLabel = Math.max(pLabel, g.measureText(e.txt).width / mm(1));
      pMax = Math.max(pMax, e.n);
    });
    tracking(0);
    // The name and the boxes under it share a left edge, so the column they
    // make is as wide as the wider of the two, and the panel is that plus the
    // icon. It is measured rather than fixed because every millimetre the
    // panel does not take is a millimetre of board, and on this page it is
    // always the WIDTH that decides the cell, never the height: an arsenal of
    // three of a kind must not pay for the one that carries five.
    var pCol = Math.max(pLabel, pMax * pPitch - (pPitch - 4.4));
    var pW = Math.min(44, Math.max(31, pPad * 2 + pIcon + pTxt + pCol));
    var pH = pHead + 2.5 + rows.length * pRow + 1.5;

    // ---- the board takes the width the panel leaves and the height of the
    // band, and is centred in what is left. The 0.62 addend is the room
    // reserved for the counts along the right edge and the bottom, measured
    // in cells. The grid carries no coordinates (no column letters, no row
    // numbers): nothing on the sheet ever names a cell, so they only took
    // room off the board.
    var areaW = PAGE.w - 2 * MAR - pW - PANEL_GAP;
    var bandH = BOARD_BOT - BOARD_TOP;
    var c = Math.min(mm(areaW) / (R + .62), mm(bandH) / (R + .62));
    var blockW = c * (R + .62), blockH = c * (R + .62);
    // The grid is FLUSH LEFT, on the margin: its left edge and the left edge
    // of the banner plaque are the same line, and the eye reads down it. What
    // the board does not use is left between it and the arsenal panel.
    var x0 = mm(MAR);
    var y0 = mm(BOARD_TOP) + (mm(bandH) - blockH) / 2;
    // The panel is centred against the GRID, not against the board block: the
    // block includes the row of counts, and aligning with that leaves the
    // panel visibly too high.
    var pX = mm(PAGE.w - MAR - pW);
    var pY = Math.max(mm(BOARD_TOP), y0 + R * c / 2 - mm(pH) / 2);

    // The solution sheet wears only the number, small, in a black tab sitting
    // right on top of the grid's left corner: it is how the answer is matched
    // to its puzzle, and the title and rank are already on the puzzle. The
    // board itself does not move, so the answer still overlays the puzzle.
    if (opts.solution) {
      var tabW = 10, tabH = 6.5, tabY = y0 - mm(tabH + 1.2);
      roundBox(g, x0, tabY, mm(tabW), mm(tabH), mm(1.6));
      g.fillStyle = INK; g.fill();
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      tracking(.15);
      var nsize = 3.6;
      do { g.font = face(nsize, 700); nsize -= .2; }
      while (g.measureText(badge).width > mm(tabW * .78) && nsize > 1.5);
      g.fillText(badge, x0 + mm(tabW / 2), tabY + mm(tabH * .54));
      tracking(0);
    }

    if (!opts.solution) drawPanel(g, mm, face, tracking, rows, pX, pY, pW, pH,
                                  { pad: pPad, icon: pIcon, txt: pTxt,
                                    row: pRow, head: pHead, pitch: pPitch });

    // ---- board
    var X = function (q) { return x0 + q * c; };
    var Y = function (q) { return y0 + q * c; };

    d.castles.forEach(function (cells, k) {
      g.fillStyle = TINT[k % TINT.length];
      cells.forEach(function (p) { g.fillRect(X(p[1]), Y(p[0]), c, c); });
    });
    d.forests.forEach(function (p) {
      g.fillStyle = FOREST_BG;
      g.fillRect(X(p[1]), Y(p[0]), c, c);
    });

    g.strokeStyle = GRID; g.lineWidth = mm(.22);
    g.beginPath();
    for (var q1 = 0; q1 <= R; q1++) {
      g.moveTo(X(0), Y(q1)); g.lineTo(X(R), Y(q1));
      g.moveTo(X(q1), Y(0)); g.lineTo(X(q1), Y(R));
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

    // The trees go over the grid, not under it: in black and white a hairline
    // across a black fir is all the eye sees of the cell.
    d.forests.forEach(function (p) { tree(g, X(p[1]), Y(p[0]), c); });

    // The castles in SHAPES are always rectangular, so the bounding box is
    // the castle.
    d.castles.forEach(function (cells, k) {
      var col = PAL[k % PAL.length];
      var rs = cells.map(function (p) { return p[0]; });
      var cs = cells.map(function (p) { return p[1]; });
      var r0 = Math.min.apply(null, rs), r9 = Math.max.apply(null, rs);
      var c0 = Math.min.apply(null, cs), c9 = Math.max.apply(null, cs);

      // The outline of the footprint, before the art. It is what says WHICH
      // cells the castle occupies, and on the two-cell towers and the
      // fortress the silhouette alone does not say it: the keep is drawn to
      // the bounding box and a player cannot tell a tall tower from a big
      // castle on one cell without the box drawn around it.
      var ins0 = mm(.5);
      g.strokeStyle = col; g.lineWidth = mm(.45);
      roundBox(g, X(c0) + ins0, Y(r0) + ins0,
               (c9 - c0 + 1) * c - ins0 * 2, (r9 - r0 + 1) * c - ins0 * 2, mm(1.2));
      g.stroke();
      castleArt(g, X(c0), Y(r0), (c9 - c0 + 1) * c, (r9 - r0 + 1) * c, col, c);

      // Resistance badge in the castle's top-left corner, fully inside the
      // castle and painted last, over the art. That corner is the only spot
      // that reads the same on every shape, from watchtower to fortress.
      var side = Math.min(c * .38, mm(4.6)), ins = mm(.45);
      var ex = X(c0) + ins, ey = Y(r0) + ins;
      roundBox(g, ex, ey, side, side, side * .26);
      g.fillStyle = '#fff'; g.fill();
      g.strokeStyle = col; g.lineWidth = mm(.4); g.stroke();
      // The size is tied to the badge, which shrinks with the cell: with a
      // fixed measure the number ran out of its box on the bigger boards.
      var res = String(d.res[k]), fs = side * .70 / mm(1);
      do { g.font = face(fs, 700); fs -= .15; }
      while (g.measureText(res).width > side * .70 && fs > .5);
      g.fillStyle = col;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(res, ex + side / 2, ey + side / 2 + mm(.1));
    });

    // ---- the counts of the rows and the columns, which are the clue itself:
    // they stay on the sheet whatever the layout does.
    g.fillStyle = INK;
    g.font = face(Math.min(4.4, c / mm(1) * .48), 700);
    g.textAlign = 'center'; g.textBaseline = 'top';
    for (var c3 = 0; c3 < R; c3++) g.fillText(String(d.colc[c3]), X(c3) + c / 2, Y(R) + c * .20);
    g.textAlign = 'left'; g.textBaseline = 'middle';
    for (var r3 = 0; r3 < R; r3++) g.fillText(String(d.rowc[r3]), X(R) + c * .22, Y(r3) + c / 2);

    if (opts.solution) {
      d.sol.forEach(function (s) {
        var cx = X(s.cell[1]) + c / 2, cy = Y(s.cell[0]) + c / 2;
        g.beginPath(); g.arc(cx, cy, c * .32, 0, Math.PI * 2);
        g.fillStyle = '#fff'; g.fill();
        g.strokeStyle = INK; g.lineWidth = mm(.35); g.stroke();
        g.fillStyle = INK; g.font = face(Math.min(4.4, c / mm(1) * .44), 700);
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(s.type, cx, cy + mm(.2));
      });
    }

    return canvas;
  }

  // ------------------------------------------------------------ the arsenal
  // One row per type: the icon, the name beside it, and the boxes to cross
  // off UNDER the name and flush with it — name and boxes are one column,
  // and the eye reads down the left edge of it. The boxes are what the panel
  // is for: the arsenal is drawn inside the canvas on purpose, so the PNG
  // alone is enough to play without the page.
  //
  // The pitch is measured, not typed. The panel is sized for the boxes it
  // has (see pCol above), but it is also capped, so an arsenal that carries
  // five of one type tightens its own row instead of widening the panel and
  // eating the board.
  function drawPanel(g, mm, face, tracking, rows, x, y, w, h, m) {
    roundBox(g, x, y, mm(w), mm(h), mm(2.4));
    g.fillStyle = '#fff'; g.fill();
    g.strokeStyle = INK; g.lineWidth = mm(.5); g.stroke();

    // The header is a black bar with the panel's own rounded top corners, so
    // it is clipped to the panel instead of being drawn as a box of its own.
    g.save();
    roundBox(g, x, y, mm(w), mm(h), mm(2.4)); g.clip();
    g.fillStyle = INK; g.fillRect(x, y, mm(w), mm(m.head));
    g.restore();
    g.fillStyle = '#fff'; g.font = face(4, 700);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    tracking(.8);
    g.fillText('ARSENAL', x + mm(w) / 2, y + mm(m.head * .54));
    tracking(0);

    var colX = m.pad + m.icon + m.txt;
    var avail = w - m.pad - colX;
    rows.forEach(function (e, k) {
      var ry = y + mm(m.head + 2.5 + k * m.row);
      var ix = x + mm(m.pad);
      if (IMG[e.t] && IMG[e.t].width) {
        g.drawImage(IMG[e.t], ix, ry, mm(m.icon), mm(m.icon));
      }
      g.fillStyle = INK; g.font = face(2.9, 700);
      g.textAlign = 'left'; g.textBaseline = 'middle';
      tracking(.25);
      g.fillText(e.txt, x + mm(colX), ry + mm(m.icon * .28));
      tracking(0);

      var pitch = Math.min(m.pitch, avail / e.n), side = Math.min(4.4, pitch - 1.2);
      for (var q = 0; q < e.n; q++) {
        roundBox(g, x + mm(colX + q * pitch), ry + mm(m.icon * .56),
                 mm(side), mm(side), mm(.8));
        g.fillStyle = '#fff'; g.fill();
        g.strokeStyle = INK; g.lineWidth = mm(.35); g.stroke();
      }
    });
  }

  // ------------------------------------------------------- the working space
  return { draw: draw };
})();
