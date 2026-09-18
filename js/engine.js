// ASSAULT — puzzle engine. No dependencies; runs in the browser and in node.
(function (root) {
  'use strict';

  // blk: null       melee, nothing blocks it
  //      'all'      flat shot: forests, units and castles cut the line
  //      'castles'  arcing shot: flies over forests and units, but not over
  //                 another castle
  //
  // The keys are the letters printed on the solution, one per unit: Soldier,
  // Ram, Archer, Catapult. Nothing outside this object depends on the order
  // they are written in: build() only ever reads `inv` as a multiset, and the
  // arsenal of a puzzle is drawn (see drawArsenal) rather than spelled out.
  var TYPES = {
    S: { name: 'Soldier',  lo: 1, hi: 1, dmg: 1, blk: null },
    R: { name: 'Ram',      lo: 1, hi: 1, dmg: 3, blk: null },
    A: { name: 'Archer',   lo: 2, hi: 3, dmg: 1, blk: 'all' },
    C: { name: 'Catapult', lo: 3, hi: 5, dmg: 2, blk: 'castles' }
  };

  var SHAPES = {
    watchtower: [[0, 0]],
    tower_v:    [[0, 0], [1, 0]],
    tower_h:    [[0, 0], [0, 1]],
    fortress:   [[0, 0], [0, 1], [1, 0], [1, 1]]
  };

  // Reproducible generator (mulberry32): same seed, same booklet.
  function rng(seed) {
    var s = seed >>> 0;
    function next() {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    next.int = function (n) { return Math.floor(next() * n); };
    next.shuffle = function (a) {
      for (var i = a.length - 1; i > 0; i--) {
        var j = next.int(i + 1), t = a[i]; a[i] = a[j]; a[j] = t;
      }
      return a;
    };
    next.sample = function (a, k) { return next.shuffle(a.slice()).slice(0, k); };
    return next;
  }

  // The arsenal of a puzzle: n units drawn, not spelled out. POOL says HOW
  // MANY units a board carries, because that is what drives the difficulty;
  // WHICH ones is drawn here, so two puzzles of the same spec do not come out
  // with the same arsenal. Before this, the body of a booklet ran on two
  // compositions: of twenty puzzles, eleven were SSSRRAACC or SSSRRAAACC.
  //
  // One of each type first — an arsenal of two types is finished by the row
  // and column counts alone (measured: 95% of boards for 'SSAA') — and the
  // rest drawn, capped at floor(n/3) + 1 so no type is ever a majority. The
  // cap is not tidiness: one type in force is a different game, not a variant
  // of the same puzzle, and a lopsided arsenal is also far slower to place
  // (in the workshop, allowing a majority multiplied the worst hunt by 8).
  function drawArsenal(n, rnd) {
    var types = Object.keys(TYPES), out = [];
    if (n < types.length) {                 // too few to hold one of each
      for (var i = 0; i < n; i++) out.push(types[i % types.length]);
      return out;
    }
    var count = {}, cap = Math.max(2, Math.floor(n / 3) + 1);
    types.forEach(function (t) { count[t] = 1; });
    for (var left = n - types.length; left > 0; ) {
      var t = types[rnd.int(types.length)];
      if (count[t] < cap) { count[t]++; left--; }
    }
    types.forEach(function (t) {
      for (var k = 0; k < count[t]; k++) out.push(t);
    });
    return out;
  }

  var key = function (r, c) { return r * 100 + c; };
  function adjacent(a, b) {
    return Math.abs(a[0] - b[0]) <= 1 && Math.abs(a[1] - b[1]) <= 1;
  }

  // Damage dealt to a castle by unit `t` placed on `cell`.
  // Range is measured to the castle's nearest cell, in a straight line.
  // `blocks` = { all: Set, castles: Set }; each unit looks at its own.
  function damageTo(cell, t, ccells, blocks) {
    var u = TYPES[t], r = cell[0], c = cell[1];
    var blocked = u.blk ? blocks[u.blk] : null;
    for (var i = 0; i < ccells.length; i++) {
      var kr = ccells[i][0], kc = ccells[i][1];
      if (r !== kr && c !== kc) continue;
      var d = Math.abs(r - kr) + Math.abs(c - kc);
      if (d < u.lo || d > u.hi) continue;
      if (blocked) {
        var sr = kr !== r ? (kr - r) / d : 0, sc = kc !== c ? (kc - c) / d : 0, cut = false;
        for (var k = 1; k < d; k++) {
          if (blocked.has(key(r + sr * k, c + sc * k))) { cut = true; break; }
        }
        if (cut) continue;
      }
      return u.dmg;
    }
    return 0;
  }

  function combinations(arr, k) {
    var out = [];
    (function rec(start, acc) {
      if (acc.length === k) { out.push(acc.slice()); return; }
      for (var i = start; i <= arr.length - (k - acc.length); i++) {
        acc.push(arr[i]); rec(i + 1, acc); acc.pop();
      }
    })(0, []);
    return out;
  }

  // Every placement that satisfies the row/column counts and non-adjacency.
  function enumPositions(R, freeSet, rowc, colc, n) {
    var out = [], suffix = new Array(R + 1).fill(0);
    for (var r = R - 1; r >= 0; r--) suffix[r] = suffix[r + 1] + rowc[r];
    var colused = new Array(R).fill(0);
    (function rec(r, placed, prev) {
      if (r === R) { if (placed.length === n) out.push(placed.slice()); return; }
      if (placed.length + suffix[r] !== n) return;
      var opts = [];
      for (var c = 0; c < R; c++) {
        if (freeSet.has(key(r, c)) && colused[c] < colc[c]) opts.push(c);
      }
      var combos = rowc[r] === 0 ? [[]] : combinations(opts, rowc[r]);
      for (var i = 0; i < combos.length; i++) {
        var combo = combos[i], bad = false, a, b;
        for (a = 0; a + 1 < combo.length; a++) if (combo[a + 1] - combo[a] === 1) { bad = true; break; }
        if (bad) continue;
        for (a = 0; a < combo.length && !bad; a++) {
          for (b = 0; b < prev.length; b++) if (Math.abs(combo[a] - prev[b]) <= 1) { bad = true; break; }
        }
        if (bad) continue;
        for (a = 0; a < combo.length; a++) { colused[combo[a]]++; placed.push([r, combo[a]]); }
        rec(r + 1, placed, combo);
        for (a = 0; a < combo.length; a++) { colused[combo[a]]--; placed.pop(); }
      }
    })(0, [], []);
    return out;
  }

  // Finds up to `limit` solutions. limit=2 is enough to tell whether it is unique.
  function solutions(R, free, castles, forests, inv, res, rowc, colc, limit) {
    limit = limit || 2;
    var types = Array.from(new Set(inv)).sort();
    var need = types.map(function (t) { return inv.filter(function (x) { return x === t; }).length; });
    var freeSet = new Set(free.map(function (p) { return key(p[0], p[1]); }));
    var castleKeys = [];
    castles.forEach(function (k) { k.forEach(function (p) { castleKeys.push(key(p[0], p[1])); }); });
    var out = [];
    var placements = enumPositions(R, freeSet, rowc, colc, inv.length);

    for (var pi = 0; pi < placements.length && out.length < limit; pi++) {
      var combo = placements[pi];
      var all = new Set(castleKeys);
      forests.forEach(function (p) { all.add(key(p[0], p[1])); });
      combo.forEach(function (p) { all.add(key(p[0], p[1])); });
      var onlyCastles = new Set(castleKeys);
      var blocks = { all: all, castles: onlyCastles };

      var table = combo.map(function (cell) {
        var k0 = key(cell[0], cell[1]);
        all.delete(k0);
        var row = types.map(function (t) {
          return castles.map(function (cc) { return damageTo(cell, t, cc, blocks); });
        });
        all.add(k0);
        return row;
      });

      var left = need.slice(), assign = [];
      (function rec(i, tot) {
        if (out.length >= limit) return;
        for (var j = 0; j < tot.length; j++) if (tot[j] > res[j]) return;  // overshooting invalidates
        if (i === combo.length) {
          for (var q = 0; q < tot.length; q++) if (tot[q] !== res[q]) return;
          out.push({ cells: combo.map(function (p) { return p.slice(); }), types: assign.slice() });
          return;
        }
        for (var k = 0; k < types.length; k++) {
          if (left[k] === 0) continue;
          var dv = table[i][k], any = false;
          for (var j2 = 0; j2 < dv.length; j2++) if (dv[j2] > 0) { any = true; break; }
          if (!any) continue;                    // no unit may sit idle
          left[k]--; assign.push(types[k]);
          rec(i + 1, tot.map(function (v, j3) { return v + dv[j3]; }));
          assign.pop(); left[k]++;
        }
      })(0, res.map(function () { return 0; }));
    }
    return out;
  }

  function randCastles(R, shapes, rnd, sep) {
    sep = sep || 3;
    var cells = [];
    for (var r = 0; r < R; r++) for (var c = 0; c < R; c++) cells.push([r, c]);
    for (var attempt = 0; attempt < 300; attempt++) {
      var out = [], used = [], ok = true;
      for (var s = 0; s < shapes.length; s++) {
        var sh = shapes[s];
        var cand = cells.filter(function (p) {
          return sh.every(function (d) {
            return p[0] + d[0] >= 0 && p[0] + d[0] < R && p[1] + d[1] >= 0 && p[1] + d[1] < R;
          });
        });
        rnd.shuffle(cand);
        var placed = null;
        for (var i = 0; i < cand.length; i++) {
          var k = sh.map(function (d) { return [cand[i][0] + d[0], cand[i][1] + d[1]]; });
          var clash = k.some(function (x) {
            return used.some(function (y) {
              return Math.abs(x[0] - y[0]) + Math.abs(x[1] - y[1]) < sep;
            });
          });
          if (!clash) { placed = k; break; }
        }
        if (!placed) { ok = false; break; }
        out.push(placed); placed.forEach(function (p) { used.push(p); });
      }
      if (ok) return out;
    }
    return null;
  }

  // Seeds a valid placement, derives the resistances and the counts from it,
  // and returns the puzzle only if that solution turns out to be the only one.
  function build(rnd, R, castles, nforest, inv, opts) {
    opts = opts || {};
    var minres = opts.minres === undefined ? 2 : opts.minres;
    var tries = opts.tries || 6;
    var cells = [];
    for (var r = 0; r < R; r++) for (var c = 0; c < R; c++) cells.push([r, c]);
    var castleKeys = new Set();
    castles.forEach(function (k) { k.forEach(function (p) { castleKeys.add(key(p[0], p[1])); }); });
    var pool = cells.filter(function (p) { return !castleKeys.has(key(p[0], p[1])); });
    var forests = rnd.sample(pool, nforest);
    var fkeys = new Set(forests.map(function (p) { return key(p[0], p[1]); }));
    var free = pool.filter(function (p) { return !fkeys.has(key(p[0], p[1])); });

    var base = new Set(castleKeys); fkeys.forEach(function (k) { base.add(k); });
    var baseBlocks = { all: base, castles: new Set(castleKeys) };
    var types = Array.from(new Set(inv));
    var useful = {};
    types.forEach(function (t) {
      useful[t] = free.filter(function (p) {
        return castles.some(function (cc) { return damageTo(p, t, cc, baseBlocks) > 0; });
      });
    });
    if (types.some(function (t) { return useful[t].length < 2; })) return null;

    var order = inv.slice().sort(function (a, b) { return useful[a].length - useful[b].length; });
    var placements = [];
    (function rec(i, used) {
      if (placements.length >= 40) return;
      if (i === order.length) { placements.push(used.slice()); return; }
      var opt = rnd.shuffle(useful[order[i]].slice());
      for (var j = 0; j < opt.length; j++) {
        var cell = opt[j];
        if (used.some(function (u) { return adjacent(cell, u[0]); })) continue;
        used.push([cell, order[i]]); rec(i + 1, used); used.pop();
      }
    })(0, []);
    rnd.shuffle(placements);

    for (var pi = 0; pi < Math.min(tries, placements.length); pi++) {
      var p = placements[pi];
      var combo = p.map(function (x) { return x[0]; });
      var all2 = new Set(base);
      combo.forEach(function (x) { all2.add(key(x[0], x[1])); });
      var blocks2 = { all: all2, castles: new Set(castleKeys) };
      var tot = castles.map(function () { return 0; }), idle = false;
      for (var i2 = 0; i2 < p.length; i2++) {
        var k0 = key(p[i2][0][0], p[i2][0][1]);
        all2.delete(k0);
        var dv = castles.map(function (cc) { return damageTo(p[i2][0], p[i2][1], cc, blocks2); });
        all2.add(k0);
        if (!dv.some(function (v) { return v > 0; })) { idle = true; break; }
        dv.forEach(function (v, j) { tot[j] += v; });
      }
      if (idle || Math.min.apply(null, tot) < minres) continue;
      // Every castle takes at least size+1. And the fortress, as the largest
      // piece on the board, takes more than any other castle.
      // No order is imposed between towers and watchtowers: an unobstructed
      // watchtower can take more fire than a cornered tower, and forbidding
      // that threw away good boards, more and more as the castle count grew.
      var size = castles.map(function (k) { return k.length; });
      var bad = false;
      for (var t1 = 0; t1 < size.length && !bad; t1++) {
        if (tot[t1] < size[t1] + 1) bad = true;
        if (size[t1] < 4) continue;
        for (var t2 = 0; t2 < size.length && !bad; t2++) {
          if (size[t1] > size[t2] && tot[t1] <= tot[t2]) bad = true;
        }
      }
      if (bad) continue;
      // Units that reach two castles: they are what ties one deduction to the
      // next instead of leaving each castle to itself. With two castles one is
      // enough; with four or five, a single one links a pair and leaves the
      // rest loose, so the dense puzzles ask for two (opts.doubles).
      if (castles.length > 1 && opts.doubles !== 0) {
        var minDoubles = opts.doubles || 1, count = 0;
        for (var q2 = 0; q2 < p.length; q2++) {
          var kq = key(p[q2][0][0], p[q2][0][1]);
          all2.delete(kq);
          var dvq = castles.map(function (cc) { return damageTo(p[q2][0], p[q2][1], cc, blocks2); });
          all2.add(kq);
          if (dvq.filter(function (v) { return v > 0; }).length >= 2) count++;
        }
        if (count < minDoubles) continue;
      }

      var rowc = [], colc = [];
      for (var q = 0; q < R; q++) {
        rowc.push(combo.filter(function (x) { return x[0] === q; }).length);
        colc.push(combo.filter(function (x) { return x[1] === q; }).length);
      }
      if (solutions(R, free, castles, forests, inv, tot, rowc, colc, 2).length === 1) {
        var puzzle = {
          R: R, castles: castles, forests: forests, inv: inv.slice(),
          res: tot, rowc: rowc, colc: colc,
          sol: p.map(function (x) { return { cell: x[0].slice(), type: x[1] }; })
        };
        // The difficulty band goes first because it is the cheaper of the two
        // gates: one propagate() against deducible()'s propagate plus rounds
        // of probing. About half the boards that reach here fall outside the
        // band asked of the seat, and those never pay for the human filter.
        if (opts.band) {
          puzzle.diff = difficulty(puzzle);
          if (puzzle.diff < opts.band[0] || puzzle.diff > opts.band[1]) continue;
        }
        // A unique solution is not the same as a solvable one: a board can have
        // a single answer and still ask the player to look five moves ahead.
        if (opts.human && !deducible(puzzle)) continue;
        if (puzzle.diff == null) puzzle.diff = difficulty(puzzle);
        return puzzle;
      }
    }
    return null;
  }

  // ------------------------------------------------------- the human solver
  // Only direct rules (row/column counts, adjacency, arsenal quota, damage
  // bounds) plus single-cell trial elimination. If the board does not come out
  // with that much, it is asking the player to guess and look several moves
  // ahead, and we do not take it as good.
  //
  // A cell's domain is a Set of the letters it may still hold, plus '.', which
  // stands for "left empty".
  function startState(d) {
    var castleKeys = new Set(), forestKeys = new Set();
    d.castles.forEach(function (k) { k.forEach(function (p) { castleKeys.add(key(p[0], p[1])); }); });
    d.forests.forEach(function (p) { forestKeys.add(key(p[0], p[1])); });
    var types = Array.from(new Set(d.inv)).sort();
    var quota = {};
    types.forEach(function (t) { quota[t] = d.inv.filter(function (x) { return x === t; }).length; });
    var dom = new Map(), free = [];
    for (var r = 0; r < d.R; r++) for (var c = 0; c < d.R; c++) {
      var k = key(r, c);
      if (castleKeys.has(k) || forestKeys.has(k)) continue;
      free.push([r, c]);
      dom.set(k, new Set(['.'].concat(types)));
    }
    return { d: d, dom: dom, free: free, types: types, quota: quota,
             castleKeys: castleKeys, forestKeys: forestKeys };
  }

  // Only the domains are copied: everything else is read-only for the solver.
  function cloneState(s) {
    var dom = new Map();
    s.dom.forEach(function (v, k) { dom.set(k, new Set(v)); });
    return { d: s.d, dom: dom, free: s.free, types: s.types, quota: s.quota,
             castleKeys: s.castleKeys, forestKeys: s.forestKeys };
  }

  var isUnit = function (s, k) { return !s.dom.get(k).has('.'); };
  var mayHold = function (s, k) { var v = s.dom.get(k); return v.size > 1 || !v.has('.'); };
  function drop(s, k, v) {
    var dv = s.dom.get(k);
    if (!dv.has(v)) return false;
    dv.delete(v);
    return true;
  }

  // Blocking sets while the board is only half solved: the optimistic one
  // assumes nothing else is in the way (upper bound on damage), the pessimistic
  // one assumes everything that could be there is (lower bound).
  function blockSets(s, except) {
    var opt = new Set(s.castleKeys), pes = new Set(s.castleKeys);
    s.forestKeys.forEach(function (k) { opt.add(k); pes.add(k); });
    s.free.forEach(function (p) {
      var k = key(p[0], p[1]);
      if (k === except) return;
      if (isUnit(s, k)) opt.add(k);
      if (mayHold(s, k)) pes.add(k);
    });
    return { opt: { all: opt, castles: s.castleKeys },
             pes: { all: pes, castles: s.castleKeys } };
  }

  // Damage bounds per castle. Returns null once the counts can no longer add
  // up: not enough damage left to reach the resistance, or too much on its way.
  function damageBounds(s) {
    var d = s.d, min = d.castles.map(function () { return 0; }),
        max = d.castles.map(function () { return 0; });
    for (var i = 0; i < s.free.length; i++) {
      var p = s.free[i], k = key(p[0], p[1]);
      if (!mayHold(s, k)) continue;
      var b = blockSets(s, k);
      var dv = Array.from(s.dom.get(k)).filter(function (x) { return x !== '.'; });
      if (!dv.length) continue;
      var forced = isUnit(s, k);
      for (var j = 0; j < d.castles.length; j++) {
        var hi = -1, lo = Infinity;
        for (var t = 0; t < dv.length; t++) {
          var a = damageTo(p, dv[t], d.castles[j], b.opt);
          var z = damageTo(p, dv[t], d.castles[j], b.pes);
          if (a > hi) hi = a;
          if (z < lo) lo = z;
        }
        max[j] += hi;
        if (forced) min[j] += lo;
      }
    }
    for (var q = 0; q < d.res.length; q++) {
      if (min[q] > d.res[q] || max[q] < d.res[q]) return null;
    }
    return { min: min, max: max };
  }

  // One round of the direct rules, repeated until nothing else moves.
  // Returns false when the board turns out to be impossible.
  function propagate(s) {
    var d = s.d, changed = true;
    while (changed) {
      changed = false;

      // 1) row and column counts
      for (var axis = 0; axis < 2; axis++) {
        for (var i = 0; i < d.R; i++) {
          var target = axis === 0 ? d.rowc[i] : d.colc[i];
          var fixed = [], maybe = [];
          for (var j = 0; j < d.R; j++) {
            var k = axis === 0 ? key(i, j) : key(j, i);
            if (!s.dom.has(k)) continue;
            if (isUnit(s, k)) fixed.push(k);
            if (mayHold(s, k)) maybe.push(k);
          }
          if (fixed.length > target || maybe.length < target) return false;
          if (fixed.length === target) {                  // the line is complete
            maybe.forEach(function (k) {
              if (isUnit(s, k)) return;
              s.types.forEach(function (t) { if (drop(s, k, t)) changed = true; });
            });
          }
          if (maybe.length === target) {                  // no room to spare
            maybe.forEach(function (k) { if (drop(s, k, '.')) changed = true; });
          }
        }
      }

      // 2) no two units ever touch
      for (var a = 0; a < s.free.length; a++) {
        var p = s.free[a], kp = key(p[0], p[1]);
        if (!isUnit(s, kp)) continue;
        for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          var kn = key(p[0] + dr, p[1] + dc);
          if (!s.dom.has(kn)) continue;
          if (!s.dom.get(kn).has('.')) return false;
          for (var t2 = 0; t2 < s.types.length; t2++) {
            if (drop(s, kn, s.types[t2])) changed = true;
          }
        }
      }

      // 3) arsenal quota
      for (var t3 = 0; t3 < s.types.length; t3++) {
        var tt = s.types[t3], placed = 0, slots = 0;
        for (var b = 0; b < s.free.length; b++) {
          var q = s.free[b], kq = key(q[0], q[1]), dq = s.dom.get(kq);
          if (isUnit(s, kq) && dq.size === 1 && dq.has(tt)) placed++;
          if (dq.has(tt)) slots++;
        }
        if (placed > s.quota[tt] || slots < s.quota[tt]) return false;
        if (placed === s.quota[tt]) {
          for (var b2 = 0; b2 < s.free.length; b2++) {
            var q2 = s.free[b2], k2 = key(q2[0], q2[1]), d2 = s.dom.get(k2);
            if (d2.size === 1 && d2.has(tt)) continue;
            if (drop(s, k2, tt)) changed = true;
          }
        }
      }

      // 4) no idle units: a type that damages nobody even in the best case
      //    cannot be standing there.
      for (var c1 = 0; c1 < s.free.length; c1++) {
        var pc = s.free[c1], kc = key(pc[0], pc[1]);
        if (!mayHold(s, kc)) continue;
        var bl = blockSets(s, kc);
        var list = Array.from(s.dom.get(kc)).filter(function (x) { return x !== '.'; });
        for (var c2 = 0; c2 < list.length; c2++) {
          var hits = d.castles.some(function (cc) {
            return damageTo(pc, list[c2], cc, bl.opt) > 0;
          });
          if (!hits && drop(s, kc, list[c2])) changed = true;
        }
        if (!s.dom.get(kc).size) return false;
      }

      // 5) damage bounds
      if (!damageBounds(s)) return false;

      var empty = s.free.some(function (p) { return s.dom.get(key(p[0], p[1])).size === 0; });
      if (empty) return false;
    }
    return true;
  }

  // Trial elimination: put one concrete value in one cell and, if propagating
  // it ends in a contradiction, that value is out. It is what anyone does in
  // pencil when they say "if this one were a ram, that castle would overshoot".
  // Returns null when a cell runs out of values, i.e. the board is dead.
  function probe(s) {
    var changed = false;
    for (var i = 0; i < s.free.length; i++) {
      var p = s.free[i], k = key(p[0], p[1]);
      var vals = Array.from(s.dom.get(k));
      if (vals.length < 2) continue;
      for (var j = 0; j < vals.length; j++) {
        var t = cloneState(s);
        t.dom.set(k, new Set([vals[j]]));
        if (!propagate(t)) {
          if (drop(s, k, vals[j])) changed = true;
          if (!s.dom.get(k).size) return null;
        }
      }
    }
    return changed;
  }

  function settled(s) {
    return s.free.every(function (p) { return s.dom.get(key(p[0], p[1])).size === 1; });
  }

  // true when the puzzle can be finished without guessing. The direct rules
  // first, then rounds of trial elimination for as long as they keep giving
  // something; `cap` is only there so a pathological board cannot spin.
  function deducible(d, opts) {
    opts = opts || {};
    var s = startState(d);
    if (!propagate(s)) return false;
    var rounds = 0, cap = opts.cap || 12;
    while (!settled(s) && rounds++ < cap) {
      var c = probe(s);
      if (c === null) return false;
      if (!c) break;
      if (!propagate(s)) return false;
    }
    if (!settled(s)) return false;
    // and what it deduced has to be the solution we already know
    var ok = true;
    d.sol.forEach(function (x) {
      var dv = s.dom.get(key(x.cell[0], x.cell[1]));
      if (!dv || !dv.has(x.type)) ok = false;
    });
    return ok;
  }

  // Independent check of an already generated puzzle.
  function verify(d) {
    var combo = d.sol.map(function (s) { return s.cell; });
    for (var i = 0; i < combo.length; i++) {
      for (var j = i + 1; j < combo.length; j++) {
        if (adjacent(combo[i], combo[j])) throw new Error('touching units');
      }
    }
    var all = new Set(), onlyC = new Set();
    d.castles.forEach(function (k) {
      k.forEach(function (p) { all.add(key(p[0], p[1])); onlyC.add(key(p[0], p[1])); });
    });
    d.forests.forEach(function (p) { all.add(key(p[0], p[1])); });
    combo.forEach(function (p) {
      if (all.has(key(p[0], p[1]))) throw new Error('unit on a castle or a forest');
      all.add(key(p[0], p[1]));
    });
    var blocks = { all: all, castles: onlyC };
    var tot = d.castles.map(function () { return 0; });
    d.sol.forEach(function (s) {
      var k0 = key(s.cell[0], s.cell[1]);
      all.delete(k0);
      var dv = d.castles.map(function (cc) { return damageTo(s.cell, s.type, cc, blocks); });
      all.add(k0);
      if (!dv.some(function (v) { return v > 0; })) throw new Error('idle unit');
      dv.forEach(function (v, j) { tot[j] += v; });
    });
    for (var q = 0; q < tot.length; q++) {
      if (tot[q] !== d.res[q]) throw new Error('damage differs from the resistance');
    }
    for (var r = 0; r < d.R; r++) {
      if (combo.filter(function (x) { return x[0] === r; }).length !== d.rowc[r]) throw new Error('row count');
      if (combo.filter(function (x) { return x[1] === r; }).length !== d.colc[r]) throw new Error('column count');
    }
    return true;
  }

  // ------------------------------------------------------ difficulty meter
  // How many free cells are still undecided once the DIRECT rules alone have
  // been run to a fixed point — that is, how much of the board is left when
  // everything automatic is spent and the real deduction starts. It is the one
  // number that says what a puzzle feels like: 0-5 comes out by counting,
  // 6-12 is a comfortable sit-down, 19-26 is a proper siege, over 30 is hard.
  //
  // It is measured on the finished board and never read off the spec, because
  // a spec has no difficulty — it has a distribution, and a wide one. Over 40
  // boards of one spec the meter has a standard deviation of 6 to 8: the
  // densest spec in the pool yields boards of 6 and boards of 36. That spread
  // is why the booklet cannot be shaped by an ordered table of specs alone.
  function difficulty(d) {
    var s = startState(d);
    if (!propagate(s)) return -1;
    var n = 0;
    s.free.forEach(function (p) { if (s.dom.get(key(p[0], p[1])).size > 1) n++; });
    return n;
  }

  // ------------------------------------------------------------- the specs
  // Each puzzle has its own arsenal: not all of them bring the four units.
  // sep = minimum separation between castles (3 by default).
  //
  // The specs are a POOL grouped by tier, not an ordered list: what orders the
  // booklet is the difficulty band asked of each seat (see plan()), and the
  // pool only supplies the shape of the board. Adding a spec to a tier adds
  // variety, never a new rung — the rung is the band.
  //
  // What makes a puzzle hard is the number of unit TYPES and the number of
  // units per board, not the board size: growing the grid without growing the
  // arsenal makes a puzzle EASIER (the row counts say less about more space).
  // Every spec carries the four letters; three-letter arsenals came out
  // solvable by pure counting in 40-95% of their boards.
  var POOL = {
    // Pinned to the opening seats, in this order: they teach the mechanics.
    // 1 the four units on the smallest board, 2 one unit more, 3 the two-cell
    // tower, 4 the third castle. The names in NAMES describe these boards, and
    // they can do that because these four seats are the only fixed ones.
    tutorial: [
      { R: 6,  shapes: ['watchtower', 'watchtower'],                                      forests: 3,  units: 4                 },
      { R: 6,  shapes: ['watchtower', 'watchtower'],                                      forests: 3,  units: 5                 },
      { R: 6,  shapes: ['watchtower', 'tower_v'],                                         forests: 3,  units: 6                 },
      { R: 7,  shapes: ['watchtower', 'watchtower', 'watchtower'],                        forests: 4,  units: 7,       sep: 2 }
    ],
    // The bridge: still one sitting, already past counting.
    ramp: [
      { R: 7,  shapes: ['tower_v', 'fortress'],                                           forests: 4,  units: 8                 },
      { R: 8,  shapes: ['watchtower', 'tower_v', 'fortress'],                             forests: 5,  units: 7                 },
      { R: 8,  shapes: ['watchtower', 'tower_h', 'fortress'],                             forests: 6,  units: 8                 }
    ],
    // The body of the booklet. Four shapes so a long run does not meet the
    // same board every few pages; they all land in the same band.
    siege: [
      { R: 8,  shapes: ['tower_v', 'tower_h', 'fortress'],                                forests: 6,  units: 9                 },
      { R: 8,  shapes: ['fortress', 'tower_v', 'watchtower', 'watchtower'],               forests: 6,  units: 9,     sep: 2, doubles: 2 },
      { R: 8,  shapes: ['fortress', 'tower_v', 'watchtower', 'watchtower'],               forests: 6,  units: 10,   sep: 2, doubles: 2 },
      { R: 8,  shapes: ['fortress', 'tower_v', 'watchtower', 'watchtower', 'watchtower'], forests: 5,  units: 10,   sep: 2, doubles: 2 }
    ],
    // The ending. With the board capped at 8x8 the closer is 10 units over
    // four or five castles, which reaches 26+ in a tenth of a second; a short
    // booklet gets the four-castle one. Eleven units on this board is past the
    // cliff — measured at 12 to 22 SECONDS a seat — and is not offered.
    climax: [
      { R: 8,  shapes: ['fortress', 'tower_v', 'tower_h', 'watchtower'],                  forests: 6,  units: 10,   sep: 2, doubles: 2 },
      { R: 8,  shapes: ['fortress', 'tower_v', 'tower_h', 'watchtower', 'watchtower'],    forests: 5,  units: 10,   sep: 2, doubles: 2 }
    ]
  };

  // ----------------------------------------------------- shape of a booklet
  // plan(i, n) says what seat i of a booklet of n has to be: which tier of the
  // pool it draws its board from and — the part that actually orders the
  // booklet — the band of the meter it has to land in.
  //
  //   tutorial   seats 1-4, fixed and in order      bands 0-5 … 10-17
  //   ramp       20% of the rest, at most 4         band 12-19
  //   body       everything else, ramp boards       band 11-18, swelling by WAVE
  //   finale     the 3 seats before the last         bands 19-26, 22-29, 25-32
  //   climax     the last seat                      26 and up
  //
  // It holds its shape at any n, which is the whole point: a booklet of 12 and
  // one of 100 both open soft, ramp up in a few pages, sit in the medium band
  // for the whole body and only climb in the last four pages.
  //
  // The body used to be the hard band (19-26, four seats in six) with a medium
  // breather in between, and the booklet came out too hard to sit down with:
  // past the ramp nearly every page wore HARD or BRUTAL on its rank chip. Now
  // the body is one sitting per page, drawn from the ramp tier so that it is a
  // lighter board and not a dense one that happened to fall easy, and the
  // swell only keeps it from reading flat. The difficulty is saved for the
  // FINALE: the last three seats before the closer climb through the siege
  // tier, each a band higher than the one before, so the ending reads as an
  // assault after a long march rather than as one more page of the same.
  var WAVE = [0, 1, 3, 0, 2, 4];
  var FINALE = [[19, 26], [22, 29], [25, 32]];
  function plan(i, n) {
    var tut = Math.min(POOL.tutorial.length, n > 1 ? n - 1 : n);
    if (n > 1 && i === n - 1)
      return { tier: 'climax', idx: n >= 8 ? 1 : 0, lo: n >= 8 ? 26 : 22, hi: 999 };
    if (i < tut)
      // The tutorial bands overlap but do rise: without a floor on seats 2-4
      // the first two puzzles both came out at 2 on every seed and read as the
      // same puzzle twice, which is a bad way to open a booklet.
      return { tier: 'tutorial', idx: i, lo: [0, 3, 6, 10][i], hi: [5, 9, 13, 17][i] };
    var rest = n - tut - 1;
    var ramp = Math.min(4, Math.max(1, Math.round(rest * 0.2)));
    if (i < tut + ramp) return { tier: 'ramp', lo: 12, hi: 19 };
    // The finale takes up to three seats, but never more than half of what is
    // left after the ramp: a short booklet keeps a body.
    var finale = Math.min(FINALE.length, Math.floor((rest - ramp) / 2));
    var j = i - tut - ramp, body = rest - ramp - finale;
    if (j >= body) {
      var f = FINALE[FINALE.length - finale + (j - body)];
      return { tier: 'siege', lo: f[0], hi: f[1] };
    }
    var k = j % WAVE.length;
    return { tier: 'ramp', lo: 11 + WAVE[k], hi: 18 + WAVE[k] };
  }

  // ---------------------------------------------------------- the generator
  // gopts.human (default true) keeps only the puzzles a person can finish by
  // deduction. gopts.band (default true) is the difficulty filter, and it is
  // what turns plan()'s bands into the actual shape of the booklet. Both throw
  // boards away, which is where the generation time goes — not in the solver.
  //
  // Stepwise on purpose: 100 puzzles take about 25 s and a synchronous loop
  // that long freezes the page. The interface drives next() one puzzle at a
  // time and paints its progress in between; generate() is the same loop run
  // to the end, for node and for the tests.
  function generator(n, seed, gopts) {
    gopts = gopts || {};
    var human = gopts.human !== false, useBand = gopts.band !== false;
    var rnd = rng(seed), i = 0;
    function step() {
      var pl = plan(i, n), tier = POOL[pl.tier];
      var cap = human ? 20000 : 4000, got = null;
      for (var a = 0; a < cap && !got; a++) {
        // Past two thirds of the budget the band opens up instead of the seat
        // failing outright: a booklet always comes out, even if one of its
        // pages lands a little outside the shape asked of it.
        var slack = a < cap * 0.66 ? 0
          : Math.ceil((a - cap * 0.66) / (cap * 0.05)) * 3;
        var spec = tier[pl.idx != null ? pl.idx : (i + a) % tier.length];
        var shapes = spec.shapes.map(function (f) { return SHAPES[f]; });
        var castleSet = randCastles(spec.R, shapes, rnd, spec.sep || 3);
        if (!castleSet) continue;
        // The arsenal is drawn per attempt, not per spec: two seats built from
        // the same spec come out with different units, and the search gets to
        // try another composition on the boards it rejects.
        got = build(rnd, spec.R, castleSet, spec.forests, drawArsenal(spec.units, rnd),
                    { doubles: spec.doubles || 1, human: human,
                      band: useBand ? [pl.lo - slack, pl.hi + slack] : null });
        if (got) { got.tier = pl.tier; got.want = [pl.lo, pl.hi]; }
      }
      if (!got) throw new Error('no puzzle found for seat ' + (i + 1));
      verify(got);
      i++;
      return got;
    }
    return { n: n, seat: function () { return i; },
             done: function () { return i >= n; }, next: step };
  }

  function generate(n, seed, onProgress, gopts) {
    var it = generator(n, seed, gopts), puzzles = [];
    while (!it.done()) {
      var got = it.next();
      puzzles.push(got);
      if (onProgress) onProgress(puzzles.length, n, got);
    }
    return puzzles;
  }

  var API = { TYPES: TYPES, SHAPES: SHAPES, POOL: POOL, rng: rng, adjacent: adjacent,
              drawArsenal: drawArsenal,
              damageTo: damageTo, solutions: solutions, randCastles: randCastles,
              deducible: deducible, difficulty: difficulty, plan: plan,
              build: build, verify: verify, generate: generate, generator: generator };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.Assault = API;
})(typeof self !== 'undefined' ? self : this);
