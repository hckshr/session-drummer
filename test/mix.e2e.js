// Browser test: click stem locked to the drum grid in 4/4, 3/4 and 6/8; live gains; persistence; loop-mode click.
const { chromium } = require('playwright-core');
const url = process.argv[2] || 'http://localhost:8765/index.html';
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--autoplay-policy=no-user-gesture-required', '--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage(); const errs = []; let ok = true;
  const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) ok = false; };
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await page.addInitScript(() => { window.__mkTake = () => { // synthetic 4/4 strum take at 100 BPM
    const sr = 44100, bpm = 100, sec = 20, x = new Float32Array(sr * sec);
    for (let b = 0; b * 60 / bpm < sec - 1; b++) { const i0 = Math.round((1 + b * 60 / bpm) * sr); const a = b % 4 === 0 ? 0.8 : 0.45; for (let i = 0; i < 6000 && i0 + i < x.length; i++) x[i0 + i] += a * Math.exp(-i / 1500) * Math.sin(i * 0.06 + Math.sin(i * 0.013) * 3); }
    return x; }; });
  await page.goto(url);
  await page.waitForFunction(() => window.__sd.eng.kit, null, { timeout: 30000 });

  // 1) offline: click onsets vs drum onsets on every downbeat, click count per bar, accent on the ONE
  const rows = await page.evaluate(async () => {
    const { eng, P } = window.__sd; eng.ensure(); await eng.ready();
    const onsetNear = (d, sr, t, win) => { // the first strong rise of the 0.5 ms peak envelope in t±win (works under ringing cymbals too)
      const B = Math.round(sr * 0.0005), a = Math.round((t - win) * sr / B), b = Math.round((t + win) * sr / B);
      const e = (j) => { let m = 0; for (let i = j * B; i < (j + 1) * B && i < d.length; i++) if (i >= 0) m = Math.max(m, Math.abs(d[i])); return m; };
      const rises = []; let best = 0;
      for (let k = a; k < b; k++) { const prev = Math.max(e(k - 1), e(k - 2), e(k - 3), e(k - 4)); const r = Math.max(e(k), e(k + 1), e(k + 2)) - prev; rises.push(r); best = Math.max(best, r); }
      for (let k = a; k < b; k++) if (rises[k - a] >= 0.5 * best) return k * B / sr; // first strong attack
      return null;
    };
    const out = [];
    for (const [id, bpm] of [['laidback', 96], ['shuffle', 88], ['brushwaltz', 120], ['jazzwaltz', 140], ['ballad68', 52], ['brush68', 60], ['floor4', 124]]) {
      const p = P.byId[id]; const barDur = 60 / bpm * p.beats; const nBars = 4, lead = 0.06;
      const g = new Float32Array(Math.round((lead + nBars * barDur + 1) * 44100)); // silent guitar
      const st = await eng.renderPreview(g, 44100, lead, nBars * barDur, p, bpm, { loop: false });
      const sr = st.drums.sampleRate, dd = st.drums.getChannelData(0), cd = st.click.getChannelData(0);
      const n = st.grid.n; let maxErr = 0, clicks = 0; const accPk = [];
      // count click onsets
      for (let i = 1; i < cd.length; i++) if (Math.abs(cd[i]) > 0.02 && Math.abs(cd[i - 1]) <= 0.02 && (i === 1 || cd.slice(Math.max(0, i - 600), i - 1).every(x => Math.abs(x) <= 0.02))) clicks++;
      for (let b = 0; b < nBars; b++) {
        const t = lead + b * barDur;
        const tc = onsetNear(cd, sr, t, 0.03), td = onsetNear(dd, sr, t, 0.03);
        if (tc == null || td == null) { maxErr = 999; continue; }
        maxErr = Math.max(maxErr, Math.abs(tc - td) * 1000);
      }
      for (let k = 0; k < n; k++) { const i0 = Math.round((lead + k * barDur / n) * sr); let m = 0; for (let i = i0; i < i0 + 2000; i++) m = Math.max(m, Math.abs(cd[i])); accPk.push(+m.toFixed(2)); }
      out.push({ id, meter: p.meter, n, clicks, expect: n * nBars, maxErrMs: +maxErr.toFixed(2), accPk, gridMs: +(st.grid.cint * 1000).toFixed(2), stepMs: +(60 / bpm / p.sub * 1000).toFixed(2), sub: p.sub });
    }
    return out;
  });
  for (const r of rows) {
    console.log(JSON.stringify(r));
    const nExp = r.meter === '6/8' ? 6 : r.meter === '3/4' ? 3 : 4;
    check(r.n === nExp && r.clicks === r.expect, `${r.id} (${r.meter}): ${r.n} clicks per bar, ${r.clicks}/${r.expect} clicks`);
    check(r.maxErrMs < 8, `${r.id}: click vs drum downbeat max offset ${r.maxErrMs} ms (drum humanize is ±4 ms, sample attack ~4 ms)`);
    check(r.accPk[0] > Math.max(...r.accPk.slice(1)) + 0.1, `${r.id}: the ONE is accented ${r.accPk.join('/')}`);
    if (r.meter === '6/8') check(Math.abs(r.gridMs - r.stepMs) < 0.01, `${r.id}: 6/8 clicks on every eighth (${r.gridMs} ms)`);
  }

  // 2) live: start a preview via a manual-mode card? (needs a take) — use a synthetic take through the analysis path
  await page.evaluate(() => { localStorage.removeItem('sd-mix'); });
  await page.reload(); await page.waitForFunction(() => window.__sd.eng.kit, null, { timeout: 30000 });
  const loaded = await page.evaluate(async () => { if (window.__sd.loadTake) { await window.__sd.loadTake(window.__mkTake(), 44100); return !!window.__sd.st.cur; } return false; });
  check(loaded, 'synthetic take analyzed, suggestions shown');
  await page.tap('.sug [data-prev]'); await page.waitForFunction(() => window.__sd.eng.cur && document.getElementById('player').classList.contains('show'), null, { timeout: 20000 });
  check(await page.evaluate(() => document.getElementById('player').classList.contains('prev')), 'mixer panel opens with the preview');
  const g = async () => page.evaluate(() => { const b = window.__sd.eng.bus; return { guitar: +b.guitar.gain.value.toFixed(3), drums: +b.drums.gain.value.toFixed(3), click: +b.click.gain.value.toFixed(3) }; });
  check(JSON.stringify(await g()) === JSON.stringify({ guitar: 1, drums: 1, click: 0 }), 'default gains guitar 1 / drums 1 / click off ' + JSON.stringify(await g()));
  const curBefore = await page.evaluate(() => window.__sd.eng.cur.t0);
  for (let i = 0; i < 3; i++) await page.tap('#mixer [data-ch="guitar"] [data-d="1"]');
  await page.tap('#mixer [data-ch="drums"] [data-d="-1"]'); await page.tap('#mixer [data-ch="drums"] [data-d="-1"]');
  await page.tap('#clickTog'); await page.waitForTimeout(250);
  let v = await g();
  check(Math.abs(v.guitar - 2.818) < 0.02 && Math.abs(v.drums - 0.501) < 0.01 && Math.abs(v.click - 1) < 0.01, 'live: guitar +9 dB, drums −6 dB, click on ' + JSON.stringify(v));
  check(await page.evaluate(t => window.__sd.eng.cur && window.__sd.eng.cur.t0 === t, curBefore), 'preview kept playing (no re-render) while levels changed');
  check(await page.evaluate(() => document.querySelector('#mixer [data-ch="guitar"] [data-d="1"]').disabled && /\+9 dB/.test(document.querySelector('#mixer [data-ch="guitar"] .mv span').textContent)), 'guitar caps at +9 dB, readout shows it');
  await page.tap('#mixer [data-ch="guitar"] .mute'); await page.waitForTimeout(150);
  check((await g()).guitar < 0.01, 'guitar mute');
  await page.tap('#mixer [data-ch="guitar"] .mute'); await page.waitForTimeout(150);
  check(Math.abs((await g()).guitar - 2.818) < 0.02, 'guitar unmute restores +9 dB');
  for (let i = 0; i < 7; i++) await page.tap('#mixer [data-ch="drums"] [data-d="-1"]');
  check(await page.evaluate(() => document.querySelector('#mixer [data-ch="drums"] [data-d="-1"]').disabled), 'drums − disabled at Off');
  check(await page.evaluate(() => document.querySelector('#mixer [data-ch="drums"] .mv span').textContent) === 'Off', 'drums can go down to Off (−inf)');
  await page.tap('#mixer [data-ch="drums"] [data-d="1"]'); await page.tap('#mixer [data-ch="drums"] [data-d="1"]'); await page.tap('#mixer [data-ch="drums"] [data-d="1"]'); // -24 → -18 → ... 
  // beat counter
  const seen = new Set(); for (let i = 0; i < 40; i++) { const k = await page.evaluate(() => [...document.querySelectorAll('#pDots i')].findIndex(x => x.classList.contains('on'))); seen.add(k); await page.waitForTimeout(60); }
  check([0, 1, 2, 3].every(k => seen.has(k)) && await page.evaluate(() => document.querySelectorAll('#pDots i').length) >= 3, 'beat counter steps through ' + [...seen].sort().join(','));
  await page.screenshot({ path: `${__dirname}/shot-mixer-prev.png` });
  // persistence across reload
  const saved = await page.evaluate(() => localStorage.getItem('sd-mix'));
  await page.reload(); await page.waitForFunction(() => window.__sd.eng.kit, null, { timeout: 30000 });
  check(await page.evaluate(() => JSON.stringify(window.__sd.eng.levels)) === JSON.stringify({ guitar: 9, drums: -18, click: 0 }), 'levels restored after reload ' + await page.evaluate(() => JSON.stringify(window.__sd.eng.levels)) + ' saved ' + saved);
  // loop mode: drum level + click applied, clicks scheduled on beats
  await page.evaluate(async () => { await window.__sd.loadTake(window.__mkTake(), 44100); });
  await page.tap('.sug [data-loop]'); await page.waitForFunction(() => window.__sd.eng.loop, null, { timeout: 20000 }); await page.waitForTimeout(1200);
  const lp = await page.evaluate(() => { const e = window.__sd.eng; return { drums: +e.bus.drums.gain.value.toFixed(3), click: +e.bus.click.gain.value.toFixed(3), guitarRowHidden: getComputedStyle(document.querySelector('#mixer [data-ch="guitar"]')).display === 'none', dots: document.querySelectorAll('#pDots i').length, lit: [...document.querySelectorAll('#pDots i')].some(x => x.classList.contains('on')) }; });
  check(Math.abs(lp.drums - 0.126) < 0.01 && lp.click === 1 && lp.guitarRowHidden && lp.lit, 'loop mode uses the same drum level and click; guitar row hidden; counter lit ' + JSON.stringify(lp));
  await page.screenshot({ path: `${__dirname}/shot-mixer-loop.png` });
  await page.tap('#pClose');
  // live counter in 3/4 and 6/8 previews
  for (const [m, n] of [['3/4', 3], ['6/8', 6], ['4/4', 4]]) {
    await page.tap(`#segMeter [data-m="${m}"]`); await page.waitForTimeout(300);
    await page.tap('.sug [data-prev]'); await page.waitForFunction(() => window.__sd.eng.cur && document.getElementById('player').classList.contains('prev'), null, { timeout: 20000 });
    await page.waitForTimeout(600);
    const r = await page.evaluate(() => ({ dots: document.querySelectorAll('#pDots i').length, n: window.__sd.eng.cur.grid.n, meter: window.__sd.st.cards[0].pattern.meter }));
    check(r.dots === n && r.n === n, `${m} preview (${r.meter} card): counter shows 1–${r.dots}`);
    if (m === '6/8') await page.screenshot({ path: `${__dirname}/shot-mixer-68.png` });
    await page.tap('#pClose');
  }
  console.log('ERRORS:', errs.length ? errs : 'none');
  console.log(ok && !errs.length ? 'ALL PASS' : 'SOME FAILED');
  await browser.close();
})();
