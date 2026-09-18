// ASSAULT — the daily challenge.
//
// One puzzle a calendar day, the same one for everybody, played by tapping.
// It is the booklet's engine with the booklet's shaping removed and a date
// put in the place of the seat: the day decides the board and the rung, and
// the date string hashed decides the seed.
//
// Two halves, like js/workshop.js: a pure module first (dates, rotation,
// seed — no DOM, so it can be walked over a year in node) and the page's own
// wiring second, behind a guard. Nothing here draws: the board is
// js/play.js's business and the art is js/art.js's.
//
// THE PUZZLE MUST BE THE SAME ON EVERY DEVICE. That is the whole premise of
// a daily, and it is fragile in one specific way: anything that gives up on
// a clock rather than on a count would hand a fast laptop and a slow phone
// different boards. hunt() is a pure function of the seed and step(ms) only
// slices it, so the slicing is safe; the attempt cap below is a tripwire
// that says so out loud instead of quietly substituting an easier puzzle.
window.ASSAULT_DAILY = (function () {
  'use strict';

  // Bumped when the engine, PICK or BAND change: it goes into the stored
  // record so yesterday's cached board is dropped rather than left to
  // disagree with what a freshly loaded page would generate.
  var RULESET = 1;
  var EPOCH = '2026-01-01';          // the day the counting starts

  // The week, Monday first. Measured before it was written down: every rung
  // here was run over 365 consecutive dates in node — 0 failures, every
  // board inside its band, avg 30 ms, worst 1.5 s and 201 attempts (an 8x8
  // siege day). 'hard' is left out
  // on purpose: its worst case is 8.3 s in node, which on a mid phone is a
  // half-minute of a page that looks hung.
  var ROTATION = [
    [6, 'easy'],      // Mon — a gentle re-entry
    [7, 'sitting'],   // Tue
    [8, 'sitting'],   // Wed — same sitting, bigger board
    [7, 'siege'],     // Thu — it starts to bite
    [8, 'siege'],     // Fri
    [8, 'siege'],     // Sat — the week's peak, with time to sit with it
    [6, 'sitting']    // Sun — a short one
  ];
  var LABEL = { easy: 'a warm-up', sitting: 'one sitting', siege: 'a proper siege' };

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  // The LOCAL date: the day has to turn over at the player's midnight, not
  // at UTC's. Never built by handing a string to new Date() — that parses as
  // UTC in some engines and as local in others, which is a day's difference
  // for anyone west of Greenwich in the evening.
  function ymd(date) {
    return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
  }
  function today() { return ymd(new Date()); }
  function parseYmd(s) {
    var p = String(s).split('-');
    return { y: +p[0], m: +p[1], d: +p[2] };
  }
  function valid(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s))) return false;
    var p = parseYmd(s), t = new Date(Date.UTC(p.y, p.m - 1, p.d));
    return t.getUTCFullYear() === p.y && t.getUTCMonth() === p.m - 1 && t.getUTCDate() === p.d;
  }
  // Whole days since the Unix epoch. Differencing Date.UTC of the three
  // numbers is the only timezone-proof arithmetic available here.
  function dayNo(s) {
    var p = parseYmd(s);
    return Math.floor(Date.UTC(p.y, p.m - 1, p.d) / 86400000);
  }
  function shift(s, n) {
    var t = new Date((dayNo(s) + n) * 86400000);
    return t.getUTCFullYear() + '-' + pad2(t.getUTCMonth() + 1) + '-' + pad2(t.getUTCDate());
  }
  function dayIndex(s) { return dayNo(s) - dayNo(EPOCH); }
  // 1970-01-01 was a Thursday, which is 3 in a week that starts on Monday.
  function weekday(s) { return ((dayNo(s) + 3) % 7 + 7) % 7; }

  // The seed HASHES the date, it does not count it. Handing the day index
  // straight to the engine walks rnd.int(list.length) through the PICK
  // variants in near-lockstep, and a week comes out wearing the same castles.
  function seedOf(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0) || 1;
  }

  function plan(s) {
    var r = ROTATION[weekday(s)];
    return {
      ymd: s, index: dayIndex(s) + 1,
      R: r[0], rung: r[1], label: LABEL[r[1]] || r[1],
      seed: seedOf(s)
    };
  }

  return {
    RULESET: RULESET, EPOCH: EPOCH, ROTATION: ROTATION,
    ymd: ymd, today: today, parseYmd: parseYmd, valid: valid,
    dayNo: dayNo, shift: shift, dayIndex: dayIndex, weekday: weekday,
    seedOf: seedOf, plan: plan
  };
})();

// ---------------------------------------------------------------- the page
(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  if (!document.getElementById('board')) return;     // not the daily page

  var A = window.Assault, ART = window.ASSAULT_ART;
  var W = window.ASSAULT_WORKSHOP, P = window.ASSAULT_PLAY, D = window.ASSAULT_DAILY;
  var F = window.ASSAULT_FIGURES;

  var TYPES = ['S', 'R', 'A', 'C'];
  var NAME = { S: 'Soldier', R: 'Ram', A: 'Archer', C: 'Catapult' };
  var PENCIL = '.';                 // the "known empty" tool
  var CAP = 20000;                  // attempts; ~100x the measured worst
  var PREFIX = 'assault.daily.v1.';
  // The score. A take-back is a unit that leaves the board or changes type,
  // by whatever route — same tool again, a hold, another unit on top, the
  // pencil, Undo, Clear. Placing a unit you have deduced is free; placing
  // one to see what happens is paid for when it comes back off. A check is
  // the same question asked of the page, so it costs too. GRACE forgives a
  // fat finger: taking back the unit just put down, within that time, is a
  // mis-tap, not a trial.
  var GRACE = 3000;                 // ms
  var CHECK_COST = 2;               // take-backs per check

  function $(id) { return document.getElementById(id); }

  // -------------------------------------------------------------- storage
  // localStorage throws outright on a file:// page in some configurations
  // and in a locked-down private window. A throwing setItem must not take
  // the page down, so everything goes through here and falls back to memory
  // — the board simply stops surviving a refresh, which is a small loss
  // next to a blank screen.
  var mem = {};
  var store = {
    get: function (k) {
      try { var v = window.localStorage.getItem(k); return v == null ? mem[k] : v; }
      catch (e) { return mem[k]; }
    },
    set: function (k, v) {
      mem[k] = v;
      try { window.localStorage.setItem(k, v); } catch (e) {}
    },
    remove: function (k) {
      delete mem[k];
      try { window.localStorage.removeItem(k); } catch (e) {}
    }
  };
  function readJSON(k, dflt) {
    var v = store.get(k);
    if (!v) return dflt;
    try { return JSON.parse(v); } catch (e) { return dflt; }
  }
  function writeJSON(k, v) { store.set(k, JSON.stringify(v)); }

  // ----------------------------------------------------------- page state
  var date = null, pl = null, d = null, st = null, board = null, rec = null;
  var tool = 'S', undo = [], checks = 0, lastWrong = null;
  var takebacks = 0, fresh = null;  // fresh: {k, t} of the last unit put down
  var replay = false, finished = false, revealed = false;
  var clock = { ms: 0, since: 0, running: false }, ticker = null, saveTimer = null;

  function say(txt, cls) {
    var el = $('status');
    el.textContent = txt || '';
    el.className = cls || '';
  }

  // ------------------------------------------------------------ the clock
  function mmss(ms) {
    var s = Math.floor(ms / 1000);
    return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
  }
  function elapsed() {
    return clock.ms + (clock.running ? Date.now() - clock.since : 0);
  }
  function clockStart() {
    if (clock.running || finished) return;
    clock.running = true; clock.since = Date.now();
  }
  function clockStop() {
    if (!clock.running) return;
    clock.ms += Date.now() - clock.since;
    clock.running = false;
  }
  function paintClock() { $('clock').textContent = mmss(elapsed()); }

  // ------------------------------------------------------------- the save
  function snapshot() {
    return {
      v: 1, ruleset: D.RULESET, seed: pl.seed, R: pl.R, rung: pl.rung,
      d: d, st: P.encode(st), ms: elapsed(), checks: checks,
      takebacks: takebacks, revealed: revealed, done: finished
    };
  }
  function save() {
    if (!d) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 400);
  }
  function flush() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    if (d) writeJSON(PREFIX + date, snapshot());
  }

  // ------------------------------------------------------------ the streak
  function meta() {
    return readJSON(PREFIX + 'meta', { streak: 0, best: 0, lastSolved: null, solved: {} });
  }
  function recordWin() {
    if (replay) return meta();        // a replay is practice: it never counts
    var m = meta();
    if (m.solved[date]) return m;     // idempotent if the same day solves twice
    m.streak = m.lastSolved === D.shift(date, -1) ? (m.streak || 0) + 1 : 1;
    m.best = Math.max(m.best || 0, m.streak);
    m.lastSolved = date;
    m.solved[date] = 1;
    writeJSON(PREFIX + 'meta', m);
    return m;
  }
  function paintStreak() {
    var m = meta();
    var live = m.lastSolved === date || m.lastSolved === D.shift(date, -1);
    var n = live ? (m.streak || 0) : 0;
    $('streak').textContent = n ? 'Streak ' + n : '';
  }

  // ------------------------------------------------------------- the board
  function refresh(extra) {
    var rd = P.read(d, st);
    board.setView(extra || { flash: null });
    paintPalette(rd);
    var el = $('left');
    el.textContent = rd.placed + ' of ' + rd.total + ' placed';
    if (!finished && P.solved(d, st)) win();
  }

  function push() {
    undo.push(P.encode(st));
    if (undo.length > 200) undo.shift();
    $('undo').disabled = false;
  }

  // Counted as a DIFFERENCE between two boards, not per gesture: there are
  // six ways to take a unit back and a count per gesture would miss the one
  // added next. `before` is the units map as it was; st is the board now.
  function copyUnits() {
    var o = {};
    for (var k in st.units) o[k] = st.units[k];
    return o;
  }
  function tally(before) {
    var now = Date.now(), n = 0, k;
    for (k in before) {
      if (st.units[k] === before[k]) continue;
      if (fresh && fresh.k === k && now - fresh.t < GRACE) continue;
      n++;
    }
    takebacks += n;
    fresh = null;
    for (k in st.units) if (st.units[k] !== before[k]) fresh = { k: k, t: now };
  }
  function score() {
    var n = d.inv.length;
    return Math.round(100 * n / (n + takebacks + CHECK_COST * checks));
  }

  function tap(r, c, held) {
    if (finished) { showWin(); return; }   // the board is done: bring the result back
    var k = P.key(r, c), why = P.legal(d, st, r, c);
    if (why) {
      board.setView({ flash: k });
      setTimeout(function () { board.setView({ flash: null }); }, 220);
      say(why === 'castle' ? 'Units never stand on a castle.'
                           : 'Units never stand in a forest.');
      return;
    }
    // The arsenal is a hard limit, not a mistake to flag: a unit the player
    // does not have cannot be put down. Removing one (same tool again, or a
    // long press) and replacing a unit by another of the same type are
    // always allowed — neither takes anything more out of the arsenal.
    var placing = !held && tool !== PENCIL && st.units[k] !== tool;
    if (placing && P.read(d, st).left[tool] <= 0) {
      board.setView({ flash: k });
      setTimeout(function () { board.setView({ flash: null }); }, 220);
      say('No ' + NAME[tool].toLowerCase() + 's left. Tap one on the board to take it back.');
      return;
    }
    push();
    var before = copyUnits();
    if (held) {
      delete st.units[k]; delete st.empty[k];
    } else if (tool === PENCIL) {
      if (st.empty[k]) delete st.empty[k];
      else { delete st.units[k]; st.empty[k] = 1; }
    } else if (st.units[k] === tool) {
      delete st.units[k];
    } else {
      st.units[k] = tool; delete st.empty[k];
    }
    tally(before);
    lastWrong = null;
    say('');
    clockStart();
    refresh({ wrong: [], flash: null });
    save();
  }

  // Pointer, not click: a click on a phone fires after a 300 ms wait in some
  // browsers and, worse, fires at the end of a scroll. The movement
  // threshold is what keeps a flick down the page from placing a unit.
  function wire() {
    var cv = $('board'), down = null;
    cv.addEventListener('pointerdown', function (ev) {
      down = { x: ev.clientX, y: ev.clientY, t: Date.now(), at: board.hit(ev.clientX, ev.clientY) };
    });
    cv.addEventListener('pointerup', function (ev) {
      if (!down) return;
      var moved = Math.abs(ev.clientX - down.x) > 10 || Math.abs(ev.clientY - down.y) > 10;
      var at = board.hit(ev.clientX, ev.clientY);
      if (!moved && at && down.at && at[0] === down.at[0] && at[1] === down.at[1]) {
        ev.preventDefault();
        tap(at[0], at[1], Date.now() - down.t > 450);
      }
      down = null;
    });
    cv.addEventListener('pointercancel', function () { down = null; });
    cv.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });
  }

  // ----------------------------------------------------------- the palette
  // The chips carry the printed icons, so the unit on the button and the
  // unit in the rules are the same drawing. They are built after ART.ready:
  // the canvas never retries, and a chip drawn early comes out empty.
  function buildPalette() {
    var box = $('palette');
    box.innerHTML = '';
    var have = {};
    d.inv.forEach(function (t) { have[t] = (have[t] || 0) + 1; });
    TYPES.filter(function (t) { return have[t]; }).forEach(function (t) {
      box.appendChild(chip(t, NAME[t]));
    });
    box.appendChild(chip(PENCIL, 'Empty'));
    select(TYPES.filter(function (t) { return have[t]; })[0] || PENCIL);
  }
  function chip(t, label) {
    var b = document.createElement('button');
    b.className = 'chip'; b.dataset.tool = t;
    var cv = document.createElement('canvas');
    cv.width = 56; cv.height = 56; cv.className = 'ico';
    var g = cv.getContext('2d');
    if (t === PENCIL) {
      g.fillStyle = ART.DOT;
      g.beginPath(); g.arc(28, 28, 7, 0, Math.PI * 2); g.fill();
      g.strokeStyle = ART.MUTED; g.lineWidth = 2;
      g.beginPath(); g.arc(28, 28, 18, 0, Math.PI * 2); g.stroke();
    } else if (ART.IMG[t] && ART.IMG[t].width) {
      g.drawImage(ART.IMG[t], 2, 2, 52, 52);
    }
    b.appendChild(cv);
    var n = document.createElement('span');
    n.className = 'nm'; n.textContent = label;
    b.appendChild(n);
    var c = document.createElement('span');
    c.className = 'ct'; c.textContent = '';
    b.appendChild(c);
    b.addEventListener('click', function () { select(t); });
    return b;
  }
  function select(t) {
    tool = t;
    var all = $('palette').querySelectorAll('.chip');
    for (var i = 0; i < all.length; i++) {
      all[i].classList.toggle('on', all[i].dataset.tool === t);
    }
  }
  function paintPalette(rd) {
    var all = $('palette').querySelectorAll('.chip');
    for (var i = 0; i < all.length; i++) {
      var t = all[i].dataset.tool;
      if (t === PENCIL) continue;
      var n = rd.left[t] || 0;
      all[i].querySelector('.ct').textContent = n > 0 ? n : n < 0 ? '+' + (-n) : '✓';
      all[i].classList.toggle('spent', n === 0);
      all[i].classList.toggle('over', n < 0);
    }
  }

  // -------------------------------------------------------------- the end
  function stars(n) {
    var s = '';
    for (var i = 0; i < 5; i++) s += i < n ? '★' : '☆';
    return s;
  }
  function win() {
    finished = true;
    clockStop();
    recordWin();
    paintStreak();
    say(revealed ? 'The answer is on the board.' : 'Castle taken. Tap the board to see your result.');
    showWin();
    flush();
  }
  // The panel opens inside the pointerup of the winning tap, and on a touch
  // screen the click of that same tap comes after it and is aimed at whatever
  // is under the finger by then — the panel. Landing on Close, it shut the
  // panel before it was ever painted and the player saw nothing. So the
  // panel's buttons ignore anything that arrives before GHOST ms have passed.
  var GHOST = 500, shownAt = 0;
  function showWin() {
    var m = meta();
    $('winTitle').textContent = revealed ? 'Revealed' : 'Castle taken';
    $('winBody').textContent = revealed
      ? 'The answer is on the board. Tomorrow is a new siege.'
      : 'Score ' + score() + ' · ' + mmss(elapsed()) + ' · ' + tallyText()
        + (replay || !m.streak ? '' : ' · streak ' + m.streak);
    $('share').style.display = revealed ? 'none' : '';
    $('win').classList.add('show');
    shownAt = Date.now();
  }
  function ghost() { return Date.now() - shownAt < GHOST; }

  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  function tallyText() {
    return (takebacks ? plural(takebacks, 'take-back', 'take-backs') : 'no take-backs') + ' · '
      + (checks ? plural(checks, 'check', 'checks') : 'no checks');
  }

  function shareText() {
    var rank = ART.puzzleRank(d);
    var url = location.origin && location.origin !== 'null'
      ? location.origin + location.pathname + '?d=' + date
      : 'https://nestorps.github.io/castles/?d=' + date;
    return 'ASSAULT · Daily #' + pl.index + ' · ' + date + '\n'
      + pl.R + 'x' + pl.R + ' · ' + pl.label + ' · ' + stars(rank ? rank.n : 0) + '\n'
      + 'Score ' + score() + ' · ' + mmss(elapsed()) + '\n'
      + tallyText() + '\n'
      + url;
  }
  function share() {
    var txt = shareText();
    if (navigator.share) {
      navigator.share({ text: txt })['catch'](function () {});
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(function () { say('Copied.'); },
                                              function () { fallbackCopy(txt); });
      return;
    }
    fallbackCopy(txt);
  }
  // The Clipboard API needs a secure context and file:// is not one, so the
  // old textarea trick stays as the floor.
  function fallbackCopy(txt) {
    var ta = document.createElement('textarea');
    ta.value = txt;
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); say('Copied.'); }
    catch (e) { say('Could not copy.', 'bad'); }
    document.body.removeChild(ta);
  }

  // ------------------------------------------------------------ the tools
  function wireTools() {
    $('undo').addEventListener('click', function () {
      if (!undo.length || finished) return;
      var before = st.units;
      st = P.decode(undo.pop());
      tally(before);
      board.setPuzzle(d, st);
      lastWrong = null;
      $('undo').disabled = !undo.length;
      refresh({ wrong: [], flash: null });
      save();
    });
    $('clear').addEventListener('click', function () {
      if (finished) return;
      push();
      var before = st.units;
      st = P.newState();
      tally(before);
      board.setPuzzle(d, st);
      refresh({ wrong: [], flash: null });
      save();
      say('Board cleared.');
    });
    // Check is deliberately two-stage: the first press says how many units
    // are misplaced, which is a nudge; only a second press on the same board
    // points at them, which is a concession. Both are counted and both go in
    // the share line.
    $('check').addEventListener('click', function () {
      if (finished) return;
      var bad = P.wrong(d, st), sig = bad.slice().sort().join(',');
      checks++;
      if (!bad.length) {
        var rd = P.read(d, st);
        say(rd.placed === rd.total ? 'Everything placed is right.'
            : 'Nothing is wrong so far — ' + (rd.total - rd.placed) + ' still to place.');
      } else if (lastWrong === sig) {
        board.setView({ wrong: bad });
        say(bad.length + (bad.length === 1 ? ' unit is' : ' units are') + ' marked.');
      } else {
        board.setView({ wrong: [] });
        say(bad.length + (bad.length === 1 ? ' unit is' : ' units are')
            + ' in the wrong place. Check again to mark them.');
      }
      lastWrong = sig;
      save();
    });
    $('reveal').addEventListener('click', function () {
      if (finished) return;
      if (!window.confirm('Show the answer? Today will not count towards the streak.')) return;
      push();
      revealed = true;
      P.fill(d, st);
      board.setPuzzle(d, st);
      refresh({ wrong: [], flash: null });
      win();
    });
    $('damage').addEventListener('change', function () {
      board.setView({ damage: $('damage').checked });
      store.set(PREFIX + 'damage', $('damage').checked ? '1' : '0');
    });
    $('share').addEventListener('click', function () { if (!ghost()) share(); });
    $('close').addEventListener('click', function () {
      if (!ghost()) $('win').classList.remove('show');
    });
  }

  // -------------------------------------------------------- generation
  function start(puzzle) {
    d = puzzle;
    st = rec && rec.st ? P.decode(rec.st) : P.newState();
    checks = rec ? (rec.checks || 0) : 0;
    takebacks = rec ? (rec.takebacks || 0) : 0;
    fresh = null;
    revealed = rec ? !!rec.revealed : false;
    clock.ms = rec ? (rec.ms || 0) : 0;
    finished = false;

    var rank = ART.puzzleRank(d);
    $('chipBoard').textContent = pl.R + 'x' + pl.R;
    $('chipRung').textContent = pl.label;
    $('chipStars').textContent = stars(rank ? rank.n : 0);

    board = P.create($('board'), { max: 560 });
    board.setPuzzle(d, st);
    board.setView({ damage: $('damage').checked, wrong: [], flash: null });
    buildPalette();
    wire();
    refresh({ flash: null });
    paintClock();
    ticker = setInterval(function () { if (clock.running) paintClock(); }, 1000);
    if (P.solved(d, st)) win();
    else {
      say(revealed ? 'The answer is on the board.' : 'Tap a cell to place the selected unit.');
      if (clock.ms) clockStart();      // a board resumed mid-siege keeps its time
    }
    flush();
  }

  function build() {
    var o = W.order(pl.R, pl.rung, pl.seed);
    if (!o) { say('No board for ' + pl.R + 'x' + pl.R + ' ' + pl.rung + '.', 'bad'); return; }
    var h = W.hunt(o.spec, pl.seed, true, o.band);
    say('Building today’s siege…');
    (function tick() {
      var got;
      try { got = h.step(70); }
      catch (e) { say('The board would not come out: ' + e.message, 'bad'); return; }
      if (got) {
        A.verify(got);
        got.diff = A.difficulty(got);
        start(got);
        return;
      }
      // Counted in attempts, never in wall-clock: a deadline would hand a
      // fast laptop and a slow phone two different puzzles on the same day.
      if (h.tries() > CAP) {
        say('Today’s board did not come out in ' + CAP + ' attempts. '
            + 'Please report this — it should not happen.', 'bad');
        return;
      }
      say('Building today’s siege… ' + h.tries() + ' attempts');
      setTimeout(tick, 0);
    })();
  }

  // The How to play's unit cards wear the same silhouettes as the palette
  // and the printed sheet, and the booklet's own figure drawing for the
  // placements. Painted here, after ART.ready, for the same reason the chips
  // are. One canvas per scene, not one per figure: side by side, three
  // scenes are wider than a phone, and separate canvases wrap.
  function paintHow() {
    var all = document.querySelectorAll('#how canvas[data-unit]'), i;
    for (i = 0; i < all.length; i++) {
      var t = all[i].dataset.unit, img = ART.IMG[t];
      if (img && img.width) all[i].getContext('2d').drawImage(img, 4, 4, 80, 80);
    }
    var boxes = document.querySelectorAll('#how [data-figs]');
    for (i = 0; i < boxes.length; i++) {
      var scenes = F.FIGS[boxes[i].dataset.figs] || [];
      boxes[i].innerHTML = '';
      scenes.forEach(function (s) {
        boxes[i].appendChild(F.drawFigure(document.createElement('canvas'), [s], 30));
      });
    }
  }

  // ---------------------------------------------------------------- boot
  function boot() {
    paintHow();
    var q = /[?&]d=([0-9]{4}-[0-9]{2}-[0-9]{2})/.exec(location.search);
    var now = D.today();
    date = q && D.valid(q[1]) ? q[1] : now;
    replay = date !== now;
    pl = D.plan(date);

    // ?reset drops the day's record — board, time, checks, take-backs,
    // revealed — so the date plays from scratch. It has to happen here, at
    // boot: deleting the key from DevTools does not stick, because the page
    // writes its copy back on pagehide. The streak is left alone. The flag
    // is taken off the URL at once, so a reload does not reset again.
    if (/[?&]reset(?:[=&]|$)/.test(location.search)) {
      store.remove(PREFIX + date);
      try {
        var rest = location.search.replace(/[?&]reset(?:=[^&]*)?/, '').replace(/^&/, '?');
        history.replaceState(null, '', location.pathname + rest + location.hash);
      } catch (e) {}
    }

    $('num').textContent = 'Daily #' + pl.index;
    $('day').textContent = date + (replay ? ' · replay' : '');
    $('damage').checked = store.get(PREFIX + 'damage') !== '0';
    document.body.classList.toggle('replay', replay);
    paintStreak();
    wireTools();

    // A board already generated for this date is reused verbatim rather than
    // hunted again: it is faster, and it is one less way for two loads of
    // the same day to disagree.
    var saved = readJSON(PREFIX + date, null);
    if (saved && saved.ruleset === D.RULESET && saved.seed === pl.seed && saved.d) {
      rec = saved;
      start(saved.d);
      return;
    }
    rec = null;
    build();
  }

  ['visibilitychange', 'pagehide'].forEach(function (ev) {
    window.addEventListener(ev, function () {
      if (document.visibilityState === 'hidden' || ev === 'pagehide') clockStop();
      else clockStart();
      paintClock();
      flush();
    });
  });

  // Nothing is drawn before the font and the icons are in: the canvas does
  // not retry, and a board painted early comes out in the fallback font with
  // the icon chips empty, silently.
  ART.ready.then(boot);
})();
