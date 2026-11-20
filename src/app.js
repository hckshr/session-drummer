(function () {
  'use strict';
  const A = window.SDAnalysis, P = window.SDPatterns, D = window.SDDrums;
  const $ = (id) => document.getElementById(id);
  const eng = new D.Engine();
  const st = { listen: 'off', mic: null, take: null, pmode: 'best', rec: null, samples: null, sr: 0, base: null, cur: null, manual: false, seed: 1, shown: [], cards: [], playing: null, warpCache: new Map(), loop: null, wake: null };
  window.__sd = { st, eng, A, P, D };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // Download + decode the recorded drum kit right away (decoding needs no tap; playback does).
  eng.load(window.SD_KIT_URL || 'kit.json').catch(e => { console.error(e); warn('Couldn\'t load the drum samples. Check your connection and reload.'); });

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

  /* ---------- recording: one tap arms it, it starts on your first notes and stops when you stop ---------- */
  // Explicit flow: Record -> wait for playing -> record -> auto-stop (quiet ~3 s or 60 s max) -> mic closed.
  // A new take only ever starts from a tap, and the previous take stays until a new one succeeds.
  const SENS = { low: { startDb: 18, onsetDb: 12 }, normal: { startDb: 12, onsetDb: 9 }, high: { startDb: 8, onsetDb: 7 } };
  const prefs = Object.assign({ sens: 'normal', stop: '2.8' }, (() => { try { return JSON.parse(localStorage.getItem('sd-prefs') || '{}'); } catch (e) { return {}; } })());
  function listenOpts() { return Object.assign({ stopSec: +prefs.stop, maxSec: 60 }, SENS[prefs.sens] || SENS.normal); }
  const ARM_TIMEOUT = 120; // close the mic if nothing is played for 2 minutes
  function warn(msg) { const w = $('warn'); if (!msg) { w.classList.add('hide'); return; } w.textContent = msg; w.classList.remove('hide'); }
  function fmt(sec) { sec = Math.max(0, Math.floor(sec)); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); }
  function setListen(state, sub) {
    st.listen = state;
    const b = $('rec'); b.className = state;
    const hasTake = !!st.base;
    const L = {
      off: [hasTake ? 'New take' : 'Record', sub || (hasTake ? 'your current take stays until the new one is done' : 'tap, then just start playing')],
      opening: ['<span class="spin"></span>Mic', 'opening the microphone'],
      armed: ['Listening', sub || 'play whenever you\'re ready · tap to cancel'],
      rec: ['Recording', sub || ''],
      busy: ['<span class="spin"></span>Got it', sub || '']
    }[state];
    $('recLabel').innerHTML = L[0]; $('recSub').textContent = L[1];
    const pill = $('status'); pill.className = 'st-' + state + (st.cur && !st.listenVisible ? '' : ' hide');
    $('stText').textContent = state === 'off' ? (hasTake ? 'Take locked in · tap for a new take' : 'Tap to record') : state === 'armed' ? 'Listening · play whenever' : state === 'rec' ? 'Recording ' + (sub || '') : state === 'busy' ? 'Working out the feel…' : 'Opening mic…';
  }
  async function recTap() {
    if (st.listen === 'armed') { closeMic(); setListen('off'); warn(st.base ? 'Cancelled. Your previous take is still here.' : ''); return; }
    if (st.listen === 'rec') { const ev = st.mic && st.mic.L.finish(); if (ev) handleEvent(ev); return; }
    if (st.listen !== 'off') return;
    stopAll(); warn('');
    const resumed = unlock(true);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { warn('This browser does not allow microphone access here. Try Safari or Chrome.'); return; }
    setListen('opening');
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 }, video: false });
    } catch (e) {
      setListen('off'); setSession('playback');
      warn(e && e.name === 'NotAllowedError' ? 'Microphone access was blocked. On iPhone, go to Settings › Safari › Microphone, set it to Ask or Allow, then reload the page.' : 'Could not open the microphone (' + (e && e.name || e) + ').');
      return;
    }
    await resumed;
    const ctx = eng.ctx;
    if (ctx.state !== 'running') { try { await ctx.resume(); } catch (e) {} }
    const src = ctx.createMediaStreamSource(stream);
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    const sink = ctx.createGain(); sink.gain.value = 0;
    const L = new window.SDListener.Listener(ctx.sampleRate, listenOpts());
    const M = { stream, src, proc, sink, L, sr: ctx.sampleRate, t0: performance.now(), heard: false, peak: 0 };
    proc.onaudioprocess = (e) => {
      if (st.mic !== M) return;
      const d = e.inputBuffer.getChannelData(0);
      let p = 0; for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > p) p = a; }
      M.peak = Math.max(p, M.peak * 0.8); if (p > 0.004) M.heard = true;
      for (const ev of L.push(d)) handleEvent(ev);
    };
    src.connect(proc); proc.connect(sink); sink.connect(ctx.destination);
    st.mic = M; setListen('armed');
    const tick = () => {
      if (st.mic !== M) { $('lvl').style.width = '0%'; $('lvlFloor').style.left = '0%'; return; }
      const db = 20 * Math.log10(M.peak + 1e-6);
      $('lvl').style.width = clamp((db + 70) / 70 * 100, 0, 100) + '%';
      if (L.floor !== null) $('lvlFloor').style.left = clamp(((L.state === 'rec' ? L.recFloor : L.floor) + L.o.startDb + 70) / 70 * 100, 0, 100) + '%';
      $('rec').style.setProperty('--lvl', clamp((db + 50) / 50 * 14, 0, 14) + 'px');
      const waited = (performance.now() - M.t0) / 1000;
      if (st.listen === 'rec') { const el = L.t - L.recT0; const sub = `${fmt(el)} · stops when you stop · tap to finish`; $('recSub').textContent = sub; $('stText').textContent = 'Recording ' + fmt(el); }
      if (st.listen === 'armed') {
        if (waited > 4 && !M.heard) warn('I\'m not hearing anything. Check that the mic is not blocked and that the guitar is loud enough.');
        else if (M.heard && $('warn').textContent.startsWith('I\'m not hearing')) warn('');
        if (waited > ARM_TIMEOUT) { closeMic(); setListen('off'); warn('Stopped listening after 2 minutes with no playing. Tap Record when you\'re ready.'); return; }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  function closeMic() {
    const M = st.mic; if (!M) return; st.mic = null;
    try { M.src.disconnect(); M.proc.disconnect(); M.sink.disconnect(); } catch (e) {}
    M.stream.getTracks().forEach(t => t.stop());
    setSession('playback');
  }
  function handleEvent(ev) {
    if (ev.type === 'start') { setListen('rec', '0:00'); warn(''); return; }
    if (ev.type === 'short') { setListen('armed', 'that was too short to use, so I\'m still listening'); return; } // same Record tap: a stray noise doesn't end it
    if (ev.type !== 'take') return;
    const M = st.mic; closeMic(); // done listening: the mic is released until the next tap
    const why = ev.reason === 'max' ? ' (hit the 60 s limit)' : '';
    setListen('busy', `you played ${Math.round(ev.played)} s${why}`);
    const take = ev.take, sr = M ? M.sr : eng.ctx.sampleRate;
    setTimeout(() => { analyzeTake(take, sr, ev); }, 60);
  }
  function analyzeTake(take, sr, ev) {
    let res;
    try { res = A.analyze(take, sr); } catch (e) { console.error(e); res = { ok: false, reason: 'error' }; }
    if (!res.ok) {
      setListen('off');
      warn((res.reason === 'quiet' ? 'That came through very quietly. Move the phone closer to the amp or guitar and try again.' : 'I couldn\'t pick out a clear rhythm in that one. Try a steady strummed or picked part.') + (st.base ? ' Your previous take is still here.' : ''));
      return;
    }
    // the new take replaces the old one only now that it analysed cleanly
    st.samples = take; st.sr = sr; st.take = { sec: take.length / sr, played: ev.played, reason: ev.reason };
    st.base = res; st.manual = false; st.seed = 1; st.shown = [];
    st.cur = A.retrack(res, { bpm: Math.round(res.bpm), meter: res.meter, feel: res.feel, bpmExact: true });
    st.cur.detected = { bpm: res.bpm, meter: res.meter, feel: res.feel };
    st.warpCache.clear();
    setListen('off', `done listening · you played ${Math.round(ev.played)} s`);
    showResults();
  }
  window.__sd.loadTake = (take, sr) => { stopAll(); analyzeTake(take, sr, { played: take.length / sr, reason: 'test' }); }; // test hook
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
    $('hSection').textContent = '';
    setListen(st.listen);
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
      $('hWants').textContent = ''; $('hConf').textContent = ''; $('hTake').textContent = '';
    } else {
      $('hDesc').textContent = c.description;
      $('hWants').textContent = `Sounds like it wants ${c.wants}.`;
      $('hTake').textContent = st.take ? `Take: ${Math.round(st.take.sec)} s after trimming the silence${st.take.reason === 'max' ? ' (stopped at the 60 s limit)' : ''}. It stays put until you tap New take.` : '';
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
  /* ---------- mix: tap −/+ in 3 dB steps, live, remembered ---------- */
  const MIN_DB = -24, MAX_DB = 9, STEP_DB = 3;
  const mixSt = Object.assign({ guitar: 0, drums: 0, click: 0, guitarMute: false, drumsMute: false, clickOn: false }, (() => { try { return JSON.parse(localStorage.getItem('sd-mix') || '{}'); } catch (e) { return {}; } })());
  for (const k of ['guitar', 'drums', 'click']) if (mixSt[k] === null || typeof mixSt[k] !== 'number') mixSt[k] = mixSt[k] === null ? -Infinity : 0; // JSON stores -Infinity as null
  function effLevels() {
    return { guitar: mixSt.guitarMute ? -Infinity : mixSt.guitar, drums: mixSt.drumsMute ? -Infinity : mixSt.drums, click: mixSt.clickOn ? mixSt.click : -Infinity };
  }
  function dbText(db) { return db === -Infinity ? 'Off' : (db > 0 ? '+' : db < 0 ? '−' : '') + Math.abs(db) + ' dB'; }
  function renderMix() {
    document.querySelectorAll('#mixer .mrow').forEach(r => {
      const ch = r.dataset.ch, db = mixSt[ch];
      const off = ch === 'click' ? !mixSt.clickOn : mixSt[ch + 'Mute'];
      r.querySelector('.mv span').textContent = dbText(db) + (off && ch !== 'click' ? ' · muted' : '');
      r.querySelector('.mv b').style.width = (db === -Infinity ? 0 : (db - MIN_DB + STEP_DB) / (MAX_DB - MIN_DB + STEP_DB) * 100) + '%';
      r.classList.toggle('off', off || db === -Infinity);
      const m = r.querySelector('.mute'); m.classList.toggle('on', ch === 'click' ? mixSt.clickOn : off);
      if (ch === 'click') m.textContent = mixSt.clickOn ? 'On' : 'Off';
      r.querySelector('[data-d="1"]').disabled = db >= MAX_DB; r.querySelector('[data-d="-1"]').disabled = db === -Infinity;
    });
  }
  function applyMix() { eng.setLevels(effLevels()); renderMix(); try { localStorage.setItem('sd-mix', JSON.stringify(mixSt)); } catch (e) {} }
  function nudge(ch, d) {
    let db = mixSt[ch];
    if (d > 0) db = db === -Infinity ? MIN_DB : Math.min(MAX_DB, db + STEP_DB);
    else db = db <= MIN_DB ? -Infinity : db - STEP_DB;
    mixSt[ch] = db;
    if (ch === 'click' && d > 0) mixSt.clickOn = true; // turning the click up turns it on
    else if (ch !== 'click' && d > 0) mixSt[ch + 'Mute'] = false;
    applyMix();
  }
  function planPreview(card) {
    const c = st.cur, gb = P.BEATS[c.meter], Pd = 60 / c.bpm, barDur = gb * Pd;
    const pbd = card.pattern.beats * card.pattern.bars * 60 / card.bpm;
    const unit = Math.max(pbd, barDur); // whole bars of both the guitar and the drum pattern
    const beats = c.beats, whole = st.pmode === 'whole';
    const cres = Object.assign({}, c, { firstOnset: st.base.firstOnset, onsets: st.base.onsets });
    let start = null, need = 0, nUnits = 1, section = null;
    if (!whole) {
      // a clean loop of whole bars, aiming for ~12 s (8–16 s), at least 2 bars, at the steadiest spot
      // prefer musical phrase lengths: 4 bars, then 8, 6, 2…, as long as it lands in ~8–16 s
      const per = Math.max(1, Math.round(unit / barDur));
      const pref = [4, 8, 6, 2, 3, 12, 16, 5, 7].filter(b => b % per === 0);
      const pick = pref.find(b => b * barDur >= 7.9 && b * barDur <= 16.5) || pref.find(b => b * barDur <= 16.5) || per;
      nUnits = Math.max(1, Math.round(pick * barDur / unit));
      for (let u = nUnits; u >= 1 && start === null; u--) {
        need = Math.round(u * unit / Pd);
        const b = A.bestSection(cres, need, gb);
        if (b) { start = b.start; nUnits = u; section = b; }
      }
    }
    if (start === null) { // whole take (or fallback): from the first downbeat, as many whole units as fit
      const off = ((c.downbeatOffset % gb) + gb) % gb; start = off;
      for (let i = off; i < beats.length; i += gb) if (beats[i] >= st.base.firstOnset - 0.08) { start = i; break; }
      nUnits = Math.max(1, Math.floor((beats.length - 1 - start) * Pd / unit + 1e-6));
      need = Math.round(nUnits * unit / Pd);
    }
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
    const bars = Math.round(drumSec / barDur);
    return { guitar, lead, drumSec, loop: !whole && $('ploop').checked, from: beats[start], bars, whole: whole || !section };
  }
  function cardEl(id) { return document.querySelector(`.sug[data-id="${id}"]`); }
  function stopPreview() {
    if (!st.playing) return;
    const el = cardEl(st.playing.id); if (el) { el.classList.remove('playing'); const b = el.querySelector('[data-prev]'); if (b) b.textContent = '▶ With my guitar'; }
    st.playing = null; eng.stopBuffer(); wake(false);
    if (st.panel === 'prev') closePanel();
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
        await eng.ready();
        if (!st.playing || st.playing.token !== token) return;
        const plan = planPreview(card);
        const buf = await eng.renderPreview(plan.guitar, st.sr, plan.lead, plan.drumSec, card.pattern, card.bpm, { loop: plan.loop });
        if (!st.playing || st.playing.token !== token) return;
        await unlock(false);
        btn.textContent = '■ Stop';
        $('hSection').textContent = plan.whole ? `Playing your whole take, ${plan.bars} bars from ${fmt(plan.from)}.` : `Playing ${plan.bars} bars from ${fmt(plan.from)} of your take, the steadiest stretch${plan.loop ? ', on loop' : ''}.`;
        const cur = eng.playBuffer(buf, () => { if (st.playing && st.playing.token === token) stopPreview(); }, plan.loop ? { start: plan.lead, end: plan.lead + plan.drumSec } : null);
        wake(true);
        openPanel('prev', `${card.pattern.name} <span>with your guitar · ${tempoLabel(card)}</span>`, buf.grid.n);
        const bar = el.querySelector('.prog i'); let lastCount = -2;
        const step = () => {
          if (!st.playing || st.playing.token !== token) { bar.style.width = '0'; return; }
          const cnt = eng.previewCount(); if (cnt !== lastCount) { lastCount = cnt; litDot(cnt); }
          const el2 = eng.ctx.currentTime - cur.t0; bar.style.width = (cur.loop ? ((Math.max(0, el2 - cur.loop.start) % (cur.loop.end - cur.loop.start)) / (cur.loop.end - cur.loop.start)) * 100 : clamp(el2 / cur.dur * 100, 0, 100)) + '%';
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      } catch (e) { console.error(e); stopPreview(); warn('Preview failed: ' + e.message); }
    }, 20);
  }

  /* ---------- practice loop ---------- */
  // beat counter: 1 2 3 4 (1 2 3 in 3/4, 1–6 in 6/8), the ONE outlined, the current beat lit
  function renderDots(n) { $('pDots').classList.toggle('many', n > 4); $('pDots').innerHTML = Array.from({ length: n }, (_, i) => `<i class="${i === 0 ? 'one' : ''}">${i + 1}</i>`).join(''); }
  function litDot(k) { const d = $('pDots').children; for (let i = 0; i < d.length; i++) d[i].classList.toggle('on', i === k); }
  eng.onBeat = (b) => { if (st.panel === 'loop') litDot(b.count != null ? b.count : b.beat); };
  function openPanel(mode, nameHTML, n) {
    st.panel = mode; const pl = $('player');
    pl.classList.toggle('prev', mode === 'prev'); pl.classList.toggle('loop', mode === 'loop');
    $('pName').innerHTML = nameHTML; renderDots(n); renderMix();
    if (mode === 'prev') $('pplay').textContent = 'Stop';
    pl.classList.add('show'); document.body.classList.add('has-player');
  }
  function closePanel() { st.panel = null; litDot(-1); $('player').classList.remove('show'); document.body.classList.remove('has-player'); }
  function pTempoLabel() { const l = st.loop; $('pBpm').textContent = Math.round(l.bpm); }
  function openLoop(id) {
    stopAll(); unlock(false);
    const card = st.cards.find(c => c.id === id); if (!card) return;
    st.loop = { card, bpm: Math.round(card.bpm), running: false };
    openPanel('loop', `${card.pattern.name} <span>${card.pattern.meter === '6/8' ? '6/8 · ♩. per min' : card.pattern.meter + ' · BPM'}</span>`, D.clickGrid(card.pattern).n);
    pTempoLabel();
    startLoop();
  }
  async function startLoop() {
    const l = st.loop; if (!l) return; unlock(false);
    if (!eng.kit) $('pplay').innerHTML = '<span class="spin"></span>Drums';
    try { await eng.ready(); } catch (e) { warn('Couldn\'t load the drum samples: ' + e.message); $('pplay').textContent = 'Play'; return; }
    if (st.loop !== l) return;
    eng.startLoop(l.card.pattern, l.bpm, { fills: $('pFills').checked, crashFirst: false });
    l.running = true; $('pplay').textContent = 'Stop'; wake(true);
  }
  function stopLoop() { eng.stopLoop(); if (st.loop) st.loop.running = false; $('pplay').textContent = 'Play'; litDot(-1); wake(false); }
  function closeLoop() { stopLoop(); st.loop = null; closePanel(); }
  function stopAll() { stopPreview(); if (st.loop) closeLoop(); if (st.mic) { closeMic(); setListen('off'); } }

  /* ---------- wiring ---------- */
  $('rec').addEventListener('click', recTap);
  $('status').addEventListener('click', () => { window.scrollTo({ top: 0, behavior: 'smooth' }); if (st.listen === 'off') recTap(); });
  $('again').addEventListener('click', () => { window.scrollTo({ top: 0, behavior: 'smooth' }); recTap(); });
  const segSet = (id, attr, val) => document.querySelectorAll('#' + id + ' button').forEach(b => b.classList.toggle('on', b.dataset[attr] === val));
  segSet('segSens', 'v', prefs.sens); segSet('segStop', 'v', prefs.stop); segSet('segPrev', 'v', st.pmode);
  const savePrefs = () => { try { localStorage.setItem('sd-prefs', JSON.stringify(prefs)); } catch (e) {} if (st.mic) st.mic.L.setOptions(listenOpts()); };
  $('segSens').addEventListener('click', e => { const v = e.target.dataset && e.target.dataset.v; if (v) { prefs.sens = v; segSet('segSens', 'v', v); savePrefs(); } });
  $('segStop').addEventListener('click', e => { const v = e.target.dataset && e.target.dataset.v; if (v) { prefs.stop = v; segSet('segStop', 'v', v); savePrefs(); } });
  $('segPrev').addEventListener('click', e => { const v = e.target.dataset && e.target.dataset.v; if (v) { stopPreview(); st.pmode = v; segSet('segPrev', 'v', v); $('ploopRow').classList.toggle('hide', v === 'whole'); } });
  $('ploop').addEventListener('change', () => { stopPreview(); });
  if (window.IntersectionObserver) new IntersectionObserver(es => { st.listenVisible = es[0].isIntersecting; setListen(st.listen, st.listen === 'off' ? undefined : $('recSub').textContent); }).observe($('rec'));
  setListen('off');
  $('skip').addEventListener('click', manualMode);
  $('more').addEventListener('click', () => { stopAll(); st.shown = st.cards.map(c => c.id); st.seed++; renderSuggestions(); $('matches').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  document.querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => {
    const t = b.dataset.t, c = st.cur;
    if (t === 'half') applyChange({ bpm: c.bpm / 2 }); else if (t === 'dbl') applyChange({ bpm: c.bpm * 2 }); else applyChange({ bpm: c.bpm + (+t) });
  }));
  $('segMeter').addEventListener('click', e => { const m = e.target.dataset && e.target.dataset.m; if (m && m !== st.cur.meter) applyChange({ meter: m }); });
  $('segFeel').addEventListener('click', e => { const f = e.target.dataset && e.target.dataset.f; if (f && f !== st.cur.feel) applyChange({ feel: f }); });
  $('snap').addEventListener('change', () => { stopPreview(); });
  document.addEventListener('click', e => {
    const pv = e.target.closest('[data-prev]'); if (pv) { preview(pv.dataset.prev); return; }
    const lp = e.target.closest('[data-loop]'); if (lp) { openLoop(lp.dataset.loop); return; }
  });
  document.querySelectorAll('[data-p]').forEach(b => b.addEventListener('click', () => {
    const l = st.loop; if (!l) return; l.bpm = clamp(l.bpm + (+b.dataset.p), 30, 260); eng.setLoopTempo(l.bpm); pTempoLabel();
  }));
  $('pplay').addEventListener('click', () => { if (st.panel === 'prev') { stopPreview(); return; } if (!st.loop) return; if (st.loop.running) stopLoop(); else startLoop(); });
  $('pClose').addEventListener('click', () => { if (st.panel === 'prev') stopPreview(); else closeLoop(); });
  document.querySelectorAll('#mixer .mrow').forEach(r => {
    const ch = r.dataset.ch;
    r.querySelectorAll('[data-d]').forEach(b => b.addEventListener('click', () => nudge(ch, +b.dataset.d)));
    r.querySelector('.mute').addEventListener('click', () => { if (ch === 'click') { mixSt.clickOn = !mixSt.clickOn; if (mixSt.clickOn && mixSt.click === -Infinity) mixSt.click = 0; } else { mixSt[ch + 'Mute'] = !mixSt[ch + 'Mute']; if (!mixSt[ch + 'Mute'] && mixSt[ch] === -Infinity) mixSt[ch] = 0; } applyMix(); });
  });
  applyMix();
  $('pFills').addEventListener('change', () => { if (eng.loop) eng.loop.opts.fills = $('pFills').checked; });
  document.addEventListener('visibilitychange', () => { if (document.hidden && st.mic) { const ev = st.listen === 'rec' && st.mic.L.finish(); if (ev && ev.type === 'take') handleEvent(ev); else { closeMic(); setListen('off'); } } });
})();
