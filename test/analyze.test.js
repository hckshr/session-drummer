const A = require('../src/analysis.js'); const G = require('./gen.js');
const cases = [
  ['shuffle 90', G.shuffle(90), { bpm: 90, meter: '4/4', feel: 'swing' }],
  ['shuffle 90 seed5', G.shuffle(90, 15, 5), { bpm: 90, meter: '4/4', feel: 'swing' }],
  ['shuffle 120', G.shuffle(120, 15, 9), { bpm: 120, meter: '4/4', feel: 'swing' }],
  ['waltz 100', G.waltz(100), { bpm: 100, meter: '3/4', feel: 'straight' }],
  ['waltz 84', G.waltz(84, 18, 7), { bpm: 84, meter: '3/4', feel: 'straight' }],
  ['waltz 140', G.waltz(140, 15, 8), { bpm: 140, meter: '3/4', feel: 'straight' }],
  ['straight 120', G.straight(120), { bpm: 120, meter: '4/4', feel: 'straight' }],
  ['arp 72', G.slowArp(72), { bpm: 72, meter: '4/4', feel: 'straight' }],
];
let fail = 0;
for (const [name, x, exp] of cases) {
  const t = Date.now(); const r = A.analyze(x, G.SR); const ms = Date.now() - t;
  if (!r.ok) { console.log(name, 'NOT OK', r); fail++; continue; }
  const okT = Math.abs(r.bpm - exp.bpm) / exp.bpm < 0.04, okM = r.meter === exp.meter, okF = r.feel === exp.feel;
  if (!(okT && okM && okF)) fail++;
  console.log(`${okT && okM && okF ? 'PASS' : 'FAIL'} ${name}: bpm ${r.bpm.toFixed(1)} meter ${r.meter} (s3 ${r.meterScores.s3.toFixed(2)} s4 ${r.meterScores.s4.toFixed(2)}) off ${r.downbeatOffset} feel ${r.feel} swing ${r.swing.toFixed(2)} ratio ${r.swingRatio.toFixed(2)} key ${r.key.tonic} ${r.key.mode} dens ${r.density.toFixed(2)} lvl ${r.levelDb.toFixed(1)} cent ${r.centroid.toFixed(0)} | ${r.description} [${ms}ms]`);
}
// warp test
const x = G.shuffle(90); const r = A.analyze(x, G.SR);
const P = 60 / 90; const bi = r.downbeatOffset + 4; const anchorsIn = [], anchorsOut = [];
for (let k = 0; k <= 8; k++) { anchorsIn.push(r.beats[bi + k] - 0.05); anchorsOut.push(k * P); }
const t = Date.now(); const y = A.warp(x, G.SR, anchorsIn, anchorsOut, 8 * P + 0.05);
let nan = 0, pk = 0; for (const v of y) { if (!isFinite(v)) nan++; pk = Math.max(pk, Math.abs(v)); }
console.log('warp len', y.length, 'expected', Math.round((8 * P + 0.05) * G.SR), 'nan', nan, 'peak', pk.toFixed(3), (Date.now() - t) + 'ms');
// retrack test
const r2 = A.retrack(r, { bpm: 45, meter: '4/4' }); console.log('retrack 45 ->', r2.bpm.toFixed(1), r2.beats.length);
const rw = A.analyze(G.waltz(100), G.SR); const r3 = A.retrack(rw, { bpm: rw.bpm * 2 / 3, meter: '6/8' }); console.log('waltz as 6/8 ->', r3.bpm.toFixed(1), r3.meter, r3.feel);
process.exit(fail ? 1 : 0);
