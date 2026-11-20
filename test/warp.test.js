// Drifting, sloppy player: does the beat-anchored warp put his strums on the grid?
const A = require('../src/analysis.js'); const G = require('./gen.js');
const SR = G.SR; const secs = 18; const out = new Float32Array(SR * secs);
let s = 12345; const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
const midi = n => 440 * Math.pow(2, (n - 69) / 12);
function pluck(t0, f, vel, dur) { const N = Math.round(SR / f); const b = new Float32Array(N); for (let i = 0; i < N; i++) b[i] = (rand() * 2 - 1) * vel; const st = Math.round(t0 * SR); let idx = 0; for (let i = 0; i < dur * SR && st + i < out.length; i++) { const a = b[idx], c = b[(idx + 1) % N]; b[idx] = (a + c) * 0.498; idx = (idx + 1) % N; out[st + i] += a; } }
const chords = [[43, 47, 50, 55, 59], [48, 52, 55, 60, 64], [50, 57, 62, 66], [43, 47, 50, 55, 59]];
let t = 0.5, beat = 0; const truth = [];
while (t < secs - 1) { const bpm = 100 * (1 + 0.05 * Math.sin(beat / 6)); const P = 60 / bpm; const jit = (rand() - 0.5) * 0.03; truth.push(t + jit);
  const ch = chords[Math.floor(beat / 4) % 4]; ch.forEach((n, i) => pluck(t + jit + i * 0.008, midi(n), beat % 4 === 0 ? 1 : 0.7, P * 0.9)); t += P; beat++; }
let pk = 0; for (const v of out) pk = Math.max(pk, Math.abs(v)); for (let i = 0; i < out.length; i++) out[i] /= pk * 2;
const r = A.analyze(out, SR); console.log('detected', r.bpm.toFixed(1), r.meter, r.feel);
const c = A.retrack(r, { bpm: Math.round(r.bpm), meter: r.meter, feel: r.feel, bpmExact: true });
const Pd = 60 / c.bpm, lead = 0.06, start = 8, need = 16;
const ain = [], aout = []; for (let k = 0; k <= need + 1; k++) { ain.push(c.beats[start + k]); aout.push(lead + k * Pd); }
const y = A.warp(out, SR, ain, aout, lead + need * Pd + 0.5);
const raw = out.slice(Math.round((c.beats[start] - lead) * SR), Math.round((c.beats[start] - lead) * SR) + y.length);
function errs(sig) { const o = A._internals; const f = o.extract(sig, SR); const on = o.pickOnsets(f.env, f.fr).map(x => x.f / f.fr + f.t0);
  const e = []; for (let k = 0; k < need; k++) { const g = lead + k * Pd; let best = 1e9; for (const x of on) if (Math.abs(x - g) < Math.abs(best)) best = x - g; e.push(best * 1000); } return e; }
const stat = e => { const a = e.map(Math.abs); return `mean |err| ${(a.reduce((p, q) => p + q, 0) / a.length).toFixed(1)} ms, max ${Math.max(...a).toFixed(1)} ms`; };
console.log('raw (start aligned only):', stat(errs(raw)));
console.log('snapped to grid:         ', stat(errs(y)));
