// ASSAULT — the drawing kit: palette, titles, the embedded assets once
// loaded, and the pieces every sheet is built out of (castle, forest,
// number box, banner header, closing ornament).
//
// These helpers take measurements ALREADY IN PIXELS: the caller does the
// mm() conversion, so nothing here knows the page scale and the same
// drawing serves the on-screen preview and the 300 dpi PNG.
//
// Loaded after engine.js and assets.js. Everything else in js/ reads what
// it needs from window.ASSAULT_ART.
window.ASSAULT_ART = (function () {
  'use strict';
  var AS = window.ASSAULT_ASSETS;

  var PAGE = { w: 148, h: 210 };   // A5 portrait, in mm
  var MARGIN = 9;                  // the content margin every sheet shares

  // The booklet is BLACK AND WHITE: it is photocopied and printed on a mono
  // press, and a colour that only exists on screen is a colour that lies. So
  // the palette is a ramp of greys, and the arrays are kept as arrays (one
  // entry per castle) so that `PAL[k % PAL.length]` still works everywhere —
  // telling two castles apart is the resistance badge's job, not the hue's.
  var INK = '#141414', MUTED = '#5b5b5b';
  var PAL  = ['#141414', '#141414', '#141414', '#141414', '#141414'];
  var TINT = ['#f2f1ef', '#f2f1ef', '#f2f1ef', '#f2f1ef', '#f2f1ef'];
  var GRID = '#cfcfcb', DOT = '#b4b4ae', BORDER = '#141414';
  var FRAME = '#141414';
  var BAND = '#eceae5';            // the grey of the instruction band
  var HAIR = '#e3e2de';            // the ruling of the notes grid
  var FOREST_BG = '#f6f6f3', FOREST = '#141414', TRUNK = '#3a3a36';

  // The number box carries the number; the title, the name of the puzzle.
  //
  // Only three seats have a board known in advance, so only those three can
  // wear a name that describes one: seat 1-4 are the fixed tutorial boards
  // ('The Twin Tower' is where the two-cell tower debuts, 'The Three Lords'
  // the three-castle board) and the last seat is always the 8x8 ending. The
  // rest draw their board from a pool, so their names have to name the SIEGE
  // and not the board.
  var FIXED = ['The Ford', 'Two Campfires', 'The Twin Tower', 'The Three Lords'];
  var CLOSER = 'Final Assault';
  // Handed out by seat, one each, in this order.
  var CURATED = ['Siege at Dawn', 'Mist in the Woods', 'The Stronghold',
    'The Cloven Valley', 'War of Sieges', 'The Broad Walls', 'Adelmar’s Knot',
    'The Iron Gate', 'Ash and Timber', 'The Long Winter', 'Nightfall Sortie',
    'The Salt Road', 'Ravens over the Keep', 'Hollow Hill',
    'The Broken Standard', 'Embers at the Wall', 'The Cold March',
    'Thorn and Thistle', 'The Silent Bell', 'Wolves at the Gate',
    'The Red Harvest', 'Stone and Smoke', 'The Distant Horn',
    'The Sunken Causeway', 'Banners in the Rain'];
  // A booklet of a hundred needs a hundred titles, and writing them by hand
  // only moves the wall further along. Past the curated ones the names are
  // combined from two lists, which is 225 more of them. The walk is a Latin
  // square (a runs with the seat, b with the seat plus the lap) so that no two
  // consecutive titles share a word and no pair ever comes up twice.
  var T_ADJ = ['Iron', 'Broken', 'Silent', 'Cold', 'Red', 'Hollow', 'Long',
    'Distant', 'Sunken', 'Bitter', 'Grey', 'Last', 'Black', 'Thorn', 'Salt'];
  var T_NOUN = ['Gate', 'Standard', 'Bell', 'March', 'Harvest', 'Hill',
    'Winter', 'Horn', 'Causeway', 'Bastion', 'Vigil', 'Reach', 'Watch',
    'Crown', 'Wall'];
  // Built once, on demand, and only as long as the booklet needs: seat k of
  // the generic run gets TITLES[k], with the curated names first and the
  // combinations after, skipping anything already spoken for.
  var TITLES = null;
  function titleList(need) {
    if (TITLES && TITLES.length >= need) return TITLES;
    var seen = {}, out = [];
    FIXED.concat([CLOSER]).forEach(function (t) { seen[t] = 1; });
    CURATED.forEach(function (t) { if (!seen[t]) { seen[t] = 1; out.push(t); } });
    var m = T_ADJ.length;
    for (var k = 0; out.length < need && k < m * T_NOUN.length; k++) {
      var t = 'The ' + T_ADJ[k % m] + ' ' + T_NOUN[(Math.floor(k / m) + k) % m];
      if (!seen[t]) { seen[t] = 1; out.push(t); }
    }
    TITLES = out;
    return out;
  }
  var ONE = { S: 'Soldier', R: 'Ram', A: 'Archer', C: 'Catapult' };
  var MANY = { S: 'Soldiers', R: 'Rams', A: 'Archers', C: 'Catapults' };
  var ORDER = ['S', 'R', 'A', 'C'];   // the same order as the rules table
  // The tier the engine gave the puzzle is what decides which of the three
  // kinds of name it gets; the seat is what keeps them from repeating.
  // 'Castle Assault' is only what is left if the lists ever run dry.
  function puzzleTitle(i, d) {
    if (d && d.tier === 'climax') return CLOSER;
    if (d && d.tier === 'tutorial' && i < FIXED.length) return FIXED[i];
    if (!d && i < FIXED.length) return FIXED[i];
    var k = Math.max(0, i - FIXED.length);
    return titleList(k + 1)[k] || 'Castle Assault';
  }
  function puzzleNumber(i) { return (i < 9 ? '0' : '') + (i + 1); }

  // --------------------------------------------------------------- assets
  // The font and the icons have to be loaded BEFORE drawing: the canvas does
  // not wait, and drawing too early gives a sheet in the fallback font with
  // empty icon boxes.
  //
  // The four icons are OPAQUE RGB drawings on a light ground (colour type 2,
  // no alpha channel), and the booklet is black and white. So each one is
  // turned into a SILHOUETTE as it lands: its luminance becomes the alpha —
  // light goes transparent, dark goes solid — and the whole thing is then
  // painted in INK. What the sheets draw is the silhouette, never the file:
  // IMG[t] IS the converted canvas.
  //
  // The ramp is steep on purpose. A plain 1 - luminance leaves every mid
  // tone of the original as a grey ghost, which is exactly what a mono press
  // turns into mud; anything under CUT comes out solid and only the narrow
  // band above it keeps the drawing's antialiasing.
  function blacken(img) {
    var CUT = .58, SOFT = .26;      // solid below CUT, gone above CUT + SOFT
    var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    var cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    var q = cv.getContext('2d');
    q.drawImage(img, 0, 0);
    var px = q.getImageData(0, 0, w, h), b = px.data;
    for (var i = 0; i < b.length; i += 4) {
      var lum = (b[i] * .299 + b[i + 1] * .587 + b[i + 2] * .114) / 255;
      var a = (CUT + SOFT - lum) / SOFT;
      b[i + 3] = Math.round(255 * Math.max(0, Math.min(1, a)));
      b[i] = 0x14; b[i + 1] = 0x14; b[i + 2] = 0x14;
    }
    q.putImageData(px, 0, 0);
    return cv;
  }

  var IMG = {};
  var ready = (function () {
    var f = new FontFace('Roboto Slab', 'url(' + AS.font + ')',
                         { weight: '100 900' });
    document.fonts.add(f);
    var all = [f.load()];
    ORDER.forEach(function (t) {
      var img = new Image();
      IMG[t] = img;               // replaced by its silhouette once it loads
      all.push(new Promise(function (ok) {
        img.onload = function () { IMG[t] = blacken(img); ok(); };
        img.onerror = ok;
        img.src = AS.icons[t];
      }));
    });
    return Promise.all(all);
  })();

  function arsenal(d) {
    var cnt = {};
    d.inv.forEach(function (t) { cnt[t] = (cnt[t] || 0) + 1; });
    return ORDER.filter(function (t) { return cnt[t]; }).map(function (t) {
      return { t: t, txt: (cnt[t] > 1 ? MANY[t] : ONE[t]).toUpperCase(), n: cnt[t] };
    });
  }

  // ---------------------------------------------------------- drawing parts
  // They all take measurements already in pixels: the caller does the mm()
  // conversion. That way these functions know nothing about the page scale.

  function diamond(g, x, y, r) {
    g.beginPath();
    g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y);
    g.closePath(); g.fill();
  }

  // Ornamental rule: thin line with a diamond at the ends or at the centre.
  function rule(g, x1, x2, y, gr, where) {
    g.strokeStyle = FRAME; g.lineWidth = gr;
    g.beginPath(); g.moveTo(x1, y); g.lineTo(x2, y); g.stroke();
    g.fillStyle = FRAME;
    if (where === 'center') diamond(g, (x1 + x2) / 2, y, gr * 2.4);
    else { diamond(g, x1, y, gr * 2.2); diamond(g, x2, y, gr * 2.2); }
  }

  function roundBox(g, x, y, w, h, r) {
    g.beginPath();
    if (g.roundRect) g.roundRect(x, y, w, h, r);
    else g.rect(x, y, w, h);
  }

  // Panel frame with chamfered corners, like the one in the reference.
  function cutFrame(g, x, y, w, h, c) {
    g.beginPath();
    g.moveTo(x + c, y);         g.lineTo(x + w - c, y);
    g.lineTo(x + w, y + c);     g.lineTo(x + w, y + h - c);
    g.lineTo(x + w - c, y + h); g.lineTo(x + c, y + h);
    g.lineTo(x, y + h - c);     g.lineTo(x, y + c);
    g.closePath();
  }

  // Fir tree centred in the cell, of side s.
  function tree(g, x, y, s) {
    var cx = x + s / 2, base = y + s * .82, h = s * .68, w = s * .54;
    g.fillStyle = TRUNK;
    g.fillRect(cx - w * .07, base - h * .20, w * .14, h * .20);
    g.fillStyle = FOREST;
    [[1.00, .16, .30], [.80, .36, .29], [.60, .55, .28]].forEach(function (f) {
      g.beginPath();
      g.moveTo(cx, base - h * (f[1] + f[2]));
      g.lineTo(cx - w * f[0] / 2, base - h * f[1]);
      g.lineTo(cx + w * f[0] / 2, base - h * f[1]);
      g.closePath(); g.fill();
    });
  }

  // Keep with battlements, side turrets and gate, scaled to the space the
  // castle takes up (always rectangular: see SHAPES). No pennants: the
  // resistance badge sits on that corner, and the reference art has none.
  //
  // cell is the side of ONE square of the board, and it is what the air
  // around the keep is measured in. Callers that draw on a grid pass it;
  // without it the short side of the box stands in, which is right for every
  // footprint but the fortress.
  function castleArt(g, x, y, w, h, color, cell) {
    // The castle FILLS its footprint, whatever shape that is: the two-cell
    // tower grows tall, the two-cell wall grows wide, the fortress fills its
    // four squares. Body, turrets and battlements add up to 1.30 times the
    // body height, so that is what the room left over is divided by.
    //
    // The AIR above and below is a fraction of the cell, never of the box.
    // Tie it to the box and a two-cell castle floats twice as high off the
    // bottom of its footprint as the watchtower beside it — the same drawing
    // at the same scale, sitting on a different line.
    //
    // What does NOT stretch with the box is the gate: it is cut against the
    // short side, so a tall tower and a plain watchtower wear the same door.
    var air = (cell || Math.min(w, h)) * .10;
    var base = y + h - air;
    var bw = w * .80, bh = (h - air * 2) / 1.30;
    var bx = x + (w - bw) / 2, by = base - bh;
    // One merlon per body-width, not five always: five on a wide wall come out
    // as teeth the size of the gate, and five on a narrow tower do not fit.
    var n = Math.max(3, Math.round(5 * (bw / bh) / 1.43));
    var m = bh * .30, step = bw / (2 * n - 1);
    g.fillStyle = color;
    g.fillRect(bx, by, bw, bh);
    for (var i = 0; i < n; i++) g.fillRect(bx + i * 2 * step, by - m, step, m);

    var tw = Math.min(bw, bh) * .19, th = bh * 1.12;
    var tm = tw * .55;
    [bx - tw * .55, bx + bw - tw * .45].forEach(function (tx) {
      g.fillRect(tx, base - th, tw, th);
      for (var j = 0; j < 2; j++) g.fillRect(tx + j * tw * .6, base - th - tm, tw * .4, tm);
    });

    var pw = Math.min(bw * .26, bh * .40), ph = Math.min(pw * 1.55, bh * .62);
    g.fillStyle = '#fff';
    g.beginPath();
    g.moveTo(bx + (bw - pw) / 2, base);
    g.lineTo(bx + (bw - pw) / 2, base - ph + pw / 2);
    g.arc(bx + bw / 2, base - ph + pw / 2, pw / 2, Math.PI, 0);
    g.lineTo(bx + (bw + pw) / 2, base);
    g.closePath(); g.fill();
  }


  // Five-pointed star, filled or hollow: the rank meter in the banner.
  function star(g, cx, cy, r, filled) {
    g.beginPath();
    for (var i = 0; i < 10; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * .45 : r;
      g[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    g.closePath();
    if (filled) { g.fillStyle = INK; g.fill(); }
    else { g.strokeStyle = MUTED; g.lineWidth = r * .18; g.stroke(); }
  }

  // What the difficulty meter reads as on the cover of a sheet. The meter is
  // a count of undecided cells (see engine's difficulty()); these five cuts
  // are the booklet's own bands rounded to something a player can read.
  function puzzleRank(d) {
    var v = d && d.diff;
    if (v == null) return null;
    if (v <= 5)  return { txt: 'GENTLE', n: 1 };
    if (v <= 12) return { txt: 'EASY',   n: 2 };
    if (v <= 19) return { txt: 'MEDIUM', n: 3 };
    if (v <= 26) return { txt: 'HARD',   n: 4 };
    return { txt: 'BRUTAL', n: 5 };
  }

  // Head of a sheet, editorial style: a black number box, the title in a
  // ruled box beside it, an optional rank box at the right, and the
  // instruction band underneath. Shared by the puzzles, the rules pages and
  // the campaign, so the whole booklet comes out of the printer as one thing.
  // The caller passes its own mm()/face()/tracking(): this function knows no
  // page scale.
  //
  //   o.badge  what goes in the black box
  //   o.title  the name, set in caps and shrunk until it fits its box
  //   o.sub    the instruction line, wrapped and centred in the grey band
  //   o.rank   {txt, n} for the rank box, or nothing for no box at all
  //   o.pageW  page width in mm (defaults to A5 portrait)
  //   o.bandH  fixed height for the grey band. The puzzle sheet pins it so
  //            that its board lands on the same millimetre on every page
  //
  // Returns where the head ends, in page pixels.
  function sheetHead(g, mm, face, tracking, o) {
    var pageW = o.pageW || PAGE.w;
    var x0 = mm(MARGIN), x1 = mm(pageW - MARGIN), w = x1 - x0;
    var top = mm(o.top || 11), h = mm(o.plaqueH || 17), r = mm(2.6);

    // The plaque is ONE box, not three: a rounded bar with the black number
    // block set into its left end and the rank chip inset at the right. The
    // shadow is a second rounded rect a fraction of a millimetre down and to
    // the right — enough to lift the plaque off the page, light enough that a
    // photocopier still prints it as a grey and not as a smear.
    roundBox(g, x0 + mm(.6), top + mm(.6), w, h, r);
    g.fillStyle = HAIR; g.fill();
    roundBox(g, x0, top, w, h, r);
    g.fillStyle = '#fff'; g.fill();
    g.strokeStyle = INK; g.lineWidth = mm(.45); g.stroke();

    // The number block is CLIPPED to the plaque, so it takes the bar's own
    // rounding on the left and cuts square on the right without a second
    // path having to match it by hand.
    var numW = h * 1.02;
    g.save();
    roundBox(g, x0, top, w, h, r); g.clip();
    g.fillStyle = INK;
    g.fillRect(x0 - mm(1), top - mm(1), numW + mm(1), h + mm(2));
    g.restore();
    g.fillStyle = '#fff';
    var nsize = h / mm(1) * .52;
    tracking(.2);
    do { g.font = face(nsize, 700); nsize -= .2; }
    while (g.measureText(o.badge).width > numW * .72 && nsize > 2);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(o.badge, x0 + numW / 2, top + h * .54);
    tracking(0);

    // ---- the rank chip: what the difficulty meter reads as, in a word and
    // in five stars. It is a chip inside the plaque, not a box beside it.
    var chipW = o.rank ? mm(23) : 0, chipH = h - Math.min(mm(4.8), h * .28);
    if (o.rank) {
      var cx = x1 - mm(2.4) - chipW, cy = top + (h - chipH) / 2;
      roundBox(g, cx, cy, chipW, chipH, mm(1.4));
      g.fillStyle = '#f0efec'; g.fill();
      g.strokeStyle = MUTED; g.lineWidth = mm(.3); g.stroke();
      g.fillStyle = INK; g.font = face(2.3, 700);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      tracking(.45);
      g.fillText(o.rank.txt, cx + chipW / 2, cy + chipH * .30);
      tracking(0);
      var sr = mm(1.45), sgap = mm(3.5), sy = cy + chipH * .70;
      for (var s = 0; s < 5; s++) {
        star(g, cx + chipW / 2 + (s - 2) * sgap, sy, sr, s < o.rank.n);
      }
    }

    // The title is set flush against the number block and shrinks until it
    // clears the chip: on this plaque it is the block and the chip that are
    // fixed, and the name that gives way.
    var tx = x0 + numW + mm(5);
    var tw = (o.rank ? x1 - mm(2.4) - chipW - mm(4) : x1 - mm(5)) - tx;
    var title = o.title.toUpperCase(), size = Math.min(9, h / mm(1) * .52);
    tracking(.3);
    do { g.font = face(size, 700); size -= .2; }
    while (g.measureText(title).width > tw && size > 3);
    g.fillStyle = INK; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText(title, tx, top + h * .55);
    tracking(0);

    // ---- the grey band with the instruction. Its height can be pinned by
    // the caller: on the puzzle sheet the board underneath has to start at
    // the same millimetre whatever the text does, or the solution sheet
    // would no longer overlay the puzzle cell for cell.
    var by = top + h + mm(3.5);
    g.font = face(3.4);
    var lines = o.sub ? wrapText(g, o.sub, x1 - x0 - mm(12)) : [];
    var bh = o.bandH ? mm(o.bandH) : Math.max(mm(12), lines.length * mm(4.8) + mm(7));
    // No line, no band: the solution sheet keeps the height (its board has to
    // land on the same millimetre as the puzzle's) and loses the grey.
    if (lines.length) {
      roundBox(g, x0, by, x1 - x0, bh, r);
      g.fillStyle = BAND; g.fill();
      g.fillStyle = INK; g.textAlign = 'center'; g.textBaseline = 'middle';
      var ly = by + bh / 2 - (lines.length - 1) * mm(2.4);
      lines.forEach(function (ln) { g.fillText(ln, (x0 + x1) / 2, ly); ly += mm(4.8); });
    }
    return by + bh;
  }

  // The closing ornament: a hairline across the page with two little firs and
  // the sheet's number sitting under it. It is what makes the page read as a
  // page of a book rather than a printout.
  function sheetFoot(g, mm, face, tracking, badge, pageW) {
    pageW = pageW || PAGE.w;
    var cx = mm(pageW / 2), y = mm(PAGE.h - 12);
    g.strokeStyle = HAIR; g.lineWidth = mm(.3);
    g.beginPath(); g.moveTo(mm(MARGIN), y); g.lineTo(mm(pageW - MARGIN), y); g.stroke();
    if (!badge) return;
    var s = mm(4.4), fy = y + mm(2.2);
    g.fillStyle = MUTED; g.font = face(3.1, 700);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    tracking(.3);
    var half = g.measureText(badge).width / 2;
    g.fillText(badge, cx, fy + s * .52);
    tracking(0);
    tree(g, cx - half - mm(2.4) - s, fy, s);
    tree(g, cx + half + mm(2.4), fy, s);
  }

  // The text helper lives here, with the kit: sheetHead() wraps its
  // subtitle with it, and so do the rules and campaign sheets.
  function wrapText(g, txt, maxW) {          // the font is the caller's
    var lines = [], cur = '';
    txt.split(' ').forEach(function (w) {
      var t = cur ? cur + ' ' + w : w;
      if (cur && g.measureText(t).width > maxW) { lines.push(cur); cur = w; }
      else cur = t;
    });
    if (cur) lines.push(cur);
    return lines;
  }

  return {
    PAGE: PAGE, MARGIN: MARGIN,
    INK: INK, MUTED: MUTED, PAL: PAL, TINT: TINT, GRID: GRID, DOT: DOT,
    BORDER: BORDER, FRAME: FRAME, BAND: BAND, HAIR: HAIR,
    FOREST_BG: FOREST_BG, FOREST: FOREST, TRUNK: TRUNK,
    puzzleTitle: puzzleTitle, puzzleNumber: puzzleNumber,
    puzzleRank: puzzleRank,
    IMG: IMG, ready: ready, arsenal: arsenal,
    diamond: diamond, rule: rule, roundBox: roundBox, cutFrame: cutFrame,
    tree: tree, castleArt: castleArt, star: star,
    sheetHead: sheetHead, sheetFoot: sheetFoot, wrapText: wrapText
  };
})();
