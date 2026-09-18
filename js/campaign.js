// ASSAULT — the campaign sheet: the booklet as a road.
window.ASSAULT_CAMPAIGN = (function () {
  'use strict';
  var ART = window.ASSAULT_ART;
  var PAGE = ART.PAGE;
  var INK = ART.INK, MUTED = ART.MUTED, PAL = ART.PAL, FRAME = ART.FRAME;
  var puzzleTitle = ART.puzzleTitle, puzzleNumber = ART.puzzleNumber;
  var roundBox = ART.roundBox;
  var tree = ART.tree, castleArt = ART.castleArt;
  var sheetHead = ART.sheetHead, sheetFoot = ART.sheetFoot;
  var wrapText = ART.wrapText;

  // A booklet is a road, not a stack of loose puzzles. The campaign sheet
  // draws the whole route — one castle per puzzle, in playing order — with
  // its name and a box to cross off as each one falls, plus a strip at the
  // foot to shade in: the point of the sheet is that the booklet should LOOK
  // like it is advancing, and it does that on paper, with a pencil. Nothing
  // here is filled in by the page; it prints blank on purpose.
  //
  // Same paper and same banner as everything else: A5 portrait, like every
  // page of the booklet since the sheets went editorial.
  //
  // Nothing is measured by hand and there is no table of cases for the number
  // of stops: every shape from 1 to 7 columns is laid out at decreasing
  // scales and the one that still fits the band with the biggest keeps is the
  // one that gets painted. Five stops come out as a wide road with big
  // castles, thirty as a tight one.
  var CAMP_PAGE = { w: PAGE.w, h: PAGE.h };
  var ROAD = '#cfc7b4';

  // Draws the campaign as a complete A5 landscape sheet.
  //   width  canvas width in logical pixels (the height follows from it)
  //   dpr    physical pixels per logical one
  function drawCampaign(canvas, list, opts) {
    opts = opts || {};
    var W = opts.width || 640;
    var mm = function (v) { return v * W / CAMP_PAGE.w; };
    var H = CAMP_PAGE.h * W / CAMP_PAGE.w;
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
    var tracking = function (v) {
      try { g.letterSpacing = mm(v) + 'px'; } catch (e) {}
    };

    var n = list.length;
    var titles = list.map(function (d, i) { return puzzleTitle(i, d); });

    // The number box carries the length of the road, not a puzzle number.
    var headEnd = sheetHead(g, mm, face, tracking, {
      badge: String(n), title: 'The Campaign', pageW: CAMP_PAGE.w,
      sub: 'One road, ' + n + (n === 1 ? ' siege' : ' sieges')
        + '. Cross off each castle as it falls.'
    });
    tracking(0);

    var MAR = 9, FOOT = CAMP_PAGE.h - 12;
    var top = headEnd + mm(6);
    var bottom = mm(FOOT - 20);          // the tally goes between band and ornament
    var usable = mm(CAMP_PAGE.w - 2 * MAR), band = bottom - top, x0 = mm(MAR);

    // ---- one shape of the road, measured at scale k. The cell is the castle,
    // its title underneath and the box to cross off; gapR is the stretch of
    // road that joins one row of the serpentine to the next.
    function layout(cols, k) {
      var rows = Math.ceil(n / cols);
      var colW = usable / cols, keep = mm(15 * k);
      // The castle is what gives way when the road gets long: the name and the
      // box have a floor, or a booklet of thirty came out with titles nobody
      // can read. Past that floor it is the keep that shrinks, not the text.
      var fs = Math.max(2.05, 2.6 * k), lead = mm(fs * 1.24);
      g.font = face(fs, 700);
      var lines = titles.map(function (t) { return wrapText(g, t, colW - mm(3 * k)); });
      var maxL = lines.reduce(function (a, l) { return Math.max(a, l.length); }, 1);
      var box = Math.max(mm(3), mm(4 * k));
      var cellH = keep + mm(1.2 * k) + maxL * lead + mm(1.4 * k) + box;
      var gapR = Math.max(mm(3.2), mm(7 * k));
      return { cols: cols, k: k, rows: rows, colW: colW, keep: keep, fs: fs, lead: lead,
               lines: lines, maxL: maxL, box: box, cellH: cellH, gapR: gapR,
               h: rows * cellH + (rows - 1) * gapR };
    }

    // The shape is chosen, not decided in advance: for every number of columns
    // the largest scale that fits the band is found, and the one that leaves
    // the biggest castles wins. A castle wider than its own column is out.
    var L = null;
    [1, 2, 3, 4, 5, 6, 7].forEach(function (cols) {
      if (cols > n) return;
      for (var k = 1.5; k >= .30; k -= .03) {
        var c = layout(cols, k);
        if (c.h <= band && c.colW > c.keep * 1.12) {
          if (!L || c.keep > L.keep) L = c;
          return;
        }
      }
    });
    if (!L) L = layout(Math.min(n, 6), .30);

    var cols = L.cols, y0 = top + Math.max(0, band - L.h) / 2;
    // Serpentine: the road runs right along one row and left along the next,
    // so two consecutive rows are joined by a straight drop on the same column.
    var at = function (i) {
      var r = Math.floor(i / cols), j = i % cols;
      var c = r % 2 ? cols - 1 - j : j;
      return { x: x0 + c * L.colW + (L.colW - L.keep) / 2, y: y0 + r * (L.cellH + L.gapR) };
    };
    var anchor = function (p) { return { x: p.x + L.keep / 2, y: p.y + L.keep * .60 }; };

    // ---- the road, painted first so the castles stand on it.
    g.lineCap = 'round';
    g.strokeStyle = ROAD; g.lineWidth = mm(.9);
    g.setLineDash([mm(1.5), mm(1.5)]);
    for (var i = 0; i < n - 1; i++) {
      var a = anchor(at(i)), b = anchor(at(i + 1));
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    }
    g.setLineDash([]); g.lineCap = 'butt';

    // The seats the road does not reach (the last row is rarely full) are not
    // left blank: they are woodland, the same fir tree the boards carry.
    for (var s = n; s < L.rows * cols; s++) {
      var pt = at(s);
      tree(g, pt.x + L.keep * .18, pt.y + L.keep * .16, L.keep * .64);
    }

    for (var j = 0; j < n; j++) {
      var p = at(j), col = PAL[j % PAL.length], cx = p.x + L.keep / 2;
      castleArt(g, p.x, p.y, L.keep, L.keep, col);

      // Number badge on the keep's body, the same badge the sheets put in the
      // castle's corner. It has to sit on the body: above it there is only air
      // and the battlements, and the number floated.
      var side = L.keep * .26, ex = p.x + L.keep * .13, ey = p.y + L.keep * .44;
      roundBox(g, ex, ey, side, side, side * .26);
      g.fillStyle = '#fff'; g.fill();
      g.strokeStyle = col; g.lineWidth = mm(.35); g.stroke();
      var num = puzzleNumber(j), fs2 = side * .60 / mm(1);
      do { g.font = face(fs2, 700); fs2 -= .15; }
      while (g.measureText(num).width > side * .74 && fs2 > .5);
      g.fillStyle = col;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(num, ex + side / 2, ey + side / 2 + mm(.1));

      var ty = p.y + L.keep + mm(1.2 * L.k) + L.lead * .78;
      g.fillStyle = INK; g.font = face(L.fs, 700);
      g.textAlign = 'center'; g.textBaseline = 'alphabetic';
      L.lines[j].forEach(function (ln) { g.fillText(ln, cx, ty); ty += L.lead; });

      // The box to cross the castle off, always empty: this sheet is filled
      // in with a pencil, not by the page.
      var bY = p.y + L.keep + mm(1.2 * L.k) + L.maxL * L.lead + mm(1.4 * L.k);
      roundBox(g, cx - L.box / 2, bY, L.box, L.box, L.box * .22);
      g.fillStyle = '#fff'; g.fill();
      g.strokeStyle = MUTED; g.lineWidth = mm(.35); g.stroke();
    }

    // ---- the tally strip: one cell per siege, to shade in as they fall. The
    // boxes above say WHICH castle; this says how far the campaign has got,
    // and it is what makes the sheet read as a march rather than a list.
    var barW = Math.min(usable, mm(110)), barX = (W - barW) / 2;
    var barY = mm(FOOT - 10.5), barH = mm(4.2);
    g.font = face(3, 700);
    tracking(.45);
    g.fillStyle = MUTED; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.fillText(n === 1 ? 'CASTLE TAKEN' : 'CASTLES TAKEN', W / 2, barY - mm(1.9));
    tracking(0);
    roundBox(g, barX, barY, barW, barH, barH / 2);
    g.fillStyle = '#fff'; g.fill();
    g.strokeStyle = FRAME; g.lineWidth = mm(.3); g.stroke();
    g.strokeStyle = FRAME; g.lineWidth = mm(.22);
    g.beginPath();
    for (var t = 1; t < n; t++) {
      var sx = barX + barW * t / n;
      g.moveTo(sx, barY + mm(.6)); g.lineTo(sx, barY + barH - mm(.6));
    }
    g.stroke();

    // No number in the foot: the campaign sheet is page one of the booklet
    // and the folio in the DOM is what says so on paper.
    sheetFoot(g, mm, face, tracking, '', CAMP_PAGE.w);
    return canvas;
  }


  return { drawCampaign: drawCampaign };
})();
