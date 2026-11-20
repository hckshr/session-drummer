/* Session Drummer — synthesized drum kit, event generation, real-time scheduler and offline preview render. */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;
  function rng(seed) { let s = seed >>> 0 || 7; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  /* Acoustic kit: real recorded samples (CC0), decoded from MP3 at load time.
     Sources: Virtuosity Drums (Versilian Studios / Karoryfer Samples) and Swirly Drums brushes (Karoryfer Samples). */
  // mix: gain, pan, reverb send (samples already carry some room, so sends are small)
  const MIX = { K: [1.0, 0, 0.03], S: [0.82, 0, 0.1], RS: [0.78, 0, 0.1], R: [0.7, 0, 0.08], H: [0.42, 0.25, 0.04], P: [0.38, 0.25, 0.03], O: [0.36, 0.25, 0.06],
    Y: [0.42, -0.28, 0.06], B: [0.38, -0.28, 0.06], C: [0.42, -0.35, 0.08], T1: [0.8, 0.18, 0.1], T2: [0.86, -0.2, 0.1], BR: [0.85, 0.04, 0.1], SW: [0.5, -0.04, 0.08], SH: [0.34, 0.35, 0.05] };
  function b64ToBuf(s) { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; }
  function decodeWith(ctx, ab) {
    return new Promise((res, rej) => { let done = false; const ok = b => { if (!done) { done = true; res(b); } }, bad = e => { if (!done) { done = true; rej(e || new Error('decode failed')); } };
      try { const p = ctx.decodeAudioData(ab, ok, bad); if (p && p.then) p.then(ok, bad); } catch (e) { bad(e); } });
  }
  // MP3 decoders add a little silence up front; every sample was onset-trimmed at build time, so re-trim here.
  function trimLead(x, sr, keepStart) {
    let pk = 0; for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > pk) pk = a; }
    let i = 0; const th = keepStart ? 1e-4 : 0.02 * pk; while (i < x.length && Math.abs(x[i]) < th) i++;
    return x.slice(Math.max(0, i - (keepStart ? 0 : Math.round(0.004 * sr))));
  }
  async function decodeKit(json, ctx, onProgress) {
    const kit = {}; let n = 0, total = 0; for (const v in json.voices) for (const l of json.voices[v]) total += l.length;
    for (const v in json.voices) {
      kit[v] = [];
      for (const layer of json.voices[v]) {
        const arr = [];
        for (const b64 of layer) {
          const buf = await decodeWith(ctx, b64ToBuf(b64));
          arr.push(trimLead(new Float32Array(buf.getChannelData(0)), buf.sampleRate, v === 'SW'));
          if (onProgress) onProgress(++n / total);
        }
        kit[v].push(arr);
      }
    }
    return { sr: ctx.sampleRate, kit };
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
    for (const v in p.tracks) for (const [i, vel] of p.tracks[v]) if (i >= base && i < base + spb) ev.push({ v: (p.rimshot && v === 'S' && vel >= 0.95) ? 'RS' : v, step: i - base, vel, dur: v === 'SW' ? p.sub : 0 });
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

  /* ---------- click (metronome) ---------- */
  // clicks per bar and accent for each click: 2 = the ONE, 1 = secondary (beat 4 of 6/8), 0 = other beats
  function clickGrid(p) {
    const n = p.meter === '6/8' ? 6 : p.beats;
    const acc = Array.from({ length: n }, (_, i) => i === 0 ? 2 : (p.meter === '6/8' && i === 3 ? 1 : 0));
    return { n, acc };
  }
  const CLICK = [[1175, 0.30, 0.022], [1175, 0.42, 0.026], [1760, 0.60, 0.032]]; // [freq, amp, decay] by accent
  function clickWave(sr, a) {
    const [f, amp, dec] = CLICK[a]; const n = Math.round(sr * 0.09); const d = new Float32Array(n);
    for (let i = 0; i < n; i++) { const t = i / sr; const env = Math.min(1, t / 0.0008) * Math.exp(-t / dec); d[i] = amp * env * (Math.sin(2 * Math.PI * f * t) * 0.8 + Math.sin(2 * Math.PI * f * 2.01 * t) * 0.2); }
    return d;
  }
  const DRUM_LEAD = 0.0085; // s, measured: DynamicsCompressor look-ahead (~6 ms) + ~4 ms kept before each sample's attack
  const dbToGain = (db) => (db == null || db === -Infinity) ? 0 : Math.pow(10, db / 20);

  /* ---------- engine ---------- */
  function Engine() { this.ctx = null; this.kit = null; this.ir = null; this.cache = new WeakMap(); this.loop = null; this.onBeat = null; }
  Engine.prototype.ensure = function () {
    if (!this.ctx) {
      const AC = root.AudioContext || root.webkitAudioContext;
      try { this.ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { this.ctx = new AC(); }
    }
    if (!this.bus) { this.bus = this.makeBus(this.ctx); this.setLevels({}); }
    if (this.kit && !this.chain) this.chain = this.buildChain(this.ctx, this.bus.drums);
    return this.ctx;
  };
  // separate live gains for the guitar take, the drums and the click, then a gentle safety limiter
  Engine.prototype.makeBus = function (ctx) {
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -1; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.12;
    lim.connect(ctx.destination);
    const g = (v) => { const n = ctx.createGain(); n.gain.value = v; n.connect(lim); return n; };
    const bus = { lim, guitar: g(1), drums: g(1), click: g(0) };
    this.clickBufs = [0, 1, 2].map(a => { const d = clickWave(ctx.sampleRate, a); const b = ctx.createBuffer(1, d.length, ctx.sampleRate); b.getChannelData(0).set(d); return b; });
    return bus;
  };
  // levels in dB (-Infinity = off); applied live with a short ramp
  Engine.prototype.setLevels = function (lv) {
    this.levels = Object.assign(this.levels || { guitar: 0, drums: 0, click: -Infinity }, lv);
    if (!this.bus) return;
    const now = this.ctx.currentTime;
    for (const k of ['guitar', 'drums', 'click']) { const prm = this.bus[k].gain; const v = dbToGain(this.levels[k]); try { prm.cancelScheduledValues(now); prm.setTargetAtTime(v, now, 0.015); } catch (e) { prm.value = v; } }
  };
  // Load + decode the sample kit. Tries an OfflineAudioContext first (works before any tap);
  // if that is unavailable or fails, decodes again on the realtime context (called from a tap).
  Engine.prototype.load = function (url, onProgress) {
    if (this.loading) return this.loading;
    const self = this;
    this.loading = (async () => {
      const json = await (await fetch(url)).json();
      self.json = json;
      let kit = null;
      try {
        const OAC = root.OfflineAudioContext || root.webkitOfflineAudioContext;
        if (OAC) kit = await decodeKit(json, new OAC(1, 1, json.sr || 44100), onProgress);
      } catch (e) { console.warn('offline decode failed, will decode on tap', e); kit = null; }
      if (!kit) { self.needsTapDecode = true; return null; }
      self.kit = kit; self.ir = makeIR(kit.sr); return kit;
    })();
    return this.loading;
  };
  // Call inside a tap: guarantees the kit is decoded (decoding on the live context if needed).
  Engine.prototype.ready = async function (onProgress) {
    await this.loading;
    if (!this.kit) {
      if (!this.json) throw new Error('drum samples did not download');
      const ctx = this.ensure(true);
      this.kit = await decodeKit(this.json, ctx, onProgress); this.ir = makeIR(this.kit.sr);
    }
    if (!this.chain) this.chain = this.buildChain(this.ctx, this.bus.drums);
    return this.kit;
  };
  Engine.prototype.buffersFor = function (ctx) {
    let b = this.cache.get(ctx); if (b) return b;
    b = {}; const sr = this.kit.sr;
    for (const v in this.kit.kit) b[v] = this.kit.kit[v].map(layer => layer.map(d => { const ab = ctx.createBuffer(1, d.length, sr); ab.getChannelData(0).set(d); return ab; }));
    const irs = ctx.sampleRate; this.irs = this.irs || {}; const IR = this.irs[irs] || (this.irs[irs] = makeIR(irs)); // convolver needs the context's own rate
    const ir = ctx.createBuffer(2, IR[0].length, irs); ir.getChannelData(0).set(IR[0]); ir.getChannelData(1).set(IR[1]); b._ir = ir;
    this.cache.set(ctx, b); return b;
  };
  Engine.prototype.buildChain = function (ctx, dest) {
    const bufs = this.buffersFor(ctx);
    const out = ctx.createGain(); out.gain.value = 0.85; out.connect(dest);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 2.8; comp.attack.value = 0.006; comp.release.value = 0.14;
    comp.connect(out);
    const dry = ctx.createGain(); dry.connect(comp);
    const verb = ctx.createConvolver(); verb.buffer = bufs._ir; const vin = ctx.createGain(); const vout = ctx.createGain(); vout.gain.value = 0.7;
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
    return { ctx, out, chans, bufs, rr: {}, lastOpen: null };
  };
  Engine.prototype.hit = function (chain, v, when, vel, beatDur) {
    when -= DRUM_LEAD; // the compressor's look-ahead plus the sample's pre-attack: fire early so the attack lands on the grid
    const ctx = chain.ctx; const layers = chain.bufs[v]; if (!layers) return null;
    const L = layers.length; const li = Math.max(0, Math.min(L - 1, Math.floor(Math.pow(Math.min(1, vel), 1.5) * L)));
    const arr = layers[li];
    // round-robin without immediate repeats
    const key = v + li; const last = chain.rr[key] == null ? -1 : chain.rr[key];
    let k = arr.length > 1 ? (last + 1 + Math.floor(Math.random() * (arr.length - 1))) % arr.length : 0; chain.rr[key] = k;
    const src = ctx.createBufferSource(); src.buffer = arr[k];
    const g = ctx.createGain(); const amp = Math.pow(Math.min(1.15, vel), 1.5);
    src.connect(g); g.connect(chain.chans[v]);
    if ((v === 'H' || v === 'P') && chain.lastOpen && chain.lastOpen.t < when) { try { chain.lastOpen.g.gain.setTargetAtTime(0, when, 0.015); } catch (e) {} chain.lastOpen = null; }
    if (v === 'O') chain.lastOpen = { g, t: when };
    const t = Math.max(0, when);
    if (v === 'SW') { // brush stir: a slice of a long recorded sweep, shaped to one beat
      const d = Math.max(0.15, (beatDur || 0.5) * 1.08); const len = arr[k].duration;
      const off = Math.random() * Math.max(0, len - d - 0.05);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(amp, t + d * 0.35); g.gain.linearRampToValueAtTime(amp * 0.6, t + d * 0.8); g.gain.linearRampToValueAtTime(0, t + d);
      src.start(t, off, d + 0.02);
    } else { g.gain.value = amp; src.start(t); }
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
        // click: every beat (every eighth in 6/8), always scheduled on the same clock; the click gain gates it
        const cg = clickGrid(L.p), per = cg.n / L.p.beats, cd = L.p.sub * stepDur / per;
        for (let k = 0; k < per; k++) {
          const ci = L.beat * per + k, when = L.next + k * cd;
          if (this.clickBufs) { const cs = this.ctx.createBufferSource(); cs.buffer = this.clickBufs[cg.acc[ci]]; cs.connect(this.bus.click); cs.start(when); L.srcs.push({ s: cs, t: when }); }
          L.beats.push({ t: when, beat: L.beat, bar: L.bar, count: ci, n: cg.n });
        }
        L.next += L.p.sub * stepDur;
        L.beat++; if (L.beat >= L.p.beats) { L.beat = 0; L.bar++; }
      }
      const now = ctx.currentTime;
      if (L.srcs.length > 64) L.srcs = L.srcs.filter(x => x.t > now - 3);
      const lat = (ctx.outputLatency || 0) + (ctx.baseLatency || 0);
      while (L.beats.length && L.beats[0].t <= now - lat) { const b = L.beats.shift(); if (this.onBeat) this.onBeat(b); }
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

  // ---- offline preview: guitar (already warped) + drums + click, kept as separate stems ----
  // guitar: Float32Array at gsr; lead: seconds before first downbeat in guitar; drumSec: whole bars
  // Returns { drums: stereo AudioBuffer, guitar: mono AudioBuffer, click: mono AudioBuffer, dur, grid }.
  // All three start at sample 0, so playing them from one start time keeps them sample-locked.
  Engine.prototype.renderPreview = function (guitar, gsr, lead, drumSec, p, bpm, mix) {
    this.ensure(); mix = mix || {};
    const sr = this.ctx.sampleRate; const tail = 0.9; const dur = lead + drumSec + tail;
    const len = Math.ceil(dur * sr);
    const OAC = root.OfflineAudioContext || root.webkitOfflineAudioContext;
    const off = new OAC(2, len, sr);
    const master = off.createGain(); master.connect(off.destination);
    const fadeAt = lead + drumSec + 0.1; if (!mix.loop) { master.gain.setValueAtTime(1, fadeAt); master.gain.linearRampToValueAtTime(0, fadeAt + tail - 0.15); }
    const drumBus = off.createGain(); drumBus.gain.value = mix.drums == null ? 0.9 : mix.drums; drumBus.connect(master);
    const chain = this.buildChain(off, drumBus);
    const stepDur = 60 / bpm / p.sub; const barDur = stepDur * p.stepsPerBar; const nBars = Math.round(drumSec / barDur);
    this.scheduleBars(chain, p, bpm, lead, nBars, { fills: false, crashOnOne: true, seed: 3 });
    const fold = (d, rate) => { // fold the ring-out back onto the top so the loop is seamless
      const a = Math.round(lead * rate), L = Math.round(drumSec * rate);
      for (let j = a + L; j < d.length; j++) { d[j - L] += d[j]; d[j] = 0; }
    };
    const fade = (d, rate) => { const i0 = Math.round(fadeAt * rate), n = Math.round((tail - 0.15) * rate); for (let i = i0; i < d.length; i++) d[i] *= Math.max(0, 1 - (i - i0) / n); };
    // guitar stem (no rendering needed)
    const gl = Math.ceil(dur * gsr); const gd = new Float32Array(gl);
    if (guitar) {
      let pk = 0; for (let i = 0; i < guitar.length; i++) pk = Math.max(pk, Math.abs(guitar[i]));
      const g = (mix.guitar == null ? 1 : mix.guitar) * (pk > 0 ? 0.6 / pk : 1);
      for (let i = 0; i < gl && i < guitar.length; i++) gd[i] = guitar[i] * g;
      if (mix.loop) fold(gd, gsr); else fade(gd, gsr);
    }
    // click stem: exactly on the drum grid (every beat; every eighth in 6/8), ONE accented
    const cg = clickGrid(p); const cint = barDur / cg.n; const cd = new Float32Array(len); const waves = [0, 1, 2].map(a => clickWave(sr, a));
    for (let k = 0; k < nBars * cg.n; k++) { const w = waves[cg.acc[k % cg.n]]; const i0 = Math.round((lead + k * cint) * sr); for (let i = 0; i < w.length && i0 + i < len; i++) cd[i0 + i] += w[i]; }
    if (mix.loop) fold(cd, sr);
    const grid = { lead, cint, n: cg.n, acc: cg.acc, loop: mix.loop ? { start: lead, end: lead + drumSec } : null };
    const done = off.startRendering();
    const finish = (buf) => {
      if (mix.loop) for (let c = 0; c < buf.numberOfChannels; c++) fold(buf.getChannelData(c), sr);
      // keep the default (0 dB / 0 dB) mix under the limiter: scale drums + guitar together if the sum would peak
      let pk = 0; const L = buf.getChannelData(0), R = buf.getChannelData(buf.numberOfChannels - 1), ratio = gsr / sr;
      for (let i = 0; i < len; i++) { const gi = Math.min(gl - 1, Math.round(i * ratio)); const gv = gd[gi] || 0; pk = Math.max(pk, Math.abs(L[i] + gv), Math.abs(R[i] + gv)); }
      if (pk > 0.85) { const g = 0.85 / pk; for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= g; } for (let i = 0; i < gl; i++) gd[i] *= g; }
      const gb = this.ctx.createBuffer(1, gl, gsr); gb.getChannelData(0).set(gd);
      const cb = this.ctx.createBuffer(1, len, sr); cb.getChannelData(0).set(cd);
      return { drums: buf, guitar: gb, click: cb, dur: buf.duration, grid, duration: buf.duration };
    };
    if (done && done.then) return done.then(finish);
    return new Promise(res => { off.oncomplete = e => res(finish(e.renderedBuffer)); });
  };
  // play the stems together through the live guitar / drums / click gains
  Engine.prototype.playBuffer = function (stems, onEnd, loop) {
    const ctx = this.ensure(); this.stopBuffer();
    if (stems.getChannelData) stems = { drums: stems, dur: stems.duration };
    const t0 = ctx.currentTime + 0.05; const srcs = [];
    for (const k of ['drums', 'guitar', 'click']) {
      if (!stems[k]) continue;
      const s = ctx.createBufferSource(); s.buffer = stems[k]; s.connect(this.bus[k]);
      if (loop) { s.loop = true; s.loopStart = loop.start; s.loopEnd = loop.end; }
      s.start(t0); srcs.push(s);
    }
    const s = srcs[0];
    s.onended = () => { if (this.cur && this.cur.s === s) { this.cur = null; if (onEnd) onEnd(); } };
    this.cur = { s, srcs, t0, dur: stems.dur, loop, grid: stems.grid };
    return this.cur;
  };
  Engine.prototype.stopBuffer = function () { if (this.cur) { const a = this.cur.srcs || [this.cur.s]; this.cur = null; for (const s of a) { try { s.stop(); } catch (e) {} } } };
  // where the playhead is in the preview, as a click count (0 = the ONE), or -1 before the first beat
  Engine.prototype.previewCount = function () {
    const c = this.cur; if (!c || !c.grid) return -1;
    const ctx = this.ctx; const lat = (ctx.outputLatency || 0) + (ctx.baseLatency || 0);
    let pos = ctx.currentTime - lat - c.t0; const g = c.grid;
    if (c.loop && pos > c.loop.end) pos = c.loop.start + (pos - c.loop.start) % (c.loop.end - c.loop.start);
    if (pos < g.lead - 0.005) return -1;
    return Math.floor((pos - g.lead + 0.005) / g.cint) % g.n;
  };

  const api = { Engine, barEvents, MIX, decodeKit, clickGrid, clickWave, dbToGain };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SDDrums = api;
})(typeof self !== 'undefined' ? self : this);
