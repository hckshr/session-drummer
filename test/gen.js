// Generate guitar-like test recordings (Karplus–Strong strums) with known tempo/meter/feel
const fs = require('fs');
const SR = 48000;
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
function pluck(out, t0, f, vel, dur, rand) {
  const N = Math.max(2, Math.round(SR / f)); const buf = new Float32Array(N);
  let lp = 0; for (let i = 0; i < N; i++) { const r = rand() * 2 - 1; lp = lp * 0.5 + r * 0.5; buf[i] = lp * vel; }
  const start = Math.round(t0 * SR), len = Math.round(dur * SR);
  let idx = 0; const fb = 0.996 - (f > 400 ? 0.004 : 0);
  for (let i = 0; i < len && start + i < out.length; i++) {
    if (start + i < 0) continue;
    const a = buf[idx], b = buf[(idx + 1) % N];
    const v = (a + b) * 0.5 * fb; buf[idx] = v; idx = (idx + 1) % N;
    const fade = i > len - 400 ? (len - i) / 400 : 1;
    out[start + i] += a * fade;
  }
}
function strum(out, t, notes, vel, dir, dur, rand, spread = 0.009) {
  const ord = dir > 0 ? notes : notes.slice().reverse();
  ord.forEach((n, i) => pluck(out, t + i * spread * (0.7 + 0.6 * rand()), midi(n), vel * (0.8 + 0.3 * rand()), dur, rand));
}
function finish(out, rand) { let p = 0; for (const v of out) p = Math.max(p, Math.abs(v)); for (let i = 0; i < out.length; i++) out[i] = out[i] / p * 0.4 + (rand() * 2 - 1) * 0.002; return out; }
const jit = (rand, s) => { const u = rand() + rand() + rand() - 1.5; return u * s * 1.4; };

function shuffle(bpm = 90, secs = 18, seed = 1) {
  const rand = rng(seed); const out = new Float32Array(SR * secs); const B = 60 / bpm;
  const E = [40, 47], E6 = [40, 49], A = [45, 52], A6 = [45, 54], Bc = [47, 54], B6 = [47, 56];
  const prog = [[E, E6], [A, A6], [E, E6], [Bc, B6], [A, A6], [E, E6]];
  const t0 = 0.6; let beat = 0;
  for (let t = t0; t < secs - 0.5; t += B, beat++) {
    const bar = Math.floor(beat / 4); const [lo, hi] = prog[bar % prog.length];
    const pair = (beat % 2 === 0) ? lo : hi;
    strum(out, t + jit(rand, 0.008), pair, beat % 4 === 0 ? 1.0 : 0.8, 1, B * 0.62, rand);
    strum(out, t + B * 2 / 3 + jit(rand, 0.008), pair, 0.6, 1, B * 0.3, rand);
  }
  return finish(out, rand);
}
function waltz(bpm = 100, secs = 18, seed = 2) {
  const rand = rng(seed); const out = new Float32Array(SR * secs); const B = 60 / bpm;
  const prog = [[45, [57, 60, 64]], [50, [57, 62, 65]], [40, [56, 59, 64]], [45, [57, 60, 64]]];
  let beat = 0;
  for (let t = 0.4; t < secs - 0.5; t += B, beat++) {
    const bar = Math.floor(beat / 3), pos = beat % 3; const [bass, ch] = prog[bar % 4];
    if (pos === 0) pluck(out, t + jit(rand, 0.008), midi(bass), 1.0, B * 0.95, rand);
    else strum(out, t + jit(rand, 0.008), ch, 0.45, 1, B * 0.8, rand, 0.006);
  }
  return finish(out, rand);
}
function straight(bpm = 120, secs = 16, seed = 3) {
  const rand = rng(seed); const out = new Float32Array(SR * secs); const B = 60 / bpm;
  const G = [43, 47, 50, 55, 59, 67], C = [48, 52, 55, 60, 64], D = [50, 57, 62, 66], prog = [G, C, D, G];
  let e = 0;
  for (let t = 0.5; t < secs - 0.5; t += B / 2, e++) {
    const bar = Math.floor(e / 8); const ch = prog[bar % 4];
    const down = e % 2 === 0;
    strum(out, t + jit(rand, 0.007), down ? ch : ch.slice(2), down ? (e % 8 === 0 ? 1 : 0.85) : 0.5, down ? 1 : -1, B * 0.5, rand);
  }
  return finish(out, rand);
}
function slowArp(bpm = 72, secs = 18, seed = 4) { // sparse straight 8th arpeggio, E minor
  const rand = rng(seed); const out = new Float32Array(SR * secs); const B = 60 / bpm;
  const prog = [[40, 52, 55, 59], [36, 52, 55, 60], [38, 54, 57, 62], [35, 54, 59, 63]];
  let e = 0;
  for (let t = 0.5; t < secs - 0.5; t += B / 2, e++) {
    const bar = Math.floor(e / 8); const ch = prog[bar % 4]; const i = e % 8;
    const note = i === 0 ? ch[0] : ch[1 + (i % 3)];
    pluck(out, t + jit(rand, 0.008), midi(note), i === 0 ? 1 : 0.55, B * 1.2, rand);
  }
  return finish(out, rand);
}
function wav(path, x) {
  const b = Buffer.alloc(44 + x.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + x.length * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(x.length * 2, 40);
  for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(x[i] * 32767))), 44 + i * 2);
  fs.writeFileSync(path, b);
}
module.exports = { SR, shuffle, waltz, straight, slowArp, wav };
if (require.main === module) { wav(__dirname + '/shuffle90.wav', shuffle()); wav(__dirname + '/waltz100.wav', waltz()); wav(__dirname + '/straight120.wav', straight()); wav(__dirname + '/arp72.wav', slowArp()); console.log('ok'); }
