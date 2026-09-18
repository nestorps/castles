// ASSAULT — the page itself: controls, preview and the PNG exports.
//
// The booklet is built one seat at a time with the thread handed back in
// between, so a hundred puzzles do not freeze the page. Nothing is drawn
// before the font and the icons are in: the canvas never retries.
(function () {
  'use strict';
  var A = window.Assault;
  var ART = window.ASSAULT_ART;
  var PAL = ART.PAL, ready = ART.ready;
  var puzzleTitle = ART.puzzleTitle, puzzleNumber = ART.puzzleNumber;
  var draw = window.ASSAULT_SHEET.draw;
  var drawFigures = window.ASSAULT_FIGURES.drawFigures;
  var drawRules = window.ASSAULT_RULES.drawRules;
  var drawCampaign = window.ASSAULT_CAMPAIGN.drawCampaign;

  var puzzles = [];

  // The campaign sheet goes at the head of the booklet, and it is a sheet
  // like any other: what is on the page is exactly what comes out of the
  // printer, with the boxes blank to be crossed off by hand.
  function renderCampaign() {
    var cont = document.getElementById('campaign');
    cont.innerHTML = '';
    if (!puzzles.length) return;
    var card = document.createElement('section');
    card.className = 'card camp';
    var h = document.createElement('h2');
    h.textContent = 'Campaign';
    var sub = document.createElement('p');
    sub.className = 'sub';
    sub.textContent = 'The road through the booklet · A5 portrait sheet · '
      + 'prints as the first page';
    var cv = document.createElement('canvas');
    drawCampaign(cv, puzzles, { width: +document.getElementById('size').value });
    var btn = document.createElement('button');
    btn.className = 'ghost';
    btn.textContent = 'Download PNG';
    btn.onclick = function () {
      var tmp = document.createElement('canvas');
      // The same 874 x dpr 2 as the puzzle sheets: A5 portrait at 300 dpi.
      drawCampaign(tmp, puzzles, { width: 874, dpr: 2 });
      var a = document.createElement('a');
      a.download = 'assault_campaign.png';
      a.href = tmp.toDataURL('image/png');
      a.click();
    };
    card.appendChild(h); card.appendChild(sub); card.appendChild(cv); card.appendChild(btn);
    cont.appendChild(card);
  }

  function render() {
    var cont = document.getElementById('puzzles');
    var showSol = document.getElementById('sol').checked;
    var width = +document.getElementById('size').value;
    cont.innerHTML = '';
    puzzles.forEach(function (d, i) {
      var card = document.createElement('section');
      card.className = 'card';
      var h = document.createElement('h2');
      h.textContent = puzzleNumber(i) + ' · ' + puzzleTitle(i, d);
      var sub = document.createElement('p');
      sub.className = 'sub';
      // The meter on screen only: it is what the seat was asked for and what
      // the board came out at, and it is how the shape of a booklet is read
      // without running the engine by hand. It is not on the printed sheet.
      sub.textContent = 'Board ' + d.R + 'x' + d.R + ' · A5 portrait sheet'
        + (d.diff != null ? ' · difficulty ' + d.diff
            + (d.want ? ' (asked ' + d.want[0]
                + (d.want[1] > 900 ? '+' : '-' + d.want[1]) + ')' : '') : '');
      var cv = document.createElement('canvas');
      draw(cv, d, { width: width, index: i, solution: showSol });
      var legend = document.createElement('ul');
      legend.className = 'legend';
      d.castles.forEach(function (cells, k) {
        var li = document.createElement('li');
        li.style.color = PAL[k % PAL.length];
        li.textContent = 'Castle ' + (k + 1) + ' · ' + cells.length
          + (cells.length === 1 ? ' cell' : ' cells') + '  ·  exact resistance ' + d.res[k];
        legend.appendChild(li);
      });
      var btn = document.createElement('button');
      btn.className = 'ghost';
      btn.textContent = 'Download PNG';
      btn.onclick = function () {
        var tmp = document.createElement('canvas');
        // 874 x dpr 2 = 1748x1240 px: half an A5 at exactly 300 dpi, which is
        // what a puzzle sheet is — two of them fill one page.
        // Fixed, not the screen's: otherwise the same booklet would come out at
        // a different resolution on every monitor.
        draw(tmp, d, { width: 874, dpr: 2, index: i, solution: showSol });
        var a = document.createElement('a');
        a.download = 'assault_' + puzzleNumber(i) + (showSol ? '_solution' : '') + '.png';
        a.href = tmp.toDataURL('image/png');
        a.click();
      };
      card.appendChild(h); card.appendChild(sub); card.appendChild(cv);
      card.appendChild(legend); card.appendChild(btn);
      cont.appendChild(card);
    });
    renderCampaign();
    foliate();
  }

  // The page number, and it only exists on paper: on screen the cards scroll
  // as one page and a folio would be noise, and in the exported PNG the sheet
  // has to stand alone — a number from a booklet it was not printed with would
  // be a lie. So it is DOM text (crisper than anything drawn into the canvas)
  // hidden everywhere but @media print.
  //
  // It counts the SHEETS, in printing order: the campaign sheet is 1 and the
  // puzzles follow. That is only honest because the rules section is printed
  // last — see the print block in css/page.css — and a single sheet gets no
  // folio at all, because «1 / 1» tells nobody anything.
  function foliate() {
    var cards = document.querySelectorAll('#campaign .card, #puzzles .card');
    Array.prototype.forEach.call(cards, function (card, i) {
      var f = card.querySelector('.folio') || document.createElement('span');
      f.className = 'folio';
      f.textContent = cards.length > 1 ? (i + 1) + ' / ' + cards.length : '';
      if (!f.parentNode) card.appendChild(f);
    });
  }

  // A hundred puzzles are about 25 s of searching, so the booklet is built one
  // seat at a time with the thread handed back in between: the status line
  // advances and the page stays alive. A single synchronous call would freeze
  // it from the click to the last puzzle.
  var busy = false;
  function run() {
    if (busy) return;
    var n = Math.max(1, Math.min(100, +document.getElementById('n').value || 10));
    var seed = +document.getElementById('seed').value || 1;
    var human = document.getElementById('human').checked;
    var status = document.getElementById('status');
    var it = A.generator(n, seed, { human: human });
    var out = [], t0 = performance.now();
    busy = true;
    status.textContent = 'Generating 1 of ' + n + '...';
    (function step() {
      try {
        var t = performance.now();
        // Several puzzles per slice while they are quick, so a short booklet
        // does not pay a frame of latency for each of them.
        do { out.push(it.next()); } while (!it.done() && performance.now() - t < 60);
      } catch (e) {
        busy = false;
        status.textContent = 'Error: ' + e.message;
        return;
      }
      if (!it.done()) {
        status.textContent = 'Generating ' + (out.length + 1) + ' of ' + n + '...';
        setTimeout(step, 0);
        return;
      }
      busy = false;
      puzzles = out;
      status.textContent = n + ' puzzles verified, unique solution in all of them'
        + (human ? ' and all of them deducible without guessing' : '') + ' ('
        + Math.round(performance.now() - t0) + ' ms)';
      render();
    })();
  }

  document.getElementById('gen').onclick = run;
  document.getElementById('human').onchange = run;
  document.getElementById('sol').onchange = render;
  document.getElementById('size').onchange = render;
  document.getElementById('random').onclick = function () {
    document.getElementById('seed').value = Math.floor(Math.random() * 99999) + 1;
    run();
  };
  document.getElementById('print').onclick = function () { window.print(); };

  // 874 x dpr 2 = 1748x2480 px: the same paper and the same 300 dpi as every
  // other sheet.
  [0, 1].forEach(function (part) {
    document.getElementById('rulesPng' + (part + 1)).onclick = function () {
      var tmp = document.createElement('canvas');
      drawRules(tmp, part, { width: 874, dpr: 2 });
      var a = document.createElement('a');
      a.download = 'assault_rules_' + (part + 1) + '.png';
      a.href = tmp.toDataURL('image/png');
      a.click();
    };
  });

  // The whole booklet as one .zip: the campaign, every puzzle and its
  // solution, and the two rules sheets, at the same 300 dpi as the single
  // buttons. One file rather than thirty downloads, which the browser would
  // stop to ask about. The zip is written by hand — STORED, no compression,
  // which costs nothing on PNGs and keeps the project free of dependencies.
  var CRC = (function () {
    var t = [];
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function zip(files) {                       // [{name, data: Uint8Array}] -> Blob
    var parts = [], central = [], offset = 0;
    files.forEach(function (f) {
      var name = new TextEncoder().encode(f.name), crc = crc32(f.data), size = f.data.length;
      var lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true);
      lh.setUint16(12, 33, true);               // 1980-01-01: the date is not the point
      lh.setUint32(14, crc, true); lh.setUint32(18, size, true); lh.setUint32(22, size, true);
      lh.setUint16(26, name.length, true);
      var ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
      ch.setUint16(14, 33, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, size, true); ch.setUint32(24, size, true);
      ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
      parts.push(lh, name, f.data);
      central.push(ch, name);
      offset += 30 + name.length + size;
    });
    var cdSize = central.reduce(function (s, p) { return s + p.byteLength; }, 0);
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [end]), { type: 'application/zip' });
  }
  function pngBytes(canvas) {
    return new Promise(function (resolve) {
      canvas.toBlob(function (b) { b.arrayBuffer().then(function (buf) { resolve(new Uint8Array(buf)); }); }, 'image/png');
    });
  }

  document.getElementById('zip').onclick = function () {
    if (busy || !puzzles.length) return;
    var status = document.getElementById('status'), btn = this, seed = document.getElementById('seed').value;
    var jobs = [function (cv) { drawCampaign(cv, puzzles, { width: 874, dpr: 2 }); return '00_campaign.png'; }];
    [0, 1].forEach(function (part) {
      jobs.push(function (cv) { drawRules(cv, part, { width: 874, dpr: 2 }); return 'rules_' + (part + 1) + '.png'; });
    });
    [false, true].forEach(function (sol) {
      puzzles.forEach(function (d, i) {
        jobs.push(function (cv) {
          draw(cv, d, { width: 874, dpr: 2, index: i, solution: sol });
          return (sol ? 'solutions/' : 'puzzles/') + 'assault_' + puzzleNumber(i) + (sol ? '_solution' : '') + '.png';
        });
      });
    });
    var files = [];
    busy = true; btn.disabled = true;
    (function step() {
      if (files.length === jobs.length) {
        var a = document.createElement('a');
        a.download = 'assault_seed' + seed + '.zip';
        a.href = URL.createObjectURL(zip(files));
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 10000);
        busy = false; btn.disabled = false;
        status.textContent = files.length + ' sheets packed into ' + a.download;
        return;
      }
      status.textContent = 'Packing sheet ' + (files.length + 1) + ' of ' + jobs.length + '...';
      var cv = document.createElement('canvas'), name = jobs[files.length](cv);
      pngBytes(cv).then(function (data) { files.push({ name: name, data: data }); setTimeout(step, 0); });
    })();
  };

  // Nothing gets drawn before the font and icons are in: the canvas never retries.
  ready.then(function () { drawFigures(); run(); });
})();
