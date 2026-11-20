// Browser test of the Record flow with a fake mic fed from a padded WAV.
const { chromium } = require('playwright-core');
const wav = process.argv[2] || 'take_shuffle.wav'; const url = process.argv[3] || 'http://localhost:8765/index.html'; const tag = process.argv[4] || 'shuffle';
const maxWait = +(process.argv[5] || 45000);
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${__dirname}/${wav}`, '--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, permissions: ['microphone'] });
  const page = await ctx.newPage(); const errs = [];
  page.on('console', m => { if (m.type() === 'error' || (m.type() === 'warning' && !/ScriptProcessor/.test(m.text()))) errs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.__sd.eng.kit, null, { timeout: 30000 });
  console.log('kit decoded:', await page.evaluate(() => Object.keys(window.__sd.eng.kit.kit).length + ' voices'));
  const states = []; const T0 = Date.now();
  await page.tap('#rec');
  // watch the state machine until results arrive
  let last = '';
  while (Date.now() - T0 < maxWait) {
    const s = await page.evaluate(() => window.__sd.st.listen + '|' + document.getElementById('recSub').textContent);
    const k = s.split('|')[0]; if (k !== last) { states.push(`${((Date.now() - T0) / 1000).toFixed(1)}s ${s}`); last = k; }
    if (k === 'rec' && !states.shotRec) { states.shotRec = 1; await page.screenshot({ path: `${__dirname}/shot-${tag}-1rec.png` }); }
    if (k === 'armed' && !states.shotArm) { states.shotArm = 1; await page.screenshot({ path: `${__dirname}/shot-${tag}-0armed.png` }); }
    if (await page.evaluate(() => !!window.__sd.st.cur && window.__sd.st.listen === 'off')) break;
    await page.waitForTimeout(250);
  }
  console.log('states:\n  ' + states.join('\n  '));
  const info = await page.evaluate(() => { const s = window.__sd.st; const c = s.cur; return c && { take: s.take, bpm: c.bpm, meter: c.meter, feel: c.feel, desc: c.description, micOpen: !!s.mic, cards: s.cards.map(x => x.kind + ':' + x.pattern.name), takeLine: document.getElementById('hTake').textContent }; });
  console.log(JSON.stringify(info));
  await page.screenshot({ path: `${__dirname}/shot-${tag}-2heard.png`, fullPage: true });
  // mic must stay closed: wait and confirm nothing new starts
  await page.waitForTimeout(3000);
  console.log('after 3 s idle: listen =', await page.evaluate(() => window.__sd.st.listen), 'mic open =', await page.evaluate(() => !!window.__sd.st.mic));
  // best-bars preview (looped)
  let t = Date.now();
  await page.tap('.sug [data-prev]'); await page.waitForFunction(() => window.__sd.eng.cur, null, { timeout: 20000 });
  console.log('best-bars preview:', Date.now() - t, 'ms;', await page.evaluate(() => { const c = window.__sd.eng.cur; return `loop ${JSON.stringify(c.loop)} buf ${c.dur.toFixed(2)}s · ` + document.getElementById('hSection').textContent; }));
  await page.waitForTimeout(1500);
  // whole-take preview
  await page.tap('#segPrev [data-v="whole"]'); t = Date.now();
  await page.tap('.sug [data-prev]'); await page.waitForFunction(() => window.__sd.eng.cur, null, { timeout: 30000 });
  console.log('whole-take preview:', Date.now() - t, 'ms;', await page.evaluate(() => { const c = window.__sd.eng.cur; return `loop ${!!c.loop} buf ${c.dur.toFixed(2)}s · ` + document.getElementById('hSection').textContent; }));
  await page.waitForTimeout(1000);
  // loop mode still works
  await page.tap('.sug [data-loop]'); await page.waitForTimeout(1500);
  console.log('drum loop running:', await page.evaluate(() => !!window.__sd.eng.loop));
  await page.tap('#pClose');
  // New take then cancel: previous take must survive
  const before = await page.evaluate(() => window.__sd.st.samples.length);
  await page.tap('#again'); await page.waitForTimeout(800);
  const armed = await page.evaluate(() => window.__sd.st.listen);
  await page.tap('#rec'); await page.waitForTimeout(300);
  console.log(`new take → ${armed}, cancel → ${await page.evaluate(() => window.__sd.st.listen)}, previous take kept: ${await page.evaluate(b => window.__sd.st.samples.length === b && !!window.__sd.st.cur, before)}, warn: ${await page.evaluate(() => document.getElementById('warn').textContent)}`);
  console.log('ERRORS:', errs.length ? errs : 'none');
  await browser.close();
})();
