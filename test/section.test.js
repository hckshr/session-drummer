// Best-section picker: a take with a sloppy/rushed stretch and a pause should pick the steady part
const A = require('../src/analysis.js'); const SR = 48000;
let s = 7; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
const midi = n => 440 * Math.pow(2, (n - 69) / 12);
function take() {
  const secs = 46, out = new Float32Array(SR * secs);
  const pluck = (t0, f, vel, dur) => { const N = Math.round(SR / f); const b = new Float32Array(N); for (let i = 0; i < N; i++) b[i] = (rnd() * 2 - 1) * vel; const st = Math.round(t0 * SR); let idx = 0; for (let i = 0; i < dur * SR && st + i < out.length; i++) { const a = b[idx], c = b[(idx + 1) % N]; b[idx] = (a + c) * 0.498; idx = (idx + 1) % N; out[st + i] += a; } };
  const chords = [[40, 47, 52, 56, 59], [45, 52, 57, 61, 64], [47, 54, 59, 63, 66], [40, 47, 52, 56, 59]];
  let t = 0.3, beat = 0; const steadyFrom = 22, steadyTo = 40;
  while (t < secs - 1.5) {
    const inSteady = t >= steadyFrom && t < steadyTo;
    if (t > 12 && t < 14.4) { t += 0.6; beat++; continue; } // a pause
    const P = 60 / 100 * (inSteady ? 1 : 1 + 0.07 * Math.sin(beat / 2.3));
    const jit = (rnd() - 0.5) * (inSteady ? 0.01 : 0.07);
    const ch = chords[Math.floor(beat / 4) % 4]; ch.forEach((n, i) => pluck(t + jit + i * 0.008, midi(n), beat % 4 === 0 ? 1 : 0.7, P * 0.9));
    pluck(t + jit + P / 2, midi(ch[3]), 0.4, P * 0.4);
    t += P; beat++;
  }
  let pk = 0; for (const v of out) pk = Math.max(pk, Math.abs(v)); for (let i = 0; i < out.length; i++) out[i] /= pk * 2;
  return out;
}
const x = take(); let t0 = Date.now(); const r = A.analyze(x, SR); const ms = Date.now() - t0;
const c = A.retrack(r, { bpm: Math.round(r.bpm), meter: r.meter, feel: r.feel, bpmExact: true });
const best = A.bestSection(c, 16, 4);
const at = c.beats[best.start];
console.log(`analysis of ${(x.length / SR).toFixed(0)} s take: ${ms} ms, bpm ${r.bpm.toFixed(1)} ${r.meter} ${r.feel}`);
console.log(`best 4-bar section starts at ${at.toFixed(1)} s (steady stretch is 22–40 s), wobble ${best.wobbleMs.toFixed(1)} ms, playing ${Math.round(best.actFrac * 100)}%`);
const ok = at >= 21.5 && at + 16 * 0.6 <= 40.5 && Math.abs(r.bpm - 100) < 4;
console.log(ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
