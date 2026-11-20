// Hands-free detector: silence padding, short mid-take pauses, over-60 s input, re-arm, background noise
const { Listener } = require('../src/listener.js'); const G = require('./gen.js'); const A = require('../src/analysis.js');
const SR = G.SR;
let s = 99; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 * 2 - 1; };
const silence = (sec, lvl = 0.002) => { const x = new Float32Array(Math.round(sec * SR)); for (let i = 0; i < x.length; i++) x[i] = rnd() * lvl; return x; };
const cat = (...a) => { const n = a.reduce((p, x) => p + x.length, 0); const o = new Float32Array(n); let p = 0; for (const x of a) { o.set(x, p); p += x.length; } return o; };
const scale = (x, g) => x.map(v => v * g);
function run(sig, opts) {
  const L = new Listener(SR, opts); const ev = []; const B = 4096;
  for (let i = 0; i < sig.length; i += B) for (const e of L.push(sig.subarray(i, i + B))) ev.push(Object.assign({ at: (i / SR).toFixed(1) }, e));
  return ev;
}
let fail = 0; const check = (name, ok, info) => { console.log((ok ? 'PASS ' : 'FAIL ') + name + ' — ' + info); if (!ok) fail++; };
const desc = ev => ev.map(e => e.type + '@' + e.at + (e.played ? ` played ${e.played.toFixed(1)}s` : '') + (e.take ? ` take ${(e.take.length / SR).toFixed(1)}s (${e.reason})` : '')).join(', ');

// 1. silence padding around a shuffle
let ev = run(cat(silence(4), G.shuffle(90, 14, 3), silence(6)));
let tk = ev.filter(e => e.type === 'take');
check('padded shuffle → one take', tk.length === 1 && Math.abs(tk[0].take.length / SR - 15) < 2.5, desc(ev));
if (tk[0]) { const r = A.analyze(tk[0].take, SR); check('  analysis of trimmed take', Math.abs(r.bpm - 90) < 3 && r.feel === 'swing', `bpm ${r.bpm.toFixed(1)} ${r.meter} ${r.feel}`); }
// 2. mid-take pause of 1.8 s (shorter than the 2.8 s stop threshold) → still one take
ev = run(cat(silence(3), G.waltz(100, 10, 4), silence(1.8, 0.002), G.waltz(100, 10, 5), silence(6)));
tk = ev.filter(e => e.type === 'take');
check('1.8 s pause stays one take', tk.length === 1 && tk[0].take.length / SR > 19, desc(ev));
if (tk[0]) { const r = A.analyze(tk[0].take, SR); check('  analysis across the pause', Math.abs(r.bpm - 100) < 3 && r.meter === '3/4', `bpm ${r.bpm.toFixed(1)} ${r.meter} ${r.feel}`); }
// 3. a 5 s pause splits into two takes
ev = run(cat(silence(3), G.straight(120, 9, 6), silence(5), G.straight(120, 9, 7), silence(5)));
check('5 s pause → two takes', ev.filter(e => e.type === 'take').length === 2, desc(ev));
// 4. over-60 s continuous playing → stops at 60 s, doesn't instantly re-trigger while still playing
const long = cat(silence(2), G.shuffle(96, 40, 8), G.shuffle(96, 40, 9), silence(5));
ev = run(long);
tk = ev.filter(e => e.type === 'take');
check('75+ s playing → capped take', tk.length >= 1 && tk[0].reason === 'max' && tk[0].take.length / SR <= 61.5 && ev.filter(e => e.type === 'start').length === 1, desc(ev));
// 5. room noise and one stray knock don't trigger
const noisy = cat(silence(10, 0.02)); for (let i = 0; i < 400; i++) noisy[Math.round(4 * SR) + i] += rnd() * 0.5 * Math.exp(-i / 80);
ev = run(noisy);
check('steady noise + one knock → nothing', ev.length === 0, desc(ev) || 'no events');
// 6. quiet playing over louder room noise still triggers
ev = run(cat(silence(4, 0.01), scale(G.straight(110, 12, 10), 0.25), silence(6, 0.01)));
check('quiet playing over noise → take', ev.filter(e => e.type === 'take').length === 1, desc(ev));
// 7. a short noodle (< 4 s) is discarded, then a real take is captured
ev = run(cat(silence(3), G.straight(120, 2.5, 11), silence(5), G.shuffle(90, 12, 12), silence(5)));
check('short noodle discarded, real take kept', ev.some(e => e.type === 'short') && ev.filter(e => e.type === 'take').length === 1, desc(ev));
// 8. pre-roll: first note not clipped
ev = run(cat(silence(3), G.straight(120, 10, 13), silence(5)));
tk = ev.filter(e => e.type === 'take')[0];
if (tk) { let i = 0; while (i < tk.take.length && Math.abs(tk.take[i]) < 0.05) i++; check('pre-roll keeps first note', i / SR > 0.1 && i / SR < 0.5, `first loud sample at ${(i / SR * 1000).toFixed(0)} ms into the take`); }
process.exit(fail ? 1 : 0);
