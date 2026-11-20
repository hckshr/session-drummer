(function () {
  'use strict';
  const A = window.SDAnalysis, P = window.SDPatterns, D = window.SDDrums;
  const $ = (id) => document.getElementById(id);
  const eng = new D.Engine();
  const st = { rec: null, samples: null, sr: 0, base: null, cur: null, manual: false, seed: 1, shown: [], cards: [], playing: null, warpCache: new Map(), loop: null, wake: null };
  window.__sd = { st, eng, A, P, D };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // Pre-render the kit while the page is idle (no AudioContext needed for that)
  setTimeout(() => { try { eng.prepare(48000); } catch (e) { console.warn(e); } }, 150);

  /* ---------- audio unlock (iOS) ---------- */
  let silentEl = null;
  function silentWavUrl() {
    const n = 8000, b = new Uint8Array(44 + n), dv = new DataView(b.buffer);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) b[o + i] = s.charCodeAt(i); };
    w(0, 'RIFF'); dv.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, 8000, true); dv.setUint32(28, 8000, true); dv.setUint16(32, 1, true); dv.setUint16(34, 8, true); w(36, 'data'); dv.setUint32(40, n, true);
    b.fill(128, 44); return URL.createObjectURL(new Blob([b], { type: 'audio/wav' }));
  }
  function setSession(type) { try { if (navigator.audioSession) navigator.audioSession.type = type; } catch (e) {} }
  // Must be called synchronously inside a tap handler.
  function unlock(forRecording) {
    const ctx = eng.ensure();
    setSession(forRecording ? 'play-and-record' : 'playback');
    if (!navigator.audioSession) { // older iOS: a playing <audio> element lets Web Audio ignore the silent switch
      if (!silentEl) { silentEl = new Audio(silentWavUrl()); silentEl.loop = true; silentEl.setAttribute('playsinline', ''); }
      try { const p = silentEl.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
    }
    let p = null; if (ctx.state !== 'running') { try { p = ctx.resume(); } catch (e) {} }
    return p || Promise.resolve();
  }
  async function wake(on) {
    try {
      if (on && !st.wake && navigator.wakeLock) st.wake = await navigator.wakeLock.request('screen');
      if (!on && st.wake) { st.wake.release(); st.wake = null; }
    } catch (e) {}
  }

  /* ---------- recording ---------- */
  const MAX_SEC = 20, MIN_SEC = 6;
  function warn(msg) { const w = $('warn'); if (!msg) { w.classList.add('hide'); return; } w.textContent = msg; w.classList.remove('hide'); }
  function recUI(state, sub) {
    const b = $('rec'); b.classList.toggle('on', state === 'rec'); b.classList.toggle('busy', state === 'busy');
    $('recLabel').innerHTML = state === 'rec' ? 'Stop' : state === 'busy' ? '<span class="spin"></span>Listening back' : 'Listen';
    $('recSub').textContent = sub || (state === 'idle' ? 'tap, then play' : '');
  }
  async function startRec() {
    if (st.rec) { stopRec(false); return; }
    if (st.busy) return;
    stopAll(); warn('');
    const resumed = unlock(true);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { warn('This browser does not allow microphone access here. Try Safari or Chrome.'); return; }
    recUI('busy', 'asking for the mic');
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 }, video: false });
    } catch (e) {
      recUI('idle'); setSession('playback');
      warn(e && e.name === 'NotAllowedError' ? 'Microphone access was blocked. On iPhone, go to Settings › Safari › Microphone, set it to Ask or Allow, then reload the page.' : 'Could not open the microphone (' + (e && e.name || e) + ').');
      return;
    }
    await resumed;
    const ctx = eng.ctx;
    if (ctx.state !== 'running') { try { await ctx.resume(); } catch (e) {} }
    const src = ctx.createMediaStreamSource(stream);
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    const sink = ctx.createGain(); sink.gain.value = 0;
    const R = { stream, src, proc, sink, chunks: [], t0: performance.now(), sr: ctx.sampleRate, level: 0, heard: false };
    proc.onaudioprocess = (e) => {
      if (st.rec !== R) return;
      const d = e.inputBuffer.getChannelData(0); R.chunks.push(new Float32Array(d));
      let p = 0; for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > p) p = a; }
      R.level = Math.max(p, R.level * 0.8); if (p > 0.004) R.heard = true;
    };
    src.connect(proc); proc.connect(sink); sink.connect(ctx.destination);
    st.rec = R; recUI('rec', '0:00');
    const tick = () => {
      if (st.rec !== R) return;
      const el = (performance.now() - R.t0) / 1000;
      const db = 20 * Math.log10(R.level + 1e-6);
      $('lvl').style.width = clamp((db + 60) / 60 * 100, 0, 100) + '%';
      $('rec').style.setProperty('--lvl', clamp((db + 50) / 50 * 14, 0, 14) + 'px');
      recUI('rec', `0:${String(Math.floor(el)).padStart(2, '0')} · ${el < MIN_SEC ? 'keep going' : 'tap to finish'}`);
      if (el > 3 && !R.heard) warn('I\'m not hearing anything yet. Check that the mic is not blocked and that the guitar is loud enough.');
      else if (R.heard) warn('');
      if (el >= MAX_SEC) { stopRec(true); return; }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  function stopRec(auto) {
    const R = st.rec; if (!R) return;
    const el = (performance.now() - R.t0) / 1000;
    st.rec = null;
    try { R.src.disconnect(); R.proc.disconnect(); R.sink.disconnect(); } catch (e) {}
    R.stream.getTracks().forEach(t => t.stop());
    setSession('playback');
    $('lvl').style.width = '0%';
    if (el < MIN_SEC - 0.5 && !auto) { recUI('idle'); warn('That was a bit short. Play for at least 6 seconds, and 10 to 20 is better.'); return; }
    let n = 0; for (const c of R.chunks) n += c.length;
    const x = new Float32Array(n); let o = 0; for (const c of R.chunks) { x.set(c, o); o += c.length; }
    // drop the first ~120 ms (tap noise / mic warm-up)
    const skip = Math.min(n, Math.round(0.12 * R.sr));
    st.samples = x.subarray(skip); st.sr = R.sr;
    recUI('busy', 'working out the feel'); st.busy = true;
    setTimeout(() => { try { analyzeNow(); } finally { st.busy = false; } }, 40);
  }
  function analyzeNow() {
    let res;
    try { res = A.analyze(st.samples, st.sr); } catch (e) { console.error(e); res = { ok: false, reason: 'error' }; }
    recUI('idle', 'tap to play something new');
    if (!res.ok) {
      warn(res.reason === 'quiet' ? 'That came through very quietly. Move the phone closer to the amp or guitar and try again.' : 'I couldn\'t pick out a clear rhythm. Try strumming or picking a steady part for 10 to 20 seconds.');
      return;
    }
    st.base = res; st.manual = false; st.seed = 1; st.shown = [];
    st.cur = A.retrack(res, { bpm: Math.round(res.bpm), meter: res.meter, feel: res.feel, bpmExact: true });
    st.cur.detected = { bpm: res.bpm, meter: res.meter, feel: res.feel };
    st.warpCache.clear();
    showResults();
  }
  function manualMode() {
    stopAll(); warn('');
    st.manual = true; st.base = null; st.seed = 1; st.shown = [];
    st.cur = makeManual(90, '4/4', 'straight');
    showResults();
  }
  function makeManual(bpm, meter, feel) {
    const fake = { bpm, meter, feel, key: { mode: 'major', modeLean: 0 }, levelDb: -30, density: 1.5, centroid: 1500, period: 60 / bpm };
    const d = A.describe(fake);
    return Object.assign(fake, d, { features: { energy: 0.5, busy: 0.4, dark: 0.5 }, manual: true });
  }
  function showResults() {
    $('heard').classList.remove('hide'); $('sugg').classList.remove('hide');
    document.querySelectorAll('.guitarOnly').forEach(e => e.classList.toggle('hide', st.manual));
    renderHeard(); renderSuggestions();
    setTimeout(() => $('heard').scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }

  /* ---------- "what I heard" ---------- */
  function confWord(v) { return v > 0.55 ? 'confident' : v > 0.25 ? 'fairly sure' : 'a guess'; }
  function renderHeard() {
    const c = st.cur;
    $('hBpm').innerHTML = c.meter === '6/8' ? `${Math.round(c.bpm)}<small>♩. per min</small>` : `${Math.round(c.bpm)}<small>BPM</small>`;
    const chips = [c.meter, c.meter === '6/8' ? 'Triplet lilt' : c.feel === 'swing' ? 'Swung' : 'Straight'];
    let html = chips.map(t => `<span class="chip">${t}</span>`).join('');
    if (!st.manual && c.key && c.key.tonic) html += `<span class="chip k">${c.key.tonic} ${c.key.mode}-ish</span>`;
    $('hChips').innerHTML = html;
    if (st.manual) {
      $('hDesc').textContent = 'Pick a tempo, meter and feel, then try the drums below.';
      $('hWants').textContent = ''; $('hConf').textContent = '';
    } else {
      $('hDesc').textContent = c.description;
      $('hWants').textContent = `Sounds like it wants ${c.wants}.`;
      const b = st.base; const ints = []; for (let i = 1; i < b.beats.length; i++) ints.push(b.beats[i] - b.beats[i - 1]);
      const m = ints.reduce((a, v) => a + v, 0) / ints.length; const sd = Math.sqrt(ints.reduce((a, v) => a + (v - m) * (v - m), 0) / ints.length);
      const tc = clamp(1 - (sd / m) * 8, 0, 1);
      const changed = c.detected ? false : true;
      $('hConf').textContent = `Tempo: ${confWord(tc)} · Meter: ${confWord(b.meterConf)} · Feel: ${confWord(Math.abs(b.swing) * Math.min(1, b.offStrength * 3))}. If I got something wrong, fix it below. Tempo can easily come out at half or double.`;
    }
    $('tVal').textContent = Math.round(c.bpm);
    document.querySelectorAll('#segMeter button').forEach(b => b.classList.toggle('on', b.dataset.m === c.meter));
    document.querySelectorAll('#segFeel button').forEach(b => { b.classList.toggle('on', c.meter !== '6/8' && b.dataset.f === c.feel); b.disabled = c.meter === '6/8'; });
  }
  function convertTempo(from, to, bpm) {
    if (from === '3/4' && to === '6/8') return bpm * 2 / 3;
    if (from === '6/8' && to === '3/4') return bpm * 1.5;
    return bpm;
  }
  function applyChange(ch) {
    const c = st.cur;
    const meter = ch.meter || c.meter;
    let bpm = ch.bpm != null ? ch.bpm : c.bpm;
    if (ch.meter && ch.meter !== c.meter) bpm = convertTempo(c.meter, ch.meter, c.bpm);
    bpm = clamp(Math.round(bpm), 30, 260);
    let feel = ch.feel || c.feel; if (meter === '6/8') feel = 'swing';
    stopAll();
    if (st.manual) st.cur = makeManual(bpm, meter, feel);
    else { st.cur = A.retrack(st.base, { bpm, meter, feel, bpmExact: true }); }
    st.warpCache.clear(); st.seed = 1; st.shown = [];
    renderHeard(); renderSuggestions();
  }

  /* ---------- suggestions ---------- */
  const KIT = { sticks: 'Sticks', brush: 'Brushes', rim: 'Rim-click', toms: 'Toms' };
  function tempoLabel(card) { const b = Math.round(card.bpm); return card.pattern.meter === '6/8' ? `6/8 · ♩.=${b}` : `${card.pattern.meter} · ${b} BPM`; }
  function cardHTML(c) {
    const p = c.pattern;
    return `<div class="card sug ${c.kind}" data-id="${c.id}">
      <h3>${p.name}</h3>
      <div class="meta"><span class="chip">${tempoLabel(c)}</span><span class="chip">${KIT[p.kit] || p.kit}</span>${p.feel === 'swing' && p.meter !== '6/8' ? '<span class="chip">Swung</span>' : ''}</div>
      <p>${p.desc}</p>
      <p class="why">${c.why}</p>
      <div class="acts">
        ${st.manual ? '' : `<button class="btn pri" data-prev="${c.id}">▶ With my guitar</button>`}
        <button class="btn ${st.manual ? 'pri' : ''}" data-loop="${c.id}">Loop drums</button>
      </div>
      <div class="prog"><i></i></div>
    </div>`;
  }
  function renderSuggestions() {
    const c = st.cur;
    const r = P.rank({ meter: c.meter, bpm: c.bpm, feel: c.feel }, c.features, { seed: st.seed, exclude: st.shown });
    st.cards = r.matches.concat(r.turns);
    $('matches').innerHTML = r.matches.map(cardHTML).join('');
    $('turns').innerHTML = r.turns.map(cardHTML).join('');
  }

  /* ---------- preview (guitar + drums) ---------- */
  function mix() { const b = +$('bal').value; return { guitar: b <= 50 ? 1 : (100 - b) / 50, drums: (b >= 50 ? 1 : b / 50) * 0.9 }; }
  function planPreview(card) {
    const c = st.cur, gb = P.BEATS[c.meter], Pd = 60 / c.bpm, barDur = gb * Pd;
    const pbd = card.pattern.beats * card.pattern.bars * 60 / card.bpm;
    const unit = Math.max(pbd, barDur);
    let nUnits = Math.max(1, Math.round(10 / unit)); while (nUnits * unit < 2 * barDur - 1e-6) nUnits++; while (nUnits > 1 && nUnits * unit > 16) nUnits--;
    const beats = c.beats;
    const first = st.base.firstOnset;
    const cand = []; for (let i = 0; i < beats.length; i++) if ((((i - c.downbeatOffset) % gb) + gb) % gb === 0 && beats[i] >= first - 0.08) cand.push(i);
    if (!cand.length) cand.push(((c.downbeatOffset % gb) + gb) % gb);
    let start = null, need = 0;
    for (let u = nUnits; u >= 1 && start === null; u--) {
      need = Math.round(u * unit / Pd);
      if (cand.length > 1 && cand[1] + need < beats.length) start = cand[1];
      else if (cand[0] + need < beats.length) start = cand[0];
      if (start !== null) nUnits = u;
    }
    if (start === null) { start = cand[0]; nUnits = 1; need = Math.round(unit / Pd); }
    const drumSec = nUnits * unit; const lead = 0.06; const outSec = lead + drumSec + 0.9;
    const snap = $('snap').checked;
    const key = [start, need, snap, c.bpm, c.meter].join('|');
    let guitar = st.warpCache.get(key);
    if (!guitar) {
      if (snap) {
        const ain = [], aout = [];
        for (let k = 0; k <= need + 1 && start + k < beats.length; k++) { ain.push(beats[start + k]); aout.push(lead + k * Pd); }
        guitar = A.warp(st.samples, st.sr, ain, aout, outSec);
      } else {
        const s0 = Math.round((beats[start] - lead) * st.sr), len = Math.round(outSec * st.sr);
        guitar = new Float32Array(len);
        for (let i = 0; i < len; i++) { const j = s0 + i; if (j >= 0 && j < st.samples.length) guitar[i] = st.samples[j]; }
      }
      const fi = Math.round(0.02 * st.sr); for (let i = 0; i < fi && i < guitar.length; i++) guitar[i] *= i / fi;
      st.warpCache.set(key, guitar);
    }
    return { guitar, lead, drumSec };
  }
  function cardEl(id) { return document.querySelector(`.sug[data-id="${id}"]`); }
  function stopPreview() {
    if (!st.playing) return;
    const el = cardEl(st.playing.id); if (el) { el.classList.remove('playing'); const b = el.querySelector('[data-prev]'); if (b) b.textContent = '▶ With my guitar'; }
    st.playing = null; eng.stopBuffer(); wake(false);
  }
  function preview(id) {
    if (st.playing && st.playing.id === id) { stopPreview(); return; }
    stopAll();
    unlock(false);
    const card = st.cards.find(c => c.id === id); if (!card) return;
    const el = cardEl(id); const btn = el.querySelector('[data-prev]');
    el.classList.add('playing'); btn.innerHTML = '<span class="spin"></span>Mixing';
    const token = {}; st.playing = { id, token };
    setTimeout(async () => {
      try {
        const plan = planPreview(card);
        const buf = await eng.renderPreview(plan.guitar, st.sr, plan.lead, plan.drumSec, card.pattern, card.bpm, mix());
        if (!st.playing || st.playing.token !== token) return;
        await unlock(false);
        btn.textContent = '■ Stop';
        const cur = eng.playBuffer(buf, () => { if (st.playing && st.playing.token === token) stopPreview(); });
        wake(true);
        const bar = el.querySelector('.prog i');
        const step = () => {
          if (!st.playing || st.playing.token !== token) { bar.style.width = '0'; return; }
          bar.style.width = clamp((eng.ctx.currentTime - cur.t0) / cur.dur * 100, 0, 100) + '%';
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      } catch (e) { console.error(e); stopPreview(); warn('Preview failed: ' + e.message); }
    }, 20);
  }

  /* ---------- practice loop ---------- */
  function renderDots(n) { $('pDots').innerHTML = Array.from({ length: n }, (_, i) => `<i class="${i === 0 ? 'one' : ''}"></i>`).join(''); }
  eng.onBeat = (b) => { const d = $('pDots').children; for (let i = 0; i < d.length; i++) d[i].classList.toggle('on', i === b.beat); };
  function pTempoLabel() { const l = st.loop; $('pBpm').textContent = Math.round(l.bpm); }
  function openLoop(id) {
    stopAll(); unlock(false);
    const card = st.cards.find(c => c.id === id); if (!card) return;
    st.loop = { card, bpm: Math.round(card.bpm), running: false };
    $('pName').innerHTML = `${card.pattern.name} <span>${card.pattern.meter === '6/8' ? '6/8 · ♩. per min' : card.pattern.meter + ' · BPM'}</span>`;
    renderDots(card.pattern.beats); pTempoLabel();
    $('player').classList.add('show'); document.body.classList.add('has-player');
    startLoop();
  }
  function startLoop() {
    const l = st.loop; if (!l) return; unlock(false);
    eng.startLoop(l.card.pattern, l.bpm, { fills: $('pFills').checked, crashFirst: false });
    l.running = true; $('pplay').textContent = 'Stop'; wake(true);
  }
  function stopLoop() { eng.stopLoop(); if (st.loop) st.loop.running = false; $('pplay').textContent = 'Play'; const d = $('pDots').children; for (const x of d) x.classList.remove('on'); wake(false); }
  function closeLoop() { stopLoop(); st.loop = null; $('player').classList.remove('show'); document.body.classList.remove('has-player'); }
  function stopAll() { stopPreview(); if (st.loop) closeLoop(); }

  /* ---------- wiring ---------- */
  $('rec').addEventListener('click', startRec);
  $('again').addEventListener('click', () => { window.scrollTo({ top: 0, behavior: 'smooth' }); startRec(); });
  $('skip').addEventListener('click', manualMode);
  $('more').addEventListener('click', () => { stopAll(); st.shown = st.cards.map(c => c.id); st.seed++; renderSuggestions(); $('matches').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  document.querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => {
    const t = b.dataset.t, c = st.cur;
    if (t === 'half') applyChange({ bpm: c.bpm / 2 }); else if (t === 'dbl') applyChange({ bpm: c.bpm * 2 }); else applyChange({ bpm: c.bpm + (+t) });
  }));
  $('segMeter').addEventListener('click', e => { const m = e.target.dataset && e.target.dataset.m; if (m && m !== st.cur.meter) applyChange({ meter: m }); });
  $('segFeel').addEventListener('click', e => { const f = e.target.dataset && e.target.dataset.f; if (f && f !== st.cur.feel) applyChange({ feel: f }); });
  $('snap').addEventListener('change', () => { stopPreview(); });
  $('bal').addEventListener('change', () => { stopPreview(); });
  document.addEventListener('click', e => {
    const pv = e.target.closest('[data-prev]'); if (pv) { preview(pv.dataset.prev); return; }
    const lp = e.target.closest('[data-loop]'); if (lp) { openLoop(lp.dataset.loop); return; }
  });
  document.querySelectorAll('[data-p]').forEach(b => b.addEventListener('click', () => {
    const l = st.loop; if (!l) return; l.bpm = clamp(l.bpm + (+b.dataset.p), 30, 260); eng.setLoopTempo(l.bpm); pTempoLabel();
  }));
  $('pplay').addEventListener('click', () => { if (!st.loop) return; if (st.loop.running) stopLoop(); else startLoop(); });
  $('pClose').addEventListener('click', closeLoop);
  $('pFills').addEventListener('change', () => { if (eng.loop) eng.loop.opts.fills = $('pFills').checked; });
  document.addEventListener('visibilitychange', () => { if (document.hidden && st.rec) stopRec(true); });
})();
