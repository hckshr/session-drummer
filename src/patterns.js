/* Session Drummer — groove library + ranking. Tracks: one char per step.
   X=accent x=normal o=soft g=ghost .=rest. Voices: K kick, S snare, R cross-stick, H hat, P hat foot, O open hat,
   Y ride, B ride bell, C crash, T1 rack tom, T2 floor tom, BR brush tap, SW brush sweep, SH shaker. */
(function (root) {
  'use strict';
  const P = [
    // ---------- 4/4 straight ----------
    { id: 'laidback', name: 'Laid-back backbeat', desc: 'Kick on 1 and 3, snare on 2 and 4, easy eighth hats. Leaves room for the guitar.', meter: '4/4', sub: 4, family: 'backbeat', kit: 'sticks', energy: 0.5, busy: 0.35, dark: 0.5, tempo: [68, 124], fill: 'toms',
      t: { K: 'X...|....|X.x.|....', S: '....|X...|....|X...', H: 'x.o.|x.o.|x.o.|x.o.' } },
    { id: 'xstick', name: 'Cross-stick pocket', desc: 'Rim-click backbeat and soft hats — quiet, close, and warm.', meter: '4/4', sub: 4, family: 'rim', kit: 'rim', energy: 0.3, busy: 0.3, dark: 0.55, tempo: [58, 118], fill: 'soft',
      t: { K: 'X...|....|x..x|....', R: '....|x...|....|x...', H: 'o.g.|o.g.|o.g.|o.g.' } },
    { id: 'drive8', rimshot: true, name: 'Driving straight eighths', desc: 'Pushy kick, hard eighth hats, backbeat on 2 and 4. Pushes the song forward.', meter: '4/4', sub: 4, family: 'drive', kit: 'sticks', energy: 0.8, busy: 0.5, dark: 0.5, tempo: [100, 175], fill: 'toms', crash: true,
      t: { K: 'X...|..x.|X.x.|....', S: '....|X...|....|X...', H: 'X.x.|X.x.|X.x.|X.x.' } },
    { id: 'floor4', rimshot: true, name: 'Four on the floor', desc: 'Kick on every beat, open hat on the off-beats. Steady and danceable.', meter: '4/4', sub: 4, family: 'floor', kit: 'sticks', energy: 0.72, busy: 0.5, dark: 0.4, tempo: [96, 140], fill: 'snare', crash: true,
      t: { K: 'X...|X...|X...|X...', S: '....|X...|....|X...', H: 'x...|x...|x...|x...', O: '..x.|..x.|..x.|..x.' } },
    { id: 'sixteenth', name: 'Busy sixteenth groove', desc: 'Sixteenth hats, syncopated kick, ghost notes on the snare. Busy but tight.', meter: '4/4', sub: 4, family: 'sixteenth', kit: 'sticks', energy: 0.65, busy: 0.85, dark: 0.45, tempo: [76, 115], fill: 'snare',
      t: { K: 'X..x|..x.|X...|.x..', S: '....|X..g|.g..|X..g', H: 'xoxo|xoxo|xoxo|xoxo' } },
    { id: 'rideballad', name: 'Slow ride and rim', desc: 'Ride cymbal eighths, rim-click on 2 and 4. Spacious, good for a slow song.', meter: '4/4', sub: 4, family: 'ballad', kit: 'rim', energy: 0.25, busy: 0.3, dark: 0.6, tempo: [52, 92], fill: 'soft',
      t: { K: 'X...|....|X...|....', R: '....|x...|....|x...', Y: 'x.o.|x.o.|x.o.|x.o.' } },
    { id: 'bigslow', rimshot: true, name: 'Big, slow backbeat', desc: 'Washy open hats, heavy kick and snare. Slow and heavy.', meter: '4/4', sub: 4, family: 'bigslow', kit: 'sticks', energy: 0.85, busy: 0.35, dark: 0.7, tempo: [54, 96], fill: 'toms', crash: true,
      t: { K: 'X...|....|X.X.|....', S: '....|X...|....|X...', O: 'x.x.|x.x.|x.x.|x.x.' } },
    { id: 'brush4', name: 'Straight brushes', desc: 'Brush sweeps on every beat, light taps on 2 and 4, a feathered kick.', meter: '4/4', sub: 4, family: 'brushes', kit: 'brush', energy: 0.15, busy: 0.2, dark: 0.5, tempo: [56, 132], fill: 'brush',
      t: { SW: 'x...|x...|x...|x...', BR: '....|x...|....|x...', K: 'o...|....|o...|....', P: '....|x...|....|x...' } },
    { id: 'tompulse', name: 'Floor-tom pulse', desc: 'Floor tom on the beat with rim-clicks and a shaker. Dark and moody.', meter: '4/4', sub: 4, family: 'toms', kit: 'toms', energy: 0.45, busy: 0.4, dark: 0.85, tempo: [58, 112], fill: 'toms',
      t: { T2: 'X...|x...|X...|x...', K: 'X...|....|X...|....', R: '....|x...|....|x...', SH: '..x.|..x.|..x.|..x.' } },
    { id: 'shaker', name: 'Shaker and rim, acoustic', desc: 'Sixteenth shaker, soft kick, rim on 2 and 4. Sounds like a small acoustic room.', meter: '4/4', sub: 4, family: 'shaker', kit: 'rim', energy: 0.35, busy: 0.6, dark: 0.35, tempo: [68, 126], fill: 'soft',
      t: { SH: 'xoxo|xoxo|xoxo|xoxo', K: 'X...|....|X..x|....', R: '....|x...|....|x...' } },
    { id: 'halftime', name: 'Half-time feel', desc: 'Same tempo, but the snare lands only on 3. Big and spacious.', meter: '4/4', sub: 4, family: 'halftime', kit: 'sticks', energy: 0.6, busy: 0.3, dark: 0.65, tempo: [60, 175], fill: 'toms', crash: true, turn: true,
      t: { K: 'X...|....|..x.|....', S: '....|....|X...|....', H: 'x.x.|x.x.|x.x.|x.x.' } },
    { id: 'doubletime', rimshot: true, name: 'Double-time push', desc: 'Snare on every off-beat, so the drums run twice as fast as your part.', meter: '4/4', sub: 4, family: 'doubletime', kit: 'sticks', energy: 0.9, busy: 0.7, dark: 0.5, tempo: [56, 112], fill: 'snare', crash: true, turn: true, turnOnly: true,
      t: { K: 'X...|X...|X...|X...', S: '..X.|..X.|..X.|..X.', H: 'x.x.|x.x.|x.x.|x.x.' } },
    { id: 'train', name: 'Train beat', desc: 'Sixteenths on the snare with accents on 2 and 4. Chugs along like a train.', meter: '4/4', sub: 4, family: 'train', kit: 'sticks', energy: 0.7, busy: 0.9, dark: 0.45, tempo: [88, 175], fill: 'snare', turn: true,
      t: { K: 'X...|..x.|X...|..x.', S: 'gogo|Xogo|gogo|Xogo' } },
    { id: 'bossa', name: 'Bossa pulse', desc: 'A bossa nova kick, rim-click clave, soft shaker. Gentle, but it moves.', meter: '4/4', sub: 4, bars: 2, family: 'bossa', kit: 'rim', energy: 0.3, busy: 0.55, dark: 0.45, tempo: [70, 150], fill: 'none', turn: true, turnOnly: true,
      t: { K: 'X..x|X..x|X..x|X..x|X..x|X..x|X..x|X..x', R: 'x...|..x.|....|x...|....|x...|..x.|....', SH: 'x.o.|x.o.|x.o.|x.o.|x.o.|x.o.|x.o.|x.o.' } },
    { id: 'tribal', name: 'Rolling toms', desc: 'Floor and rack toms carry the groove and a shaker fills the gaps. There\'s no backbeat at all.', meter: '4/4', sub: 4, family: 'tribal', kit: 'toms', energy: 0.7, busy: 0.8, dark: 0.8, tempo: [68, 132], fill: 'toms', turn: true, turnOnly: true,
      t: { T2: 'X..x|..x.|X..x|..x.', T1: '....|x...|....|x..x', K: 'X...|....|X...|....', SH: 'xoxo|xoxo|xoxo|xoxo' } },
    { id: 'onedrop', name: 'One-drop', desc: 'The kick and rim land only on 3, and beat 1 is left empty. Lazy and floating.', meter: '4/4', sub: 4, family: 'onedrop', kit: 'rim', energy: 0.35, busy: 0.25, dark: 0.5, tempo: [58, 110], fill: 'none', turn: true, turnOnly: true,
      t: { K: '....|....|X...|....', R: '....|....|X...|....', H: '..x.|..x.|..x.|..x.' } },
    // ---------- 4/4 swung (triplet grid) ----------
    { id: 'shuffle', name: 'Bluesy shuffle', desc: 'Shuffled hats, kick on every beat, backbeat on 2 and 4.', meter: '4/4', sub: 3, family: 'shuffle', kit: 'sticks', energy: 0.55, busy: 0.5, dark: 0.5, tempo: [68, 132], fill: 'snare', crash: true,
      t: { K: 'X..|x..|X..|x..', S: '...|X..|...|X..', H: 'x.o|x.o|x.o|x.o' } },
    { id: 'slow128', name: 'Slow 12/8 blues', desc: 'Triplets on the ride with a heavy 2 and 4. Fits a slow minor blues.', meter: '4/4', sub: 3, family: 'slow128', kit: 'sticks', energy: 0.45, busy: 0.6, dark: 0.65, tempo: [44, 84], fill: 'toms', crash: true,
      t: { K: 'X..|...|x..|..o', S: '...|X..|...|X..', Y: 'xox|xox|xox|xox' } },
    { id: 'texas', rimshot: true, name: 'Driving double shuffle', desc: 'Both hands shuffle on the snare, with the kick on every beat. Hard-charging.', meter: '4/4', sub: 3, family: 'texas', kit: 'sticks', energy: 0.82, busy: 0.8, dark: 0.45, tempo: [100, 165], fill: 'snare', crash: true,
      t: { K: 'X..|X..|X..|X..', S: 'g.o|X.o|g.o|X.o', P: '...|x..|...|x..' } },
    { id: 'hshuffle', name: 'Half-time shuffle', desc: 'Backbeat on 3 with shuffled ghost notes around it. Greasy, rolling, and busy.', meter: '4/4', sub: 3, family: 'hshuffle', kit: 'sticks', energy: 0.6, busy: 0.75, dark: 0.55, tempo: [66, 112], fill: 'snare', turn: true,
      t: { K: 'X..|..x|...|..x', S: '..g|..g|X.g|..g', H: 'x.o|x.o|x.o|x.o' } },
    { id: 'jazzride', name: 'Swing ride', desc: 'Ding, ding-a-ding on the ride, hat foot on 2 and 4, a feathered kick. Jazzy and light.', meter: '4/4', sub: 3, family: 'jazz', kit: 'sticks', energy: 0.4, busy: 0.5, dark: 0.5, tempo: [88, 230], fill: 'snare',
      t: { Y: 'X..|x.x|X..|x.x', P: '...|x..|...|x..', K: 'g..|g..|g..|g..', S: '...|..g|...|...' } },
    { id: 'brushswing', name: 'Swung brushes', desc: 'Brush sweeps, swung taps, hat foot on 2 and 4. Soft and late-night.', meter: '4/4', sub: 3, family: 'brushes', kit: 'brush', energy: 0.15, busy: 0.3, dark: 0.55, tempo: [56, 170], fill: 'brush',
      t: { SW: 'x..|x..|x..|x..', BR: '...|x.o|...|x.o', P: '...|x..|...|x..', K: 'g..|...|g..|...' } },
    { id: 'swtrain', name: 'Swung train beat', desc: 'A shuffled snare chug with accents on 2 and 4.', meter: '4/4', sub: 3, family: 'train', kit: 'sticks', energy: 0.7, busy: 0.7, dark: 0.45, tempo: [88, 170], fill: 'snare', turn: true,
      t: { K: 'X..|..x|X..|..x', S: 'x.g|X.g|x.g|X.g' } },
    { id: 'swtoms', name: 'Swung floor toms', desc: 'Floor tom in a shuffle, rim on 2 and 4, plus a shaker. Dark and swampy.', meter: '4/4', sub: 3, family: 'toms', kit: 'toms', energy: 0.45, busy: 0.55, dark: 0.85, tempo: [58, 112], fill: 'toms',
      t: { T2: 'X..|..x|X..|..x', K: 'X..|...|X..|...', R: '...|x..|...|x..', SH: 'x.o|x.o|x.o|x.o' } },
    // ---------- 3/4 ----------
    { id: 'brushwaltz', name: 'Brushed waltz', desc: 'Brush sweeps on all three beats, with taps and hat foot on 2 and 3. Gentle.', meter: '3/4', sub: 4, family: 'brushes', kit: 'brush', energy: 0.15, busy: 0.2, dark: 0.5, tempo: [66, 190], fill: 'brush',
      t: { SW: 'x...|x...|x...', BR: '....|x...|x...', K: 'o...|....|....', P: '....|x...|x...' } },
    { id: 'rimwaltz', name: 'Rim-click waltz', desc: 'Kick on 1, rim on 2 and 3, eighth hats. A simple oom-pah-pah.', meter: '3/4', sub: 4, family: 'rim', kit: 'rim', energy: 0.35, busy: 0.35, dark: 0.45, tempo: [70, 180], fill: 'soft',
      t: { K: 'X...|....|....', R: '....|x...|x...', H: 'x.o.|x.o.|x.o.' } },
    { id: 'darkwaltz', name: 'Dark, moody waltz', desc: 'Floor tom and kick on 1, ride and a lone rim-click. Slow and brooding.', meter: '3/4', sub: 4, family: 'ballad', kit: 'toms', energy: 0.35, busy: 0.3, dark: 0.9, tempo: [48, 112], fill: 'toms',
      t: { K: 'X...|....|..o.', T2: 'x...|....|....', R: '....|x...|....', Y: 'x.o.|x...|x.o.' } },
    { id: 'bigwaltz', rimshot: true, name: 'Big rolling 3/4', desc: 'Heavy kick on 1 and the "and" of 2, with a big snare on 3. Builds a big rolling sway.', meter: '3/4', sub: 4, family: 'bigwaltz', kit: 'sticks', energy: 0.75, busy: 0.45, dark: 0.6, tempo: [66, 150], fill: 'toms', crash: true,
      t: { K: 'X...|..x.|....', S: '....|....|X...', H: 'x.x.|x.x.|x.x.' } },
    { id: 'waltzhalf', name: 'Two-bar half-feel', desc: 'One snare every two bars over a steady ride. It stretches the waltz out wide.', meter: '3/4', sub: 4, bars: 2, family: 'halftime', kit: 'sticks', energy: 0.5, busy: 0.2, dark: 0.6, tempo: [80, 200], fill: 'toms', crash: true, turn: true, turnOnly: true,
      t: { K: 'X...|....|....|....|....|..o.', S: '....|....|....|X...|....|....', Y: 'x...|x...|x...|x...|x...|x...' } },
    { id: 'jazzwaltz', name: 'Swung jazz waltz', desc: 'The ride plays ding, ding-a-ding across three beats, with hat foot on 2 and 3.', meter: '3/4', sub: 3, family: 'jazz', kit: 'sticks', energy: 0.4, busy: 0.5, dark: 0.5, tempo: [96, 230], fill: 'snare',
      t: { Y: 'X..|x.x|x..', P: '...|x..|x..', K: 'g..|...|...', S: '...|..g|...' } },
    // ---------- 6/8 (beats = dotted quarters) ----------
    { id: 'ballad68', name: 'Slow 6/8 ballad', desc: 'Kick on 1, snare on 4, with every eighth on the hats. A slow, lilting sway.', meter: '6/8', sub: 3, family: 'ballad68', kit: 'sticks', energy: 0.45, busy: 0.5, dark: 0.6, tempo: [34, 76], fill: 'toms', crash: true,
      t: { K: 'X..|...', S: '...|X..', H: 'xoo|xoo' } },
    { id: 'toms68', name: 'Rolling 6/8 toms', desc: 'Floor toms carry the lilt, with a rim-click on 4 and a shaker. Dark.', meter: '6/8', sub: 3, family: 'toms', kit: 'toms', energy: 0.5, busy: 0.65, dark: 0.85, tempo: [34, 82], fill: 'toms',
      t: { T2: 'X.x|..x', K: 'X..|...', R: '...|x..', SH: 'xoo|xoo' } },
    { id: 'brush68', name: '6/8 brushes', desc: 'Two big brush sweeps per bar and a soft tap on 4.', meter: '6/8', sub: 3, family: 'brushes', kit: 'brush', energy: 0.15, busy: 0.3, dark: 0.5, tempo: [34, 92], fill: 'brush',
      t: { SW: 'x..|x..', BR: '...|x..', K: 'o..|...' } },
    { id: 'drive68', rimshot: true, name: 'Driving 6/8', desc: 'Every eighth on the hats, a pushy kick, and a hard snare on 4.', meter: '6/8', sub: 3, family: 'drive', kit: 'sticks', energy: 0.75, busy: 0.7, dark: 0.55, tempo: [38, 84], fill: 'toms', crash: true,
      t: { K: 'X..|x.x', S: '...|X..', H: 'xxx|xxx' } },
    { id: 'afro68', name: '6/8 bell groove', desc: 'A rolling bell pattern on the ride bell, floor-tom answers, and rim on 4. Hypnotic.', meter: '6/8', sub: 3, bars: 2, family: 'afro', kit: 'toms', energy: 0.6, busy: 0.7, dark: 0.6, tempo: [38, 92], fill: 'none', turn: true,
      t: { B: 'x.x|.xx|.x.|x.x', K: 'X..|...|X..|...', T2: '..o|..x|..o|..x', R: '...|x..|...|x..' } },
  ];
  const VOICES = ['K', 'S', 'RS', 'R', 'H', 'P', 'O', 'Y', 'B', 'C', 'T1', 'T2', 'BR', 'SW', 'SH'];
  const VEL = { X: 1, x: 0.78, o: 0.52, g: 0.3 };
  const BEATS = { '4/4': 4, '3/4': 3, '6/8': 2 };

  function parse(p) {
    const beats = BEATS[p.meter], bars = p.bars || 1, steps = beats * p.sub * bars;
    const tracks = {};
    for (const v in p.t) {
      const s = p.t[v].replace(/\|/g, '');
      if (s.length !== steps) throw new Error(`pattern ${p.id} track ${v}: ${s.length} steps, expected ${steps}`);
      if (VOICES.indexOf(v) < 0) throw new Error(`pattern ${p.id}: unknown voice ${v}`);
      const a = []; for (let i = 0; i < s.length; i++) { const c = s[i]; if (c !== '.') { if (!(c in VEL)) throw new Error(`bad char ${c} in ${p.id}`); a.push([i, VEL[c]]); } }
      tracks[v] = a;
    }
    return Object.assign({}, p, { beats, bars, steps, stepsPerBar: beats * p.sub, tracks, feel: p.meter === '6/8' || p.sub === 3 ? 'swing' : 'straight' });
  }
  const LIB = P.map(parse);
  const byId = {}; LIB.forEach(p => byId[p.id] = p);

  function compat(G, p) {
    const gm = G.meter, pm = p.meter;
    if (gm === pm) return { bpm: G.bpm, rel: 'same' };
    if (gm === '4/4' && pm === '6/8' && G.feel === 'swing') return { bpm: G.bpm, rel: 'compound' };
    if (gm === '3/4' && pm === '6/8') return { bpm: G.bpm * 2 / 3, rel: 'hemiola' };
    if (gm === '6/8' && pm === '4/4' && p.sub === 3) return { bpm: G.bpm, rel: '12/8' };
    if (gm === '6/8' && pm === '3/4' && p.sub === 4) return { bpm: G.bpm * 1.5, rel: 'hemiola' };
    return null;
  }
  function tempoFit(p, bpm) {
    const [lo, hi] = p.tempo; if (bpm >= lo && bpm <= hi) return 0;
    return -Math.abs(Math.log2(bpm < lo ? lo / bpm : bpm / hi)) * 3;
  }
  function seeded(seed) { let s = (seed * 2654435761) >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

  function turnNote(G, p, c) {
    if (c.rel === 'compound') return '6/8 over your 4/4 shuffle. Same triplet grid, but the bar splits into two big pulses.';
    if (c.rel === 'hemiola') return G.meter === '3/4' ? '6/8 over your 3/4. The bar is the same length, but the pulse splits in two instead of three.' : '3/4 over your 6/8. The bar is the same length, with three pulses instead of two.';
    if (c.rel === '12/8') return 'A shuffle over your 6/8. One drum bar spans two of yours.';
    if (p.feel !== G.feel && G.meter !== '6/8') return G.feel === 'straight' ? 'Your part is straight, and this swings underneath it. It might clash, or it might be cool.' : 'Your part swings, and this plays it dead straight underneath.';
    if (p.family === 'halftime') return 'Same tempo, but the backbeat comes half as often. Big and spacious.';
    if (p.family === 'doubletime') return 'Same tempo, but the drums run twice as fast underneath you.';
    if (p.family === 'bossa') return 'A Latin pulse under your part. Unexpected, but it can really open things up.';
    if (p.family === 'onedrop') return 'Takes away the downbeat and leaves a big hole on 1.';
    if (p.family === 'tribal') return 'No cymbals or backbeat, just toms. Primal.';
    if (p.family === 'train') return 'Turns your part into a chugging locomotive.';
    if (p.family === 'hshuffle') return 'The same shuffle at half the backbeat. It turns greasy.';
    if (p.family === 'afro') return 'Puts a rolling triplet bell under your part.';
    return 'A different take on your part.';
  }
  function matchWhy(G, F, p) {
    const bits = [];
    if (tempoFit(p, G.bpm) === 0) bits.push('sits well at this tempo');
    const de = p.energy - F.energy;
    bits.push(Math.abs(de) < 0.18 ? 'matches your energy' : de > 0 ? 'a little more push than your part' : 'lighter than your part');
    if (F.dark > 0.62 && p.dark > 0.62) bits.push('suits the moody vibe');
    else if (F.dark < 0.4 && p.dark < 0.45) bits.push('keeps it bright');
    if (F.busy > 0.6 && p.busy < 0.4) bits.push('stays out of the way of a busy part');
    return bits.join(', ').replace(/^./, c => c.toUpperCase()) + '.';
  }

  // G: {meter, bpm, feel}, F: features {energy,busy,dark}. Returns {matches:[], turns:[]}
  function rank(G, F, opts) {
    opts = opts || {};
    const rnd = seeded(opts.seed || 1); const jitter = opts.seed > 1 ? 0.6 : 0; const exclude = new Set(opts.exclude || []);
    const cands = [];
    for (const p of LIB) {
      const c = compat(G, p); if (!c) continue;
      const tf = tempoFit(p, c.bpm);
      const fit = 2 + tf - 1.6 * Math.abs(p.energy - F.energy) - 1.0 * Math.abs(p.busy - F.busy) - 1.1 * Math.abs(p.dark - F.dark);
      const feelOk = G.meter === '6/8' ? p.feel === 'swing' : p.feel === G.feel;
      const isMatch = (c.rel === 'same' || c.rel === '12/8') && feelOk && !p.turnOnly;
      cands.push({ p, c, tf, fit, isMatch, isTurnable: p.turn || !feelOk || (c.rel !== 'same') });
    }
    const pick = (list, n, score, usedFam) => {
      const out = []; const sorted = list.map(x => ({ x, s: score(x) + (exclude.has(x.p.id) ? -3 : 0) })).sort((a, b) => b.s - a.s);
      for (const { x } of sorted) { if (out.length >= n) break; if (usedFam.has(x.p.family)) continue; usedFam.add(x.p.family); out.push(x); }
      return out;
    };
    const fam = new Set();
    const matches = pick(cands.filter(x => x.isMatch), 4, x => x.fit + jitter * rnd(), fam);
    const ids = new Set(matches.map(m => m.p.id));
    const turns = pick(cands.filter(x => x.isTurnable && !ids.has(x.p.id)), 2, x => 1 + x.tf * 0.7 - 0.6 * Math.abs(x.p.energy - F.energy) + (x.p.turn ? 0.5 : 0) + (x.c.rel !== 'same' ? 0.3 : 0) + (0.5 + jitter) * rnd(), fam);
    const toCard = (x, kind) => ({ id: x.p.id, pattern: x.p, bpm: x.c.bpm, rel: x.c.rel, kind, why: kind === 'turn' ? turnNote(G, x.p, x.c) : matchWhy(G, F, x.p) });
    return { matches: matches.map(m => toCard(m, 'match')), turns: turns.map(t => toCard(t, 'turn')) };
  }

  const api = { LIB, byId, VOICES, BEATS, rank, compat, parse };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SDPatterns = api;
})(typeof self !== 'undefined' ? self : this);
