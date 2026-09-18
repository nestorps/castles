// ASSAULT — the instructions as pages of the booklet.
//
// Same paper and same header as the puzzles, so the PNGs alone are enough
// to play. The text is READ FROM THE HTML, never copied here: the rules on
// the page and the rules on the sheet cannot drift apart. Which means this
// file, unlike the engine, needs the DOM.
window.ASSAULT_RULES = (function () {
  'use strict';
  var ART = window.ASSAULT_ART, FIG = window.ASSAULT_FIGURES;
  var INK = ART.INK, MUTED = ART.MUTED, GRID = ART.GRID, FRAME = ART.FRAME;
  var IMG = ART.IMG, roundBox = ART.roundBox;
  var sheetHead = ART.sheetHead, sheetFoot = ART.sheetFoot;
  var wrapText = ART.wrapText;
  var FIGS = FIG.FIGS, token = FIG.token;
  var figureBox = FIG.figureBox, figurePaint = FIG.figurePaint;

  // The same A5 as the puzzles, turned PORTRAIT: the rules are a column of
  // text with a drawing on top of each rule, and on the landscape sheet they
  // ran out of width long before they ran out of page. Change the two numbers
  // and everything below re-flows: nothing here is measured by hand.
  var RULES_PAGE = { w: 148, h: 210 };
  var RULES_PARTS = [
    { num: 'I', cols: 2, table: true, from: 0, to: 6,
      title: 'Rules · Units and Placing',
      sub: 'What each unit takes off, where it may stand and what the numbers count.' },
    { num: 'II', cols: 2, table: false, from: 6, to: 99,
      title: 'Rules · Lines of Fire',
      sub: 'What cuts a shot, and what every puzzle guarantees.' }
  ];

  function rulesContent() {
    var txt = function (el) { return (el.textContent || '').replace(/\s+/g, ' ').trim(); };
    var rows = Array.prototype.slice.call(document.querySelectorAll('.rules table tr'));
    var head = rows.shift();
    return {
      cols: Array.prototype.map.call(head.children, txt),
      units: rows.map(function (tr) {
        var td = tr.children;
        return { t: txt(td[0]), name: txt(td[1]), range: txt(td[2]),
                 fig: td[3].getAttribute('data-fig'), dmg: txt(td[4]), line: txt(td[5]) };
      }),
      items: Array.prototype.map.call(document.querySelectorAll('.rules li'), function (li) {
        return { fig: li.getAttribute('data-fig'), txt: txt(li) };
      })
    };
  }

  // One part of the rules as a complete A5 portrait sheet, same paper and
  // same header as the puzzles.
  //   width  canvas width in logical pixels (the height follows from it)
  //   dpr    physical pixels per logical one
  function drawRules(canvas, part, opts) {
    opts = opts || {};
    var P = RULES_PARTS[part];
    var W = opts.width || 580;
    var mm = function (v) { return v * W / RULES_PAGE.w; };
    var H = RULES_PAGE.h * W / RULES_PAGE.w;
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

    var headEnd = sheetHead(g, mm, face, tracking,
      { badge: P.num, title: P.title, sub: P.sub, pageW: RULES_PAGE.w });
    tracking(0);

    var C = rulesContent();
    var items = C.items.slice(P.from, P.to);
    // The band starts under the header (which grows if the subtitle wraps)
    // and ends above the closing ornament.
    var MAR = 9, GAPC = 6, FOOT = RULES_PAGE.h - 12;
    var top = headEnd + mm(6), bottom = mm(FOOT - 6);
    var usable = mm(RULES_PAGE.w - 2 * MAR), band = bottom - top;

    // ---- the unit table, measured at scale k. Only three columns have a
    // width of their own (the mark, the reach figure and the damage badge);
    // the three text ones share out what is left, so the table always spans
    // the page and the text wraps instead of running off the edge.
    function tableBox(k, figM) {
      var u = mm(4.2 * k), gap = mm(2.6 * k);
      var figs = C.units.map(function (r) { return figureBox(g, FIGS[r.fig] || [], u, figM); });
      var figW = figs.reduce(function (a, f) { return Math.max(a, f.w); }, 0);
      var mark = mm(15 * k), dmg = mm(9 * k);
      var free = usable - mark - dmg - figW - gap * 5;
      var w = [mark, free * .30, free * .40, figW, dmg, free * .30];
      g.font = face(2.45 * k);
      var rows = C.units.map(function (r, i) {
        var range = wrapText(g, r.range, w[2]), line = wrapText(g, r.line, w[5]);
        var lead = mm(2.45 * k * 1.3);
        return { u: r, fb: figs[i], range: range, line: line, lead: lead,
                 h: Math.max(mm(9 * k), figs[i].h,
                             Math.max(range.length, line.length) * lead) + mm(3 * k) };
      });
      var head = mm(6 * k);
      return { u: u, gap: gap, w: w, free: free, rows: rows, head: head,
               h: head + rows.reduce(function (a, r) { return a + r.h; }, 0) };
    }

    // ---- the rules themselves: a grid of cells, figure on top and text
    // underneath. Filled column by column, so the reading order stays the
    // order of the list. Figures sit on a common baseline within their row,
    // or the texts of the row would start at different heights.
    function layout(k) {
      var u = mm(5 * k), fs = 2.7 * k, lead = mm(fs * 1.32);
      var figM = { pad: mm(.7 * k), gap: mm(3.4 * k), cap: mm(3.8 * k), fs: mm(2.3 * k) };
      var colW = (usable - mm(GAPC) * (P.cols - 1)) / P.cols;
      var rows = Math.ceil(items.length / P.cols);
      var cells = items.map(function (it) {
        var fb = figureBox(g, FIGS[it.fig] || [], u, figM);
        g.font = face(fs);
        return { fb: fb, lines: wrapText(g, it.txt, colW) };
      });
      var rowFig = [], rowH = [], total = 0;
      for (var r = 0; r < rows; r++) {
        var fh = 0, tl = 0;
        for (var c = 0; c < P.cols; c++) {
          var cell = cells[c * rows + r];
          if (!cell) continue;
          fh = Math.max(fh, cell.fb.h);
          tl = Math.max(tl, cell.lines.length);
        }
        rowFig.push(fh);
        rowH.push(fh + mm(1.6 * k) + tl * lead);
        total += rowH[r];
      }
      total += mm(5 * k) * (rows - 1);
      var tb = P.table ? tableBox(k, figM) : null;
      return { k: k, u: u, fs: fs, lead: lead, colW: colW, rows: rows, cells: cells,
               rowFig: rowFig, rowH: rowH, table: tb,
               h: total + (tb ? tb.h + mm(7 * k) : 0) };
    }

    // The two parts do not carry the same amount of text: rather than tuning
    // sizes by hand, the sheet is laid out at decreasing scales and the first
    // one that fits the band is the one that gets painted.
    // It has to fit downwards and across: squeezed between the figures and
    // the damage badge, the text columns of the table run out of room long
    // before the page runs out of height.
    var L;
    for (var k = 1.30; ; k -= .02) {
      L = layout(k);
      if ((L.h <= band && (!L.table || L.table.free > mm(26 * k))) || k <= .45) break;
    }

    // Whatever is left over is poured into the gaps between rows instead of
    // being left hanging at the foot: the sheet has to read as a full page,
    // not as a block of rules stuck under the header. Past a point more air
    // stops helping, so what the gaps do not take is centred.
    var slots = L.rows - 1 + (L.table ? 1 : 0);
    var air = Math.min(Math.max(0, band - L.h) / Math.max(1, slots), mm(16));
    var x0 = mm(MAR), y = top + Math.max(0, band - L.h - air * slots) / 2;

    if (L.table) {
      var t = L.table, k1 = L.k, cx = x0, i;
      g.fillStyle = MUTED; g.font = face(2.1 * k1, 700);
      g.textBaseline = 'alphabetic';
      tracking(.3 * k1);
      for (i = 0; i < t.w.length; i++) {
        if (C.cols[i]) {
          g.textAlign = i === 4 ? 'center' : 'left';
          g.fillText(C.cols[i].toUpperCase(), cx + (i === 4 ? t.w[i] / 2 : 0),
                     y + t.head * .72);
        }
        cx += t.w[i] + t.gap;
      }
      tracking(0);
      g.strokeStyle = FRAME; g.lineWidth = mm(.35);
      g.beginPath(); g.moveTo(x0, y + t.head); g.lineTo(x0 + usable, y + t.head); g.stroke();

      var ry = y + t.head;
      t.rows.forEach(function (r) {
        var mid = ry + r.h / 2, x = x0;
        // mark: the letter that is printed on the solution, and the icon that
        // appears in the arsenal panel of every sheet
        token(g, x + mm(3.6 * k1), mid, mm(10 * k1), r.u.t);
        var ix = x + mm(8 * k1), side = mm(8 * k1);
        g.strokeStyle = FRAME; g.lineWidth = mm(.3);
        roundBox(g, ix, mid - side / 2, side, side, mm(1.4 * k1)); g.stroke();
        if (IMG[r.u.t] && IMG[r.u.t].width) {
          g.drawImage(IMG[r.u.t], ix + mm(.8 * k1), mid - side / 2 + mm(.8 * k1),
                      side - mm(1.6 * k1), side - mm(1.6 * k1));
        }
        x += t.w[0] + t.gap;
        g.fillStyle = INK; g.font = face(2.9 * k1, 700);
        g.textAlign = 'left'; g.textBaseline = 'middle';
        g.fillText(r.u.name, x, mid);
        x += t.w[1] + t.gap;
        var block = function (lines, bx) {
          g.font = face(2.45 * k1); g.fillStyle = INK;
          g.textBaseline = 'middle';
          var ty = mid - (lines.length - 1) * r.lead / 2;
          lines.forEach(function (ln) { g.fillText(ln, bx, ty); ty += r.lead; });
        };
        block(r.range, x);
        x += t.w[2] + t.gap;
        figurePaint(g, r.fb, x + (t.w[3] - r.fb.w) / 2, mid - r.fb.h / 2);
        x += t.w[3] + t.gap;
        var bw = mm(9 * k1), bh = mm(7 * k1);
        roundBox(g, x + (t.w[4] - bw) / 2, mid - bh / 2, bw, bh, mm(1 * k1));
        g.fillStyle = '#f3f1ec'; g.fill();
        g.fillStyle = INK; g.font = face(4.2 * k1, 700);
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(r.u.dmg, x + t.w[4] / 2, mid + mm(.2 * k1));
        x += t.w[4] + t.gap;
        g.textAlign = 'left';
        block(r.line, x);
        ry += r.h;
        g.strokeStyle = GRID; g.lineWidth = mm(.25);
        g.beginPath(); g.moveTo(x0, ry); g.lineTo(x0 + usable, ry); g.stroke();
      });
      y += t.h + mm(7 * L.k) + air;
    }

    for (var r2 = 0; r2 < L.rows; r2++) {
      for (var c2 = 0; c2 < P.cols; c2++) {
        var cell = L.cells[c2 * L.rows + r2];
        if (!cell) continue;
        var cxx = x0 + c2 * (L.colW + mm(GAPC));
        figurePaint(g, cell.fb, cxx + (L.colW - cell.fb.w) / 2,
                    y + L.rowFig[r2] - cell.fb.h);
        g.fillStyle = INK; g.font = face(L.fs);
        g.textAlign = 'left'; g.textBaseline = 'alphabetic';
        var ty = y + L.rowFig[r2] + mm(1.6 * L.k) + L.lead * .78;
        cell.lines.forEach(function (ln) { g.fillText(ln, cxx, ty); ty += L.lead; });
      }
      y += L.rowH[r2] + mm(5 * L.k) + air;
    }

    sheetFoot(g, mm, face, tracking, P.num, RULES_PAGE.w);
    return canvas;
  }


  return { RULES_PARTS: RULES_PARTS, drawRules: drawRules };
})();
