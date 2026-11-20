/* Session Drummer — audio analysis (pure JS, runs in browser or Node). Nothing leaves the device. */
(function (root) {
  'use strict';

  function makeFFT(n) {
    const levels = Math.round(Math.log2(n));
    const cos = new Float64Array(n / 2), sin = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos(2 * Math.PI * i / n); sin[i] = Math.sin(2 * Math.PI * i / n); }
    const rev = new Uint32Array(n);
    for (let i = 0; i < n; i++) { let r = 0, x = i; for (let j = 0; j < levels; j++) { r = (r << 1) | (x & 1); x >>= 1; } rev[i] = r; }
    return function (re, im) {
      for (let i = 0; i < n; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
      for (let size = 2; size <= n; size <<= 1) {
        const half = size >> 1, step = n / size;
        for (let i = 0; i < n; i += size) {
          for (let j = i, k = 0; j < i + half; j++, k += step) {
            const l = j + half;
            const tre = re[l] * cos[k] + im[l] * sin[k];
            const tim = -re[l] * sin[k] + im[l] * cos[k];
            re[l] = re[j] - tre; im[l] = im[j] - tim; re[j] += tre; im[j] += tim;
          }
        }
      }
    };
  }
  function hann(n) { const w = new Float64Array(n); for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / n); return w; }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function mean(a) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return a.length ? s / a.length : 0; }
  function std(a, m) { if (m === undefined) m = mean(a); let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - m) * (a[i] - m); return a.length ? Math.sqrt(s / a.length) : 0; }
  function median(a) { const b = Array.from(a).sort((x, y) => x - y); return b.length ? b[b.length >> 1] : 0; }
  function percentile(a, p) { const b = Array.from(a).sort((x, y) => x - y); return b.length ? b[clamp(Math.floor(p * (b.length - 1)), 0, b.length - 1)] : 0; }

  // Krumhansl–Kessler key profiles
  const KK_MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const KK_MIN = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  const NOTE = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  function pearson(a, b) { const ma = mean(a), mb = mean(b); let s = 0, sa = 0, sb = 0; for (let i = 0; i < a.length; i++) { const x = a[i] - ma, y = b[i] - mb; s += x * y; sa += x * x; sb += y * y; } return sa && sb ? s / Math.sqrt(sa * sb) : 0; }

  /* ---------- feature extraction ---------- */
  function extract(input, sr) {
    // peak/level of the raw signal (for energy)
    let x = input, fs = sr;
    if (sr > 32000) { // decimate by 2 with a small low-pass
      const n = Math.floor(input.length / 2); x = new Float32Array(n);
      for (let i = 1; i < n - 1; i++) x[i] = 0.25 * input[2 * i - 1] + 0.5 * input[2 * i] + 0.25 * input[2 * i + 1];
      fs = sr / 2;
    }
    // level normalisation so log-compression is consistent
    const absS = []; for (let i = 0; i < x.length; i += 37) absS.push(Math.abs(x[i]));
    const ref = Math.max(1e-5, percentile(absS, 0.995));
    const g = 0.5 / ref;
    const N = 1024, H = fs >= 20000 ? 256 : 128;
    const fr = fs / H;
    const nFrames = Math.max(0, Math.floor((x.length - N) / H) + 1);
    const fft = makeFFT(N), win = hann(N);
    const re = new Float64Array(N), im = new Float64Array(N);
    const nb = N / 2;
    let prev = new Float64Array(nb), cur = new Float64Array(nb);
    const flux = new Float32Array(nFrames), lowFlux = new Float32Array(nFrames), rmsDb = new Float32Array(nFrames), cent = new Float32Array(nFrames), fenergy = new Float32Array(nFrames);
    const bHz = fs / N;
    const kLo = Math.max(1, Math.round(30 / bHz)), kHi = Math.min(nb - 1, Math.round(8000 / bHz)), kLow = Math.round(300 / bHz);
    for (let t = 0; t < nFrames; t++) {
      const o = t * H; let e = 0;
      for (let i = 0; i < N; i++) { const v = x[o + i]; e += v * v; re[i] = v * g * win[i]; im[i] = 0; }
      rmsDb[t] = 10 * Math.log10(e / N + 1e-12);
      fft(re, im);
      let f = 0, lf = 0, cs = 0, ms = 0;
      for (let k = 1; k < nb; k++) {
        const m = Math.sqrt(re[k] * re[k] + im[k] * im[k]) / N * 4;
        const L = Math.log(1 + 1000 * m);
        cur[k] = L;
        if (k >= kLo && k <= kHi) { const d = L - prev[k]; if (d > 0) { f += d; if (k <= kLow) lf += d; } }
        cs += m * k * bHz; ms += m;
      }
      flux[t] = f; lowFlux[t] = lf; cent[t] = ms > 0 ? cs / ms : 0; fenergy[t] = ms;
      const tmp = prev; prev = cur; cur = tmp;
    }
    if (nFrames) { flux[0] = 0; lowFlux[0] = 0; }
    // chroma with a longer window for pitch resolution
    const NC = 4096, HC = 2048;
    const fftC = makeFFT(NC), winC = hann(NC);
    const reC = new Float64Array(NC), imC = new Float64Array(NC);
    const nC = Math.max(0, Math.floor((x.length - NC) / HC) + 1);
    const chroma = []; const chromaT = [];
    const bHzC = fs / NC;
    const binPc = new Int8Array(NC / 2).fill(-1), binW = new Float32Array(NC / 2);
    for (let k = 1; k < NC / 2; k++) { const f = k * bHzC; if (f < 70 || f > 2200) continue; const p = 69 + 12 * Math.log2(f / 440); const pr = Math.round(p); if (Math.abs(p - pr) > 0.35) continue; binPc[k] = ((pr % 12) + 12) % 12; binW[k] = f < 400 ? 1 : 400 / f + 0.3; }
    for (let t = 0; t < nC; t++) {
      const o = t * HC;
      for (let i = 0; i < NC; i++) { reC[i] = x[o + i] * g * winC[i]; imC[i] = 0; }
      fftC(reC, imC);
      const c = new Float32Array(12);
      // simple peak picking to reduce smear
      for (let k = 2; k < NC / 2 - 1; k++) {
        if (binPc[k] < 0) continue;
        const m = Math.hypot(reC[k], imC[k]);
        const ml = Math.hypot(reC[k - 1], imC[k - 1]), mr = Math.hypot(reC[k + 1], imC[k + 1]);
        if (m >= ml && m >= mr) c[binPc[k]] += Math.sqrt(m) * binW[k];
      }
      chroma.push(c); chromaT.push((o + NC / 2) / fs);
    }
    // onset envelope: flux minus local mean, half-wave rectified, normalised
    const env = new Float32Array(nFrames);
    const wAvg = Math.max(3, Math.round(0.25 * fr));
    let acc = 0; const q = [];
    // centred moving average
    const pre = new Float64Array(nFrames + 1); for (let i = 0; i < nFrames; i++) pre[i + 1] = pre[i] + flux[i];
    for (let i = 0; i < nFrames; i++) { const a = Math.max(0, i - wAvg), b = Math.min(nFrames, i + wAvg + 1); const m = (pre[b] - pre[a]) / (b - a); env[i] = Math.max(0, flux[i] - m); }
    const sd = std(env) || 1; for (let i = 0; i < nFrames; i++) env[i] /= sd;
    const lowEnv = new Float32Array(nFrames); { const sdl = std(lowFlux) || 1; for (let i = 0; i < nFrames; i++) lowEnv[i] = lowFlux[i] / sdl; }
    const t0 = N / 2 / fs; // frame-centre convention
    return { fs, fr, t0, env, lowEnv, rmsDb, cent, fenergy, chroma, chromaT, nFrames, duration: input.length / sr };
  }

  function pickOnsets(env, fr) {
    const out = []; const n = env.length; const w = 3; const lw = Math.round(fr * 1.0);
    const pre = new Float64Array(n + 1); for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + env[i];
    let last = -1e9; const minGap = Math.round(0.05 * fr);
    for (let i = w; i < n - w; i++) {
      let isMax = true; for (let j = i - w; j <= i + w; j++) if (env[j] > env[i]) { isMax = false; break; }
      if (!isMax) continue;
      const a = Math.max(0, i - lw), b = Math.min(n, i + lw); const m = (pre[b] - pre[a]) / (b - a);
      if (env[i] > m + 0.6 && env[i] > 0.8 && i - last >= minGap) { out.push({ f: i, s: env[i] }); last = i; }
    }
    return out;
  }

  function autocorr(env, maxLag) {
    const n = env.length; const ac = new Float64Array(maxLag + 1);
    for (let l = 0; l <= maxLag; l++) { let s = 0; for (let t = 0; t + l < n; t++) s += env[t] * env[t + l]; ac[l] = s / (n - l); }
    return ac;
  }

  function estimateTempo(env, fr) {
    const minLag = Math.floor(fr * 60 / 210), maxLag = Math.ceil(fr * 60 / 48);
    const ac = autocorr(env, Math.min(env.length - 2, maxLag * 2 + 2));
    const val = (l) => { const i = Math.floor(l), f = l - i; return i + 1 < ac.length ? ac[i] * (1 - f) + ac[i + 1] * f : 0; };
    let best = -1, bestL = minLag; const scores = [];
    for (let l = minLag; l <= maxLag; l++) {
      const bpm = 60 * fr / l;
      const prior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 100) / 0.85, 2));
      const s = (val(l) + 0.35 * val(2 * l)) * prior;
      scores.push({ l, bpm, s, raw: val(l) + 0.35 * val(2 * l) });
      if (s > best) { best = s; bestL = l; }
    }
    // parabolic refinement on raw ac
    let L = bestL;
    if (bestL > minLag && bestL < maxLag) { const a = val(bestL - 1), b = val(bestL), c = val(bestL + 1); const d = (a - 2 * b + c); if (d < 0) L = bestL + 0.5 * (a - c) / d; }
    // octave sanity
    const rawAt = (l) => val(l) + 0.35 * val(2 * l);
    let bpm = 60 * fr / L;
    if (bpm > 150 && 2 * L <= maxLag && rawAt(2 * L) > 0.75 * rawAt(L)) { L *= 2; bpm /= 2; }
    else if (bpm < 62 && L / 2 >= minLag && rawAt(L / 2) > 0.8 * rawAt(L)) { L /= 2; bpm *= 2; }
    return { period: L, bpm, ac };
  }

  // Ellis-style dynamic-programming beat tracker
  function trackBeats(env, P, tight) {
    tight = tight || 120;
    const n = env.length; const C = new Float64Array(n); const back = new Int32Array(n).fill(-1);
    const lo = Math.round(P / 2), hi = Math.round(P * 2);
    for (let t = 0; t < n; t++) {
      let best = -Infinity, bi = -1;
      for (let tau = t - hi; tau <= t - lo; tau++) {
        if (tau < 0) continue;
        const d = Math.log((t - tau) / P); const v = C[tau] - tight * d * d;
        if (v > best) { best = v; bi = tau; }
      }
      if (bi >= 0 && best > 0) { C[t] = env[t] + best; back[t] = bi; } else { C[t] = env[t]; back[t] = -1; }
    }
    // pick end point in final period
    let end = n - 1, bv = -Infinity;
    for (let t = Math.max(0, n - Math.round(P)); t < n; t++) if (C[t] > bv) { bv = C[t]; end = t; }
    const beats = []; let t = end; while (t >= 0) { beats.push(t); t = back[t]; }
    beats.reverse();
    // extend backwards to cover the start if the chain began late
    while (beats.length && beats[0] - P > P * 0.25) {
      const guess = beats[0] - P; let bt = Math.round(guess), bvv = -1;
      for (let j = Math.round(guess - P * 0.1); j <= Math.round(guess + P * 0.1); j++) if (j >= 0 && j < n && env[j] > bvv) { bvv = env[j]; bt = j; }
      if (bt < 0) break; beats.unshift(bvv > 0.3 ? bt : Math.round(guess));
    }
    return beats;
  }

  // Beat trackers happily lock onto a loud off-beat. Swing is always long-short, and bass/accents
  // tend to sit on the beat, so use those to nudge the phase back onto the beat.
  function fixPhase(feat, beatF) {
    if (beatF.length < 6) return beatF;
    const P = (beatF[beatF.length - 1] - beatF[0]) / (beatF.length - 1);
    const shift = (frac) => beatF.map(b => b + frac * P).filter(b => b < feat.env.length - 1);
    const sw = analyseSwing(feat.env, beatF);
    const pr = sw.prof, BINS = pr.length;
    const at = (c, w) => { let m = 0; for (let k = 0; k < BINS; k++) { const p = (k + 0.5) / BINS; if (Math.abs(p - c) <= w) m = Math.max(m, pr[k]); } return m; };
    const base = median(pr);
    const t1 = at(0.333, 0.04) - base, t2 = at(0.667, 0.04) - base, h = at(0.5, 0.04) - base;
    if (t1 > 0.5 && t1 > 1.6 * Math.max(t2, h, 0.01)) return shift(1 / 3);
    if (h > 0.5 && h > 1.6 * Math.max(t1, t2, 0.01)) {
      // straight: compare accent+bass on the beat vs on the "and"
      const acc = (arr) => { let s = 0; for (const b of arr) s += envMax(feat.env, b, 2) + 1.5 * envMax(feat.lowEnv, b, 2); return s / arr.length; };
      const alt = shift(0.5);
      if (acc(alt) > 1.25 * acc(beatF)) return alt;
    }
    return beatF;
  }

  function regressPeriod(beatsSec) {
    const n = beatsSec.length; if (n < 3) return null;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let i = 0; i < n; i++) { sx += i; sy += beatsSec[i]; sxx += i * i; sxy += i * beatsSec[i]; }
    return (n * sxy - sx * sy) / (n * sxx - sx * sx);
  }

  function envAt(env, f) { const i = Math.floor(f), fr = f - i; if (i < 0 || i + 1 >= env.length) return 0; return env[i] * (1 - fr) + env[i + 1] * fr; }
  function envMax(env, f, w) { let m = 0; for (let j = Math.floor(f - w); j <= Math.ceil(f + w); j++) if (j >= 0 && j < env.length && env[j] > m) m = env[j]; return m; }

  function analyseSwing(env, beatF) {
    const BINS = 48; const prof = new Float64Array(BINS); let used = 0;
    for (let i = 0; i + 1 < beatF.length; i++) {
      const a = beatF[i], b = beatF[i + 1]; const len = b - a; if (len < 4) continue;
      for (let k = 0; k < BINS; k++) { const f = a + len * (k + 0.5) / BINS; prof[k] += envAt(env, f); }
      used++;
    }
    if (!used) return { swing: 0, ratio: 0.5, ternary: 0, conf: 0, prof };
    for (let k = 0; k < BINS; k++) prof[k] /= used;
    const around = (c, w) => { let m = 0; for (let k = 0; k < BINS; k++) { const p = (k + 0.5) / BINS; if (Math.abs(p - c) <= w) m = Math.max(m, prof[k]); } return m; };
    const eHalf = around(0.5, 0.035), eTrip2 = around(0.667, 0.035), eTrip1 = around(0.333, 0.035), e16a = around(0.25, 0.03), e16b = around(0.75, 0.03);
    const base = median(prof);
    const h = Math.max(0, eHalf - base), t2 = Math.max(0, eTrip2 - base), t1 = Math.max(0, eTrip1 - base), s16 = Math.max(0, Math.max(e16a, e16b) - base);
    const swing = (t2 - h) / (t2 + h + 1e-6); // -1 straight .. +1 swung
    // ratio: centroid of the off-beat bump between 0.45 and 0.78
    let cs = 0, ws = 0; for (let k = 0; k < BINS; k++) { const p = (k + 0.5) / BINS; if (p > 0.45 && p < 0.78) { const w = Math.max(0, prof[k] - base); cs += w * w * p; ws += w * w; } }
    const ratio = ws > 0 ? cs / ws : 0.5;
    const ternary = (t1 + t2) / (t1 + t2 + h + s16 + 1e-6);
    const offStrength = Math.max(h, t2) / (Math.max(...prof) + 1e-6);
    return { swing, ratio, ternary, conf: clamp(offStrength * Math.abs(swing) * 2, 0, 1), offStrength, prof: Array.from(prof) };
  }

  function chromaBetween(feat, ta, tb) {
    const c = new Float64Array(12); let n = 0;
    for (let i = 0; i < feat.chromaT.length; i++) { const t = feat.chromaT[i]; if (t >= ta && t < tb) { for (let k = 0; k < 12; k++) c[k] += feat.chroma[i][k]; n++; } }
    if (!n) { // nearest frame
      let bi = 0, bd = 1e9; for (let i = 0; i < feat.chromaT.length; i++) { const d = Math.abs(feat.chromaT[i] - (ta + tb) / 2); if (d < bd) { bd = d; bi = i; } }
      if (feat.chroma[bi]) for (let k = 0; k < 12; k++) c[k] = feat.chroma[bi][k];
    }
    return c;
  }
  function cosSim(a, b) { let s = 0, na = 0, nb = 0; for (let k = 0; k < 12; k++) { s += a[k] * b[k]; na += a[k] * a[k]; nb += b[k] * b[k]; } return na && nb ? s / Math.sqrt(na * nb) : 1; }
  function zscore(a) { const m = mean(a), s = std(a, m) || 1; return a.map(v => (v - m) / s); }
  function lagCorr(f, lag) { if (f.length - lag < 4) return 0; return pearson(f.slice(0, f.length - lag), f.slice(lag)); }

  function analyseMeter(feat, beatsSec, beatF, forceM) {
    const nb = beatF.length;
    if (nb < 8) return { meter: forceM || 4, offset: 0, conf: 0, scores: {} };
    const acc = [], low = [], nov = [];
    for (let i = 0; i < nb; i++) {
      acc.push(envMax(feat.env, beatF[i], 2));
      low.push(envMax(feat.lowEnv, beatF[i], 2));
      const P = i + 1 < nb ? beatsSec[i + 1] - beatsSec[i] : beatsSec[i] - beatsSec[i - 1];
      const prevC = chromaBetween(feat, beatsSec[i] - P, beatsSec[i]);
      const nextC = chromaBetween(feat, beatsSec[i], beatsSec[i] + P);
      nov.push(1 - cosSim(prevC, nextC));
    }
    const za = zscore(acc), zl = zscore(low), zn = zscore(nov);
    const f = za.map((v, i) => 0.8 * v + 1.0 * zl[i] + 1.2 * zn[i]);
    const contrast = (M) => {
      let best = -Infinity, bo = 0;
      for (let o = 0; o < M; o++) {
        const on = [], off = [];
        for (let i = 0; i < nb; i++) ((i % M) === o ? on : off).push(f[i]);
        const c = mean(on) - mean(off);
        if (c > best) { best = c; bo = o; }
      }
      return { c: best / (std(f) || 1), o: bo };
    };
    const c2 = contrast(2), c3 = contrast(3), c4 = contrast(4);
    const s3 = c3.c + lagCorr(f, 3) + 0.5 * lagCorr(f, 6) - 0.4 * Math.max(0, lagCorr(f, 2));
    const s4 = Math.max(c4.c, c2.c * 0.9) + lagCorr(f, 4) + 0.3 * Math.max(0, lagCorr(f, 2)) + 0.3 * lagCorr(f, 8) - 0.3 * Math.max(0, lagCorr(f, 3));
    let meter, offset;
    if (forceM) { meter = forceM; offset = (forceM === 3 ? c3 : forceM === 2 ? c2 : c4).o; }
    else if (s3 > s4 + 0.15) { meter = 3; offset = c3.o; } else { meter = 4; offset = c4.o; }
    return { meter, offset, conf: clamp(Math.abs(s3 - s4) / 1.2, 0, 1), scores: { s3, s4 } };
  }

  function analyseKey(feat) {
    const tot = new Float64Array(12);
    for (let i = 0; i < feat.chroma.length; i++) for (let k = 0; k < 12; k++) tot[k] += feat.chroma[i][k];
    let bestMaj = -2, bestMin = -2, kMaj = 0, kMin = 0;
    for (let r = 0; r < 12; r++) {
      const maj = [], min = [];
      for (let k = 0; k < 12; k++) { maj.push(KK_MAJ[(k - r + 12) % 12]); min.push(KK_MIN[(k - r + 12) % 12]); }
      const cm = pearson(tot, maj), cn = pearson(tot, min);
      if (cm > bestMaj) { bestMaj = cm; kMaj = r; }
      if (cn > bestMin) { bestMin = cn; kMin = r; }
    }
    const minor = bestMin > bestMaj;
    return { tonic: NOTE[minor ? kMin : kMaj], mode: minor ? 'minor' : 'major', modeLean: bestMin - bestMaj, conf: clamp(Math.max(bestMaj, bestMin), 0, 1), chroma: Array.from(tot) };
  }

  function buildResult(feat, P, opts) {
    opts = opts || {};
    const fr = feat.fr;
    let beatF = trackBeats(feat.env, P);
    beatF = fixPhase(feat, beatF);
    const beatsSec = beatF.map(f => f / fr + feat.t0);
    const reg = regressPeriod(beatsSec);
    const period = reg && reg > 0 ? reg : P / fr;
    const bpm = 60 / period;
    const forceM = opts.meter === '3/4' ? 3 : opts.meter === '6/8' ? 2 : opts.meter === '4/4' ? 4 : 0;
    const met = analyseMeter(feat, beatsSec, beatF, forceM);
    const sw = analyseSwing(feat.env, beatF);
    return { beatsSec, beatF, period, bpm, met, sw };
  }

  function analyze(samples, sr) {
    const feat = extract(samples, sr);
    const fr = feat.fr;
    const active = []; let maxDb = -200;
    for (let i = 0; i < feat.nFrames; i++) maxDb = Math.max(maxDb, feat.rmsDb[i]);
    for (let i = 0; i < feat.nFrames; i++) if (feat.rmsDb[i] > maxDb - 30) active.push(i);
    const onsets = pickOnsets(feat.env, fr);
    if (maxDb < -62 || onsets.length < 6 || feat.duration < 4) {
      return { ok: false, reason: maxDb < -62 ? 'quiet' : 'few-onsets', maxDb, onsets: onsets.length };
    }
    const tempo = estimateTempo(feat.env, fr);
    const r = buildResult(feat, tempo.period);
    const firstOnset = onsets.length ? onsets[0].f / fr + feat.t0 : 0;
    const lastOnset = onsets.length ? onsets[onsets.length - 1].f / fr + feat.t0 : feat.duration;
    // level & timbre
    const actDb = active.map(i => feat.rmsDb[i]);
    const levelDb = median(actDb);
    const dynRange = percentile(actDb, 0.95) - percentile(actDb, 0.1);
    let cs = 0, cw = 0; for (const i of active) { const w = feat.fenergy[i]; cs += feat.cent[i] * w; cw += w; }
    const centroid = cw ? cs / cw : 1500;
    const key = analyseKey(feat);
    const playDur = Math.max(1, lastOnset - firstOnset);
    const density = onsets.length / (playDur / r.period); // onsets per beat
    const meanStrength = mean(onsets.map(o => o.s));
    const res = {
      ok: true, duration: feat.duration, sr, firstOnset, lastOnset,
      onsets: onsets.map(o => o.f / fr + feat.t0),
      bpm: r.bpm, period: r.period, beats: r.beatsSec,
      meter: r.met.meter === 3 ? '3/4' : '4/4', meterConf: r.met.conf, downbeatOffset: r.met.offset, meterScores: r.met.scores,
      swing: r.sw.swing, swingRatio: r.sw.ratio, ternary: r.sw.ternary, swingConf: r.sw.conf, offStrength: r.sw.offStrength,
      feel: r.sw.swing > 0.2 && r.sw.offStrength > 0.12 ? 'swing' : 'straight',
      density, levelDb, dynRange, centroid, key, meanStrength,
      tempoAlt: { half: r.bpm / 2, double: r.bpm * 2 },
      _feat: feat
    };
    // possible 6/8: fast 3-grouping with straight subdivision
    if (res.meter === '3/4' && res.bpm >= 150) res.maybe68 = true;
    Object.assign(res, describe(res));
    return res;
  }

  // Re-run beat tracking with user-forced tempo / meter
  function retrack(res, opts) {
    const feat = res._feat; const fr = feat.fr;
    const bpm = opts.bpm || res.bpm;
    const P = fr * 60 / bpm;
    const r = buildResult(feat, P, { meter: opts.meter });
    const out = Object.assign({}, res, {
      bpm: opts.bpmExact ? bpm : r.bpm, period: opts.bpmExact ? 60 / bpm : r.period, beats: r.beatsSec,
      meter: opts.meter || (r.met.meter === 3 ? '3/4' : '4/4'), downbeatOffset: r.met.offset, meterConf: r.met.conf,
      swing: r.sw.swing, swingRatio: r.sw.ratio, ternary: r.sw.ternary, swingConf: r.sw.conf, offStrength: r.sw.offStrength,
    });
    out.feel = opts.feel || (out.meter === '6/8' ? 'swing' : (r.sw.swing > 0.2 && r.sw.offStrength > 0.12 ? 'swing' : 'straight'));
    out.density = res.density * (out.period / res.period);
    Object.assign(out, describe(out));
    return out;
  }

  function features(res) {
    const busy = clamp((res.density - 0.6) / 2.6, 0, 1);
    const energy = clamp(0.4 * clamp((res.levelDb + 45) / 30, 0, 1) + 0.4 * busy + 0.2 * clamp((res.bpm - 60) / 100, 0, 1), 0, 1);
    const bright = clamp((res.centroid - 700) / 1800, 0, 1);
    const minorLean = clamp(0.5 + res.key.modeLean * 3, 0, 1);
    const dark = clamp(0.6 * minorLean + 0.4 * (1 - bright), 0, 1);
    return { energy, busy, bright, dark };
  }

  function describe(res) {
    const f = features(res);
    const bpm = res.bpm;
    const tempoWord = bpm < 68 ? 'slow' : bpm < 90 ? 'relaxed' : bpm < 114 ? 'mid-tempo' : bpm < 140 ? 'upbeat' : 'fast';
    const mood = res.key.mode === 'minor' ? (f.bright > 0.55 ? 'bittersweet' : 'dark and moody') : (f.bright > 0.5 ? 'bright' : 'warm');
    const energyWord = f.energy < 0.3 ? 'gentle' : f.energy < 0.52 ? 'easygoing' : f.energy < 0.72 ? 'steady' : 'driving';
    const busyWord = f.busy < 0.2 ? 'sparse' : f.busy > 0.6 ? 'busy' : '';
    const feelWord = res.meter === '6/8' ? 'rolling triplet feel' : res.feel === 'swing' ? 'swung, shuffling feel' : 'straight feel';
    const meterWord = res.meter === '3/4' ? '3/4' : res.meter === '6/8' ? '6/8' : '4/4';
    const head = `${cap(tempoWord)}, ${mood} ${meterWord}`;
    const tail = [busyWord, energyWord].filter(Boolean).join(' and ');
    const description = `${head} — ${tail}, with a ${feelWord}.`;
    let wants;
    if (res.meter === '3/4') wants = mood.startsWith('dark') ? 'a moody waltz' : (f.energy > 0.6 ? 'a big rolling 3/4' : 'a gentle waltz');
    else if (res.meter === '6/8') wants = 'a lilting 6/8';
    else if (res.feel === 'swing') wants = bpm < 80 ? 'a slow 12/8 blues feel' : f.energy > 0.6 ? 'a driving shuffle' : 'a bluesy shuffle';
    else wants = bpm < 80 ? (mood.startsWith('dark') ? 'a slow, heavy backbeat' : 'a slow ballad groove') : f.energy > 0.65 ? 'a driving straight-eighth beat' : 'a laid-back backbeat';
    return { features: f, words: { tempoWord, mood, energyWord, busyWord, feelWord }, description, wants };
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  /* ---------- time warp (WSOLA), beat-anchored ---------- */
  // anchorsIn/out: seconds. Output length outSec. Input positions mapped piecewise-linearly.
  function warp(x, sr, anchorsIn, anchorsOut, outSec) {
    const outLen = Math.round(outSec * sr);
    const A = anchorsIn.map(v => v * sr), B = anchorsOut.map(v => v * sr);
    const map = (o) => {
      if (o <= B[0]) return A[0] + (o - B[0]);
      for (let i = 0; i + 1 < B.length; i++) if (o <= B[i + 1]) { const u = (o - B[i]) / (B[i + 1] - B[i]); return A[i] + u * (A[i + 1] - A[i]); }
      const n = B.length - 1; const slope = n > 0 ? (A[n] - A[n - 1]) / (B[n] - B[n - 1]) : 1; return A[n] + (o - B[n]) * slope;
    };
    let W = 1; while (W < 0.045 * sr) W <<= 1; const Hs = W >> 1; const tol = Math.round(0.012 * sr);
    const win = new Float32Array(W); for (let i = 0; i < W; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / W);
    const out = new Float32Array(outLen + W);
    const X = (i) => (i >= 0 && i < x.length ? x[i] : 0);
    let prevIn = Math.round(map(0)) - (Hs >> 1);
    for (let o = 0, k = 0; o < outLen; o += Hs, k++) {
      const target = Math.round(map(o + (Hs >> 1))) - (Hs >> 1);
      let best = target;
      if (k > 0) {
        const nat = prevIn + Hs;
        let bv = -Infinity;
        const corr = (cand, step) => { let s = 0; for (let i = 0; i < W; i += step) s += X(nat + i) * X(cand + i); return s; };
        let bc = target;
        for (let d = -tol; d <= tol; d += 8) { const v = corr(target + d, 8); if (v > bv) { bv = v; bc = target + d; } }
        bv = -Infinity; best = bc;
        for (let d = -8; d <= 8; d++) { const v = corr(bc + d, 2); if (v > bv) { bv = v; best = bc + d; } }
      }
      for (let i = 0; i < W; i++) out[o + i] += X(best + i) * win[i];
      prevIn = best;
    }
    return out.subarray(0, outLen);
  }

  /* ---------- pick the best section ----------
     res: (re)tracked result; need: beats in the section; gb: beats per bar.
     Looks at every downbeat where the player is actually playing and scores how steady the beats are. */
  function bestSection(res, need, gb) {
    const beats = res.beats, P = res.period, on = res.onsets || [];
    const nb = beats.length; if (!nb) return null;
    const act = new Array(nb).fill(false); let j = 0;
    for (let i = 0; i < nb; i++) { const a = beats[i] - 0.1 * P, b = beats[i] + 0.9 * P; while (j < on.length && on[j] < a) j++; let k = j; while (k < on.length && on[k] < b) { act[i] = true; break; } }
    const off = ((res.downbeatOffset % gb) + gb) % gb;
    let best = null, firstCand = -1;
    for (let i = off; i + need < nb; i += gb) {
      if (beats[i] < (res.firstOnset || 0) - 0.08) continue;
      if (firstCand < 0) firstCand = i;
      let a = 0; for (let k = i; k < i + need; k++) if (act[k]) a++;
      const actFrac = a / need;
      // local straight-line fit of beat times: residual = timing wobble, slope = local tempo
      let sx = 0, sy = 0, sxx = 0, sxy = 0; const m = need + 1;
      for (let k = 0; k < m; k++) { const y = beats[i + k]; sx += k; sy += y; sxx += k * k; sxy += k * y; }
      const slope = (m * sxy - sx * sy) / (m * sxx - sx * sx), icpt = (sy - slope * sx) / m;
      let r2 = 0; for (let k = 0; k < m; k++) { const d = beats[i + k] - (icpt + slope * k); r2 += d * d; }
      const wobble = Math.sqrt(r2 / m) / P, drift = Math.abs(slope - P) / P;
      const score = 2 * actFrac - 12 * wobble - 6 * drift - (i === firstCand ? 0.15 : 0) - (actFrac < 0.75 ? 2 : 0);
      if (!best || score > best.score) best = { start: i, score, actFrac, wobbleMs: wobble * P * 1000, drift };
    }
    return best;
  }

  const api = { analyze, retrack, warp, bestSection, describe, features, _internals: { extract, estimateTempo, trackBeats, analyseSwing, analyseMeter, pickOnsets } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SDAnalysis = api;
})(typeof self !== 'undefined' ? self : this);
