/* Session Drummer — synthesized drum kit, event generation, real-time scheduler and offline preview render. */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;
  function rng(seed) { let s = seed >>> 0 || 7; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  // RBJ biquad, in place
  function biquad(x, type, f, Q, sr, gainDb) {
    const w = TAU * Math.min(f, sr * 0.45) / sr, cs = Math.cos(w), sn = Math.sin(w), al = sn / (2 * Q);
    const A = Math.pow(10, (gainDb || 0) / 40);
    let b0, b1, b2, a0, a1, a2;
    if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
    else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
    else if (type === 'bp') { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
    else { b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A; } // peak
    b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) { const xi = x[i]; const y = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = xi; y2 = y1; y1 = y; x[i] = y; }
    return x;
  }
  function noise(n, r) { const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = r() * 2 - 1; return a; }
  function mixInto(out, src, envFn, sr) { for (let i = 0; i < out.length && i < src.length; i++) out[i] += src[i] * envFn(i / sr); }
  function sat(x, d) { const k = Math.tanh(d); for (let i = 0; i < x.length; i++) x[i] = Math.tanh(d * x[i]) / k; return x; }
  const ex = (t, tau) => Math.exp(-t / tau);
  const att = (t, a) => (t < a ? t / a : 1);

  function metal(n, sr, freqs, r) {
    const out = new Float32Array(n); const ph = freqs.map(() => r() * TAU); const inc = freqs.map(f => TAU * f / sr);
    for (let i = 0; i < n; i++) { let s = 0; for (let k = 0; k < freqs.length; k++) { ph[k] += inc[k]; s += Math.sin(ph[k]) > 0 ? 1 : -1; } out[i] = s / freqs.length; }
    return out;
  }

  const GEN = {
    K(sr, v, r) {
      const n = Math.round(0.6 * sr), out = new Float32Array(n);
      const f0 = 140 + 30 * v + r() * 6, f1 = 46 + r() * 2; let ph = 0;
      for (let i = 0; i < n; i++) { const t = i / sr; const f = f1 + (f0 - f1) * ex(t, 0.028); ph += TAU * f / sr; out[i] = Math.sin(ph) * ex(t, 0.17 + 0.13 * v) * att(t, 0.0015); }
      const c = biquad(noise(Math.round(0.02 * sr), r), 'bp', 3200, 0.9, sr);
      mixInto(out, c, t => (0.1 + 0.35 * v) * ex(t, 0.0025), sr);
      const knock = new Float32Array(Math.round(0.05 * sr)); for (let i = 0; i < knock.length; i++) knock[i] = Math.sin(TAU * 620 * i / sr);
      mixInto(out, knock, t => 0.12 * v * ex(t, 0.006), sr);
      return sat(out, 1.4 + 0.5 * v);
    },
    S(sr, v, r) {
      const n = Math.round(0.42 * sr), out = new Float32Array(n);
      let p1 = 0, p2 = 0; const d = 1 + (r() - 0.5) * 0.03;
      for (let i = 0; i < n; i++) { const t = i / sr; p1 += TAU * 186 * d * (1 + 0.25 * ex(t, 0.01)) / sr; p2 += TAU * 338 * d / sr; out[i] = (0.75 * Math.sin(p1) * ex(t, 0.05) + 0.32 * Math.sin(p2) * ex(t, 0.03)) * att(t, 0.001) * (0.6 + 0.4 * v); }
      const nz = noise(n, r); biquad(nz, 'hp', 1300, 0.7, sr); biquad(nz, 'lp', 9500, 0.7, sr); biquad(nz, 'pk', 5200, 1, sr, 4);
      mixInto(out, nz, t => (0.45 + 0.45 * v) * ex(t, 0.075 + 0.11 * v) * att(t, 0.0012), sr);
      const sn = biquad(noise(Math.round(0.03 * sr), r), 'hp', 4500, 0.7, sr);
      mixInto(out, sn, t => 0.5 * v * ex(t, 0.004), sr);
      return sat(out, 1.3);
    },
    R(sr, v, r) {
      const n = Math.round(0.16 * sr), out = new Float32Array(n);
      for (let i = 0; i < n; i++) { const t = i / sr; out[i] = 0.55 * Math.sin(TAU * 470 * t) * ex(t, 0.026) + 0.28 * Math.sin(TAU * 1240 * t) * ex(t, 0.011); }
      const c = biquad(noise(n, r), 'bp', 2300, 3, sr); mixInto(out, c, t => (1.4 + v) * ex(t, 0.009), sr);
      const k = biquad(noise(n, r), 'hp', 3500, 0.7, sr); mixInto(out, k, t => 0.4 * v * ex(t, 0.003), sr);
      return sat(out, 1.5);
    },
    hatBase(sr, v, r, dur, decay) {
      const n = Math.round(dur * sr); const f = 1 + (r() - 0.5) * 0.02;
      const m = metal(n, sr, [205.3, 304.4, 369.6, 522.7, 540, 800].map(x => x * 1.9 * f), r);
      const nz = noise(n, r); const out = new Float32Array(n);
      for (let i = 0; i < n; i++) out[i] = 0.55 * m[i] + 0.5 * nz[i];
      biquad(out, 'hp', 7200, 0.7, sr); biquad(out, 'hp', 6500, 0.7, sr); biquad(out, 'pk', 10500, 1.2, sr, 4); biquad(out, 'lp', 15000, 0.7, sr);
      for (let i = 0; i < n; i++) { const t = i / sr; out[i] *= ex(t, decay) * att(t, 0.0008); }
      return out;
    },
    H(sr, v, r) { return GEN.hatBase(sr, v, r, 0.18, 0.016 + 0.014 * v); },
    O(sr, v, r) { return GEN.hatBase(sr, v, r, 0.9, 0.22 + 0.12 * v); },
    P(sr, v, r) { const o = GEN.hatBase(sr, v, r, 0.12, 0.012); const c = biquad(noise(o.length, r), 'bp', 1700, 1.2, sr); mixInto(o, c, t => 0.35 * ex(t, 0.012) * att(t, 0.002), sr); return o; },
    Y(sr, v, r) {
      const n = Math.round(2.2 * sr); const m = metal(n, sr, [395, 531, 683, 819, 1005, 1201].map(x => x * (1 + (r() - 0.5) * 0.01)), r);
      const out = new Float32Array(n); const nz = noise(n, r);
      for (let i = 0; i < n; i++) { const t = i / sr; out[i] = (0.6 * m[i] + 0.25 * nz[i]) * (0.35 * ex(t, 0.9) + 0.4 * ex(t, 0.08)); }
      biquad(out, 'hp', 2800, 0.7, sr); biquad(out, 'pk', 6200, 0.8, sr, 5); biquad(out, 'lp', 13000, 0.7, sr);
      for (let i = 0; i < n; i++) { const t = i / sr; out[i] += 0.12 * (Math.sin(TAU * 3150 * t) + 0.7 * Math.sin(TAU * 4720 * t)) * ex(t, 0.25); }
      const st = biquad(noise(Math.round(0.02 * sr), r), 'hp', 6000, 0.7, sr); mixInto(out, st, t => 0.5 * v * ex(t, 0.004), sr);
      return out;
    },
    B(sr, v, r) {
      const n = Math.round(1.6 * sr), out = new Float32Array(n); const f0 = 760;
      const P = [[1, 1, 1.0], [1.52, 0.55, 0.7], [2.33, 0.45, 0.5], [2.76, 0.3, 0.4], [3.67, 0.2, 0.3]];
      for (let i = 0; i < n; i++) { const t = i / sr; let s = 0; for (const [m, a, d] of P) s += a * Math.sin(TAU * f0 * m * t) * ex(t, d); out[i] = s * 0.4 * att(t, 0.0008); }
      const y = GEN.Y(sr, v, r); for (let i = 0; i < n; i++) out[i] += 0.35 * y[i];
      return out;
    },
    C(sr, v, r) {
      const n = Math.round(2.8 * sr); const m = metal(n, sr, [341, 479, 597, 733, 871, 1129].map(x => x * 1.3), r); const nz = noise(n, r); const out = new Float32Array(n);
      for (let i = 0; i < n; i++) { const t = i / sr; out[i] = (0.45 * m[i] + 0.6 * nz[i]) * ex(t, 0.75 + 0.4 * v) * att(t, 0.002); }
      biquad(out, 'hp', 3200, 0.7, sr); biquad(out, 'pk', 7500, 0.6, sr, 3); biquad(out, 'lp', 12500, 0.7, sr);
      return out;
    },
    tom(sr, v, r, f) {
      const n = Math.round(0.8 * sr), out = new Float32Array(n); let ph = 0; const d = 1 + (r() - 0.5) * 0.02;
      for (let i = 0; i < n; i++) { const t = i / sr; ph += TAU * f * d * (1 + 0.4 * ex(t, 0.035)) / sr; out[i] = (Math.sin(ph) + 0.15 * Math.sin(2.7 * ph)) * ex(t, f < 120 ? 0.36 : 0.26) * att(t, 0.001); }
      const c = biquad(noise(Math.round(0.05 * sr), r), 'bp', f * 5, 1.5, sr); mixInto(out, c, t => (0.3 + 0.4 * v) * ex(t, 0.012), sr);
      return sat(out, 1.4);
    },
    T1(sr, v, r) { return GEN.tom(sr, v, r, 168); },
    T2(sr, v, r) { return GEN.tom(sr, v, r, 96); },
    BR(sr, v, r) {
      const n = Math.round(0.45 * sr), out = noise(n, r);
      biquad(out, 'bp', 3000, 0.45, sr); biquad(out, 'hp', 450, 0.7, sr);
      for (let i = 0; i < n; i++) { const t = i / sr; out[i] *= (ex(t, 0.045 + 0.07 * v) + 0.12 * ex(t, 0.25)) * att(t, 0.002); out[i] += 0.12 * Math.sin(TAU * 185 * t) * ex(t, 0.03) * v; }
      return out;
    },
    SW(sr, v, r) {
      const n = Math.round(1.0 * sr), out = noise(n, r); const blk = 256; const tmp = new Float32Array(n);
      // time-varying band-pass, processed block by block (crude but smooth enough)
      let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
      for (let s = 0; s < n; s += blk) {
        const t = s / sr; const fc = 1700 + 1500 * Math.sin(Math.PI * t) + 300 * Math.sin(TAU * 2 * t);
        const w = TAU * fc / sr, cs = Math.cos(w), sn = Math.sin(w), al = sn / (2 * 0.6);
        const b0 = al / (1 + al), b2 = -al / (1 + al), a1 = -2 * cs / (1 + al), a2 = (1 - al) / (1 + al);
        for (let i = s; i < Math.min(n, s + blk); i++) { const xi = out[i]; const y = b0 * xi + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = xi; y2 = y1; y1 = y; tmp[i] = y; }
      }
      for (let i = 0; i < n; i++) { const t = i / n; tmp[i] *= Math.pow(Math.sin(Math.PI * t), 1.3) * (0.85 + 0.15 * Math.sin(TAU * 3 * t)); }
      return tmp;
    },
    SH(sr, v, r) {
      const n = Math.round(0.14 * sr), out = noise(n, r);
      biquad(out, 'hp', 4800, 0.7, sr); biquad(out, 'bp', 8000, 0.6, sr);
      for (let i = 0; i < n; i++) { const t = i / sr; out[i] *= t < 0.009 ? Math.pow(t / 0.009, 1.5) : ex(t - 0.009, 0.026 + 0.012 * v); }
      return out;
    }
  };
  // mix: gain, pan, reverb send
  const MIX = { K: [1.0, 0, 0.05], S: [0.8, 0, 0.2], R: [0.6, 0, 0.16], H: [0.3, 0.28, 0.07], P: [0.24, 0.28, 0.06], O: [0.27, 0.28, 0.12], Y: [0.3, -0.3, 0.12], B: [0.3, -0.3, 0.12], C: [0.32, -0.38, 0.16], T1: [0.68, 0.22, 0.18], T2: [0.78, -0.22, 0.18], BR: [0.5, 0.05, 0.2], SW: [0.3, -0.05, 0.16], SH: [0.24, 0.38, 0.08] };

  function renderKit(sr) {
    const kit = {}; let seed = 11;
    for (const v in MIX) {
      kit[v] = { soft: [], hard: [] };
      for (const [layer, hv] of [['soft', 0.35], ['hard', 1]]) for (let rr = 0; rr < 2; rr++) {
        const d = GEN[v](sr, hv, rng(seed++ * 7919));
        let pk = 0; for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i]));
        const g = (pk > 0 ? 1 / pk : 1) * (layer === 'soft' ? 0.8 : 1);
        for (let i = 0; i < d.length; i++) d[i] *= g;
        kit[v][layer].push(d);
      }
    }
    return { sr, kit };
  }
  function makeIR(sr) {
    const n = Math.round(1.3 * sr); const L = new Float32Array(n), R = new Float32Array(n); const r = rng(99);
    let lpL = 0, lpR = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr; const e = Math.exp(-t / 0.28) * (t < 0.008 ? 0 : 1);
      const k = 0.15 + 0.8 * Math.exp(-t / 0.35); // gets darker over time
      lpL += k * ((r() * 2 - 1) - lpL); lpR += k * ((r() * 2 - 1) - lpR);
      L[i] = lpL * e; R[i] = lpR * e;
    }
    [[0.011, 0.5, 0.3], [0.017, 0.3, 0.45], [0.023, 0.35, 0.2], [0.031, 0.2, 0.3]].forEach(([t, a, b]) => { const i = Math.round(t * sr); L[i] += a; R[i + 3] += b; });
    return [L, R];
  }

  /* ---------- events ---------- */
  const FILLS = {
    toms: { 4: [['T1', 0, 0.85], ['T1', 1, 0.6], ['T2', 2, 0.9], ['T2', 3, 0.7]], 3: [['T1', 0, 0.85], ['T1', 1, 0.6], ['T2', 2, 0.9]] },
    snare: { 4: [['S', 0, 0.55], ['S', 1, 0.7], ['S', 2, 0.8], ['S', 3, 0.95]], 3: [['S', 0, 0.6], ['S', 1, 0.75], ['S', 2, 0.95]] },
    soft: { 4: [['S', 0, 0.3], ['S', 1, 0.38], ['S', 2, 0.45], ['S', 3, 0.55]], 3: [['S', 0, 0.35], ['S', 1, 0.42], ['S', 2, 0.52]] },
    brush: { 4: [['BR', 0, 0.6], ['BR', 2, 0.7], ['BR', 3, 0.8]], 3: [['BR', 0, 0.6], ['BR', 1, 0.7], ['BR', 2, 0.8]] }
  };
  // returns [{v, step, vel, dur}] for one bar; step in pattern steps from bar start
  function barEvents(p, barIdx, o) {
    o = o || {};
    const spb = p.stepsPerBar, pb = barIdx % p.bars, base = pb * spb;
    const ev = [];
    for (const v in p.tracks) for (const [i, vel] of p.tracks[v]) if (i >= base && i < base + spb) ev.push({ v, step: i - base, vel, dur: v === 'SW' ? p.sub : 0 });
    const fillBar = o.fills && p.fill !== 'none' && (barIdx % 4 === 3) && (p.bars === 1 || pb === p.bars - 1);
    if (fillBar) {
      const from = spb - p.sub;
      for (let k = ev.length - 1; k >= 0; k--) if (ev[k].step >= from && ev[k].v !== 'K' && ev[k].v !== 'P') ev.splice(k, 1);
      for (const [v, s, vel] of FILLS[p.fill][p.sub]) ev.push({ v, step: from + s, vel, dur: 0 });
    }
    const afterFill = o.fills && p.fill !== 'none' && barIdx > 0 && barIdx % 4 === 0;
    if ((p.crash && (barIdx % 8 === 0) && o.crashOnOne !== false) || (afterFill && p.energy >= 0.45)) ev.push({ v: 'C', step: 0, vel: 0.8, dur: 0 });
    return ev;
  }

  /* ---------- engine ---------- */
  function Engine() { this.ctx = null; this.kit = null; this.ir = null; this.cache = new WeakMap(); this.loop = null; this.onBeat = null; }
  Engine.prototype.ensure = function () {
    if (!this.ctx) {
      const AC = root.AudioContext || root.webkitAudioContext;
      try { this.ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { this.ctx = new AC(); }
    }
    if (!this.kit) { this.kit = renderKit(this.ctx.sampleRate); this.ir = makeIR(this.ctx.sampleRate); }
    if (!this.chain) this.chain = this.buildChain(this.ctx, this.ctx.destination);
    return this.ctx;
  };
  Engine.prototype.prepare = function (sr) { if (!this.kit) { this.kit = renderKit(sr); this.ir = makeIR(sr); } };
  Engine.prototype.buffersFor = function (ctx) {
    let b = this.cache.get(ctx); if (b) return b;
    b = {}; const sr = this.kit.sr;
    for (const v in this.kit.kit) { b[v] = {}; for (const layer of ['soft', 'hard']) b[v][layer] = this.kit.kit[v][layer].map(d => { const ab = ctx.createBuffer(1, d.length, sr); ab.getChannelData(0).set(d); return ab; }); }
    const ir = ctx.createBuffer(2, this.ir[0].length, sr); ir.getChannelData(0).set(this.ir[0]); ir.getChannelData(1).set(this.ir[1]); b._ir = ir;
    this.cache.set(ctx, b); return b;
  };
  Engine.prototype.buildChain = function (ctx, dest) {
    const bufs = this.buffersFor(ctx);
    const out = ctx.createGain(); out.gain.value = 0.85; out.connect(dest);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 2.8; comp.attack.value = 0.006; comp.release.value = 0.14;
    comp.connect(out);
    const dry = ctx.createGain(); dry.connect(comp);
    const verb = ctx.createConvolver(); verb.buffer = bufs._ir; const vin = ctx.createGain(); const vout = ctx.createGain(); vout.gain.value = 0.9;
    vin.connect(verb); verb.connect(vout); vout.connect(comp);
    const chans = {};
    for (const v in MIX) {
      const [g, pan, rev] = MIX[v];
      const cg = ctx.createGain(); cg.gain.value = g;
      let node = cg;
      if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; cg.connect(p); node = p; }
      node.connect(dry);
      const s = ctx.createGain(); s.gain.value = rev; node.connect(s); s.connect(vin);
      chans[v] = cg;
    }
    return { ctx, out, chans, bufs, rr: 0, lastOpen: null };
  };
  Engine.prototype.hit = function (chain, v, when, vel, beatDur) {
    const ctx = chain.ctx; const layer = vel < 0.6 ? 'soft' : 'hard';
    const arr = chain.bufs[v][layer]; const buf = arr[(chain.rr++) % arr.length];
    const src = ctx.createBufferSource(); src.buffer = buf;
    const g = ctx.createGain(); g.gain.value = Math.pow(Math.min(1.2, vel), 1.35);
    if (v === 'SW' && beatDur) src.playbackRate.value = Math.max(0.45, Math.min(2.2, 1 / (beatDur * 1.05)));
    src.connect(g); g.connect(chain.chans[v]);
    if ((v === 'H' || v === 'P') && chain.lastOpen && chain.lastOpen.t < when) { try { chain.lastOpen.g.gain.setTargetAtTime(0, when, 0.012); } catch (e) {} chain.lastOpen = null; }
    if (v === 'O') chain.lastOpen = { g, t: when };
    src.start(Math.max(0, when));
    return src;
  };
  function humanize(r, ev, kit) {
    const u = (r() + r() + r() - 1.5) * 1.15; // ~N(0,0.58)
    const dt = u * (ev.v === 'K' ? 0.002 : 0.004);
    const dv = 1 + (r() - 0.5) * 0.12;
    return [dt, ev.vel * dv];
  }
  // schedule n bars of pattern p into a chain starting at t0
  Engine.prototype.scheduleBars = function (chain, p, bpm, t0, nBars, o) {
    const stepDur = 60 / bpm / p.sub, barDur = stepDur * p.stepsPerBar; const r = rng(o && o.seed || 5);
    for (let b = 0; b < nBars; b++) for (const ev of barEvents(p, b, o)) {
      const [dt, vel] = humanize(r, ev);
      this.hit(chain, ev.v, t0 + b * barDur + ev.step * stepDur + (b === 0 && ev.step === 0 ? 0 : dt), vel, ev.dur ? ev.dur * stepDur : 0);
    }
  };

  // ---- real-time loop with look-ahead scheduler ----
  Engine.prototype.startLoop = function (p, bpm, opts) {
    this.stopLoop();
    const ctx = this.ensure();
    const L = { p, bpm, opts: opts || {}, beat: 0, bar: 0, next: ctx.currentTime + 0.12, srcs: [], r: rng(Date.now() & 0xffff), barEv: null, timer: 0, beats: [] };
    this.loop = L;
    const tick = () => {
      const ahead = ctx.currentTime + 0.14;
      while (L.next < ahead) {
        if (L.beat === 0) L.barEv = barEvents(L.p, L.bar, { fills: L.opts.fills, crashOnOne: L.bar > 0 || L.opts.crashFirst });
        const stepDur = 60 / L.bpm / L.p.sub;
        const lo = L.beat * L.p.sub, hi = lo + L.p.sub;
        for (const ev of L.barEv) if (ev.step >= lo && ev.step < hi) {
          const [dt, vel] = humanize(L.r, ev);
          const when = L.next + (ev.step - lo) * stepDur + dt;
          L.srcs.push({ s: this.hit(this.chain, ev.v, when, vel, ev.dur ? ev.dur * stepDur : 0), t: when });
        }
        L.beats.push({ t: L.next, beat: L.beat, bar: L.bar });
        L.next += L.p.sub * stepDur;
        L.beat++; if (L.beat >= L.p.beats) { L.beat = 0; L.bar++; }
      }
      const now = ctx.currentTime;
      if (L.srcs.length > 64) L.srcs = L.srcs.filter(x => x.t > now - 3);
      while (L.beats.length && L.beats[0].t <= now) { const b = L.beats.shift(); if (this.onBeat) this.onBeat(b); }
    };
    tick();
    L.timer = setInterval(tick, 25);
    return L;
  };
  Engine.prototype.setLoopTempo = function (bpm) { if (this.loop) this.loop.bpm = bpm; };
  Engine.prototype.stopLoop = function () {
    const L = this.loop; if (!L) return; clearInterval(L.timer);
    const now = this.ctx.currentTime;
    for (const x of L.srcs) if (x.t > now) { try { x.s.stop(); } catch (e) {} }
    this.loop = null;
  };

  // ---- offline preview: guitar (already warped) + drums ----
  // guitar: Float32Array at gsr; lead: seconds before first downbeat in guitar; totalSec; p, bpm
  Engine.prototype.renderPreview = function (guitar, gsr, lead, drumSec, p, bpm, mix) {
    this.ensure();
    const sr = this.ctx.sampleRate; const tail = 0.9;
    const len = Math.ceil((lead + drumSec + tail) * sr);
    const OAC = root.OfflineAudioContext || root.webkitOfflineAudioContext;
    const off = new OAC(2, len, sr);
    const master = off.createGain(); master.connect(off.destination);
    const fadeAt = lead + drumSec + 0.1; master.gain.setValueAtTime(1, fadeAt); master.gain.linearRampToValueAtTime(0, fadeAt + tail - 0.15);
    const drumBus = off.createGain(); drumBus.gain.value = mix.drums; drumBus.connect(master);
    const chain = this.buildChain(off, drumBus);
    const stepDur = 60 / bpm / p.sub; const barDur = stepDur * p.stepsPerBar; const nBars = Math.round(drumSec / barDur);
    this.scheduleBars(chain, p, bpm, lead, nBars, { fills: false, crashOnOne: true, seed: 3 });
    if (guitar) {
      let pk = 0; for (let i = 0; i < guitar.length; i++) pk = Math.max(pk, Math.abs(guitar[i]));
      const gb = off.createBuffer(1, guitar.length, gsr); gb.getChannelData(0).set(guitar);
      const gs = off.createBufferSource(); gs.buffer = gb; const gg = off.createGain(); gg.gain.value = mix.guitar * (pk > 0 ? 0.6 / pk : 1);
      gs.connect(gg); gg.connect(master); gs.start(0);
    }
    const done = off.startRendering();
    const finish = (buf) => {
      let pk = 0; for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i])); }
      if (pk > 0.97) { const g = 0.97 / pk; for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= g; } }
      return buf;
    };
    if (done && done.then) return done.then(finish);
    return new Promise(res => { off.oncomplete = e => res(finish(e.renderedBuffer)); });
  };
  Engine.prototype.playBuffer = function (buf, onEnd) {
    const ctx = this.ensure(); this.stopBuffer();
    const s = ctx.createBufferSource(); s.buffer = buf; s.connect(ctx.destination);
    const t0 = ctx.currentTime + 0.03; s.start(t0);
    s.onended = () => { if (this.cur && this.cur.s === s) { this.cur = null; if (onEnd) onEnd(); } };
    this.cur = { s, t0, dur: buf.duration };
    return this.cur;
  };
  Engine.prototype.stopBuffer = function () { if (this.cur) { const s = this.cur.s; this.cur = null; try { s.stop(); } catch (e) {} } };

  const api = { Engine, barEvents, renderKit, GEN, MIX };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SDDrums = api;
})(typeof self !== 'undefined' ? self : this);
