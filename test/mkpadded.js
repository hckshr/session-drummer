// Padded takes for the browser test (Chrome loops the fake-mic file, so silence at both ends matters)
const G = require('./gen.js'); const SR = G.SR;
const sil = s => new Float32Array(Math.round(s * SR)).map(() => (Math.random() * 2 - 1) * 0.002);
const cat = (...a) => { const n = a.reduce((p, x) => p + x.length, 0); const o = new Float32Array(n); let p = 0; for (const x of a) { o.set(x, p); p += x.length; } return o; };
G.wav(__dirname + '/take_shuffle.wav', cat(sil(3), G.shuffle(90, 14, 21), sil(1.6), G.shuffle(90, 8, 22), sil(8)));
G.wav(__dirname + '/take_waltz.wav', cat(sil(3), G.waltz(100, 16, 23), sil(8)));
G.wav(__dirname + '/take_long.wav', cat(sil(2), G.straight(110, 38, 24), G.straight(110, 38, 25), sil(8)));
console.log('ok');
