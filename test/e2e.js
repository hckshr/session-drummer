const { chromium } = require('playwright-core');
const wav = process.argv[2] || 'shuffle90.wav'; const url = process.argv[3] || 'http://localhost:8765/index.html'; const tag = process.argv[4] || 'shuffle';
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${__dirname}/${wav}`, '--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, permissions: ['microphone'] });
  const page = await ctx.newPage(); const errs = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.__sd.eng.kit, null, { timeout: 30000 });
  console.log('kit:', await page.evaluate(() => { const k = window.__sd.eng.kit; const o = {}; for (const v in k.kit) { const L = k.kit[v]; const s = L[0][0]; let pk = 0, on = 0; for (let i = 0; i < s.length; i++) { if (Math.abs(s[i]) > pk) pk = Math.abs(s[i]); } while (on < s.length && Math.abs(s[on]) < 0.05 * pk) on++; o[v] = L.length + 'x' + L[0].length + ' ' + (s.length / k.sr).toFixed(2) + 's onset ' + (on / k.sr * 1000).toFixed(1) + 'ms'; } return { sr: k.sr, o }; }));
  await page.screenshot({ path: `${__dirname}/shot-${tag}-0.png` });
  await page.tap('#rec'); await page.waitForTimeout(3000);
  await page.screenshot({ path: `${__dirname}/shot-${tag}-1rec.png` });
  await page.waitForTimeout(12500);
  await page.tap('#rec'); await page.waitForTimeout(2500);
  const info = await page.evaluate(() => { const s = window.__sd.st; const c = s.cur; return c && { sr: s.sr, len: s.samples && s.samples.length, bpm: c.bpm, det: c.detected, meter: c.meter, feel: c.feel, desc: c.description, wants: c.wants, cards: s.cards.map(x => x.kind + ':' + x.pattern.name + '@' + Math.round(x.bpm)), conf: document.getElementById('hConf').textContent, warn: document.getElementById('warn').textContent }; });
  console.log(JSON.stringify(info, null, 1));
  await page.screenshot({ path: `${__dirname}/shot-${tag}-2heard.png`, fullPage: true });
  // preview first card
  const t = Date.now();
  await page.tap('.sug [data-prev]'); await page.waitForFunction(() => window.__sd.eng.cur, null, { timeout: 15000 });
  console.log('preview render+start ms', Date.now() - t, await page.evaluate(() => { const b = window.__sd.eng.cur.s.buffer; const d = b.getChannelData(0); let e = 0; for (const x of d) e += x * x; return b.duration.toFixed(2) + 's rms ' + Math.sqrt(e / d.length).toFixed(3); }));
  await page.waitForTimeout(1500); await page.screenshot({ path: `${__dirname}/shot-${tag}-3prev.png` });
  // preview a turn card
  await page.tap('#turns .sug [data-prev]'); await page.waitForTimeout(2500);
  console.log('turn preview playing:', await page.evaluate(() => !!window.__sd.eng.cur));
  // loop
  await page.tap('.sug [data-loop]'); await page.waitForTimeout(2200);
  await page.tap('[data-p="5"]'); await page.waitForTimeout(800);
  console.log('loop:', await page.evaluate(() => ({ running: !!window.__sd.eng.loop, bpm: window.__sd.eng.loop && window.__sd.eng.loop.bpm, bar: window.__sd.eng.loop && window.__sd.eng.loop.bar, ctx: window.__sd.eng.ctx.state, sr: window.__sd.eng.ctx.sampleRate })));
  await page.screenshot({ path: `${__dirname}/shot-${tag}-4loop.png` });
  // change meter & tempo
  await page.tap('#pClose'); await page.tap('[data-t="half"]'); await page.waitForTimeout(300);
  console.log('after half:', await page.evaluate(() => window.__sd.st.cur.bpm + ' ' + window.__sd.st.cards.map(c => c.pattern.name).join(', ')));
  await page.tap('#segMeter [data-m="6/8"]'); await page.waitForTimeout(300);
  console.log('after 6/8:', await page.evaluate(() => window.__sd.st.cur.bpm + ' ' + window.__sd.st.cards.map(c => c.pattern.name + '@' + Math.round(c.bpm)).join(', ')));
  await page.tap('.sug [data-prev]'); await page.waitForTimeout(2500);
  console.log('6/8 preview playing:', await page.evaluate(() => !!window.__sd.eng.cur));
  await page.tap('#more'); await page.waitForTimeout(300);
  // manual mode
  await page.reload(); await page.waitForTimeout(500); await page.tap('#skip'); await page.waitForTimeout(300);
  await page.tap('.sug [data-loop]'); await page.waitForTimeout(1500);
  console.log('manual loop running:', await page.evaluate(() => !!window.__sd.eng.loop));
  await page.screenshot({ path: `${__dirname}/shot-${tag}-5manual.png`, fullPage: true });
  console.log('ERRORS:', errs.length ? errs : 'none');
  await browser.close();
})();
