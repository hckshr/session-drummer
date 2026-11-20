// Build src/kit.json from CC0 sources (Virtuosity Drums + Karoryfer Swirly Drums).
// Needs the source files in SRC (see README "Rebuilding the kit"). Output: base64 MP3s per voice/layer/round-robin.
const { execFileSync } = require('child_process'); const fs = require('fs'); const path = require('path');
const SRC = process.env.KIT_SRC || '/workspace/sd-samples';
const C1 = SRC + '/ferrosintesis-samples-drumkit/samples/', C2 = SRC + '/ferrosintesis-samples-drumkit2/samples/', X = SRC + '/extra/';
const SR = 44100;
const grid = (dir, stem, vls, rrs) => vls.map(v => rrs.map(r => `${dir}${stem}_vl${v}_rr${r}.flac`));
// voice: { layers: [[file|[files to mix]]], cap: seconds, fade, trim }
const KIT = {
  K: { layers: grid(C1, 'kick', [1, 2, 3, 4], [1, 2]), cap: 0.55 },
  S: { layers: grid(C1, 'snare', [1, 3, 5, 6], [1, 2]), cap: 0.55 },
  RS: { layers: [[X + 'mid_snare_rimshot_vl3.flac', X + 'mid_snare_rimshot_vl6.flac'], [X + 'mid_snare_rimshot_vl9.flac', X + 'mid_snare_rimshot_vl12.flac']], cap: 0.6 },
  R: { layers: grid(C1, 'sidestick', [1, 2, 3], [1, 2]), cap: 0.3 },
  H: { layers: grid(C1, 'hhc', [1, 2, 3, 4], [1, 2]), cap: 0.35 },
  P: { layers: grid(C1, 'hhp', [1, 2, 3], [1, 2]), cap: 0.35 },
  O: { layers: grid(C1, 'hho', [2, 3, 4], [1, 2]), cap: 1.0 },
  Y: { layers: grid(C1, 'ride', [1, 2, 3], [1, 2]), cap: 1.2 },
  B: { layers: grid(C1, 'ridebell', [1, 2, 3], [1, 2]), cap: 1.2 },
  C: { layers: grid(C2, 'crash', [2, 3], [1, 2]), cap: 2.2, fade: 0.6 },
  T1: { layers: grid(C1, 'tomhi', [2, 3, 4], [1, 2]), cap: 0.7 },
  T2: { layers: grid(C1, 'tomlo', [2, 3, 4], [1, 2]), cap: 0.8 },
  SH: { layers: [[1, 2, 3, 4].map(r => X + `LShaker_Shake1D_rr${r}_Mid.wav`)], cap: 0.32 },
  BR: { layers: [2, 5, 8, 11].map(v => [1, 2].map(r => [X + `snare_hit_vl${v}_rr${r}_top.wav`, X + `snare_hit_vl${v}_rr${r}_btm.wav`])), cap: 0.6 },
  SW: { layers: [[X + 'stir_dl4_rr1.wav', X + 'stir_dl4_rr2.wav']], cap: 2.6, from: 0.4, trim: false, fade: 0.3 },
};
function decode(f) { const b = execFileSync('ffmpeg', ['-v', 'error', '-i', f, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 }); return new Float32Array(b.buffer, b.byteOffset, b.length / 4).slice(); }
function prep(src, v) {
  let x;
  if (Array.isArray(src)) { const a = src.map(decode); x = new Float32Array(Math.max(...a.map(y => y.length))); a.forEach((y, k) => { const g = k === 0 ? 1 : 0.55; for (let i = 0; i < y.length; i++) x[i] += g * y[i]; }); }
  else x = decode(src);
  let pk = 0; for (const s of x) pk = Math.max(pk, Math.abs(s));
  let start = Math.round((v.from || 0) * SR);
  if (v.trim !== false) { let i = 0; while (i < x.length && Math.abs(x[i]) < 0.03 * pk) i++; start = Math.max(0, i - Math.round(0.006 * SR)); }
  const len = Math.min(x.length - start, Math.round(v.cap * SR)); const y = x.slice(start, start + len);
  const fo = Math.round((v.fade || 0.15) * SR), fi = v.trim === false ? Math.round(0.05 * SR) : 0;
  for (let i = 0; i < y.length; i++) { let g = 1; if (i > y.length - fo) { const u = (y.length - i) / fo; g *= u * u; } if (fi && i < fi) g *= i / fi; y[i] *= g; }
  pk = 0; for (const s of y) pk = Math.max(pk, Math.abs(s)); for (let i = 0; i < y.length; i++) y[i] *= 0.9 / pk;
  return y;
}
function mp3(y) { return execFileSync('ffmpeg', ['-v', 'error', '-f', 'f32le', '-ar', String(SR), '-ac', '1', '-i', '-', '-c:a', 'libmp3lame', '-q:a', '4', '-f', 'mp3', '-'], { input: Buffer.from(y.buffer), maxBuffer: 1 << 26 }); }
const out = { sr: SR, format: 'mp3', voices: {} }; let bytes = 0, secs = 0, files = 0;
for (const v in KIT) {
  out.voices[v] = KIT[v].layers.map(layer => layer.map(src => { const y = prep(src, KIT[v]); const m = mp3(y); bytes += m.length; secs += y.length / SR; files++; return m.toString('base64'); }));
}
const dest = path.join(__dirname, '../src/kit.json'); fs.writeFileSync(dest, JSON.stringify(out));
console.log(`kit: ${files} samples, ${secs.toFixed(1)} s audio, ${(bytes / 1024).toFixed(0)} KB mp3, ${(fs.statSync(dest).size / 1024).toFixed(0)} KB json`);
