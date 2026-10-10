// Browser check: map -> School -> classroom quiz -> result -> back, in en and hi, plus
// layout (nothing outside the stage, no text overflow, 48 px buttons) and letterboxing.
//
//   pnpm dev:student                       # in another terminal
//   pnpm --filter student e2e              # E2E_URL / CHROME_PATH to override
//
// Needs a Chromium: set CHROME_PATH, or run `npx playwright install chromium` once.
// Screenshots go to tests/e2e-output/ (git-ignored).
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const BASE = process.env.E2E_URL ?? 'http://localhost:5173/';
const OUT = new URL('./e2e-output/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const fails = [];
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) fails.push(msg); };

async function page(w, h, url = BASE) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(url);
  await p.evaluate(() => document.fonts.ready);
  return { p, errors, ctx };
}

/** Every element inside the stage box, and no text overflowing its box. */
async function layout(p) {
  return p.evaluate(() => {
    const stage = document.querySelector('.cr-stage').getBoundingClientRect();
    const bad = [];
    for (const el of document.querySelectorAll('.cr-stage *')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      if (r.left < stage.left - 1 || r.right > stage.right + 1 || r.top < stage.top - 1 || r.bottom > stage.bottom + 1) bad.push(`outside: ${el.className || el.tagName}`);
    }
    for (const el of document.querySelectorAll('.cr-board, .k-btn, .k-panel')) {
      if (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) bad.push(`overflow: ${el.className} "${el.textContent.slice(0, 40)}"`);
    }
    const tiny = [...document.querySelectorAll('.cr-stage button')].filter((b) => {
      const r = b.getBoundingClientRect(); const s = stage.width / 360;
      return b.classList.contains('k-btn') && r.height / s < 48;
    }).length;
    if (tiny) bad.push(`${tiny} buttons under 48px`);
    return { bad, stage: { x: stage.left, w: stage.width, h: stage.height } };
  });
}

// A fresh student is offered the start-of-term check first; these tests play the practice quiz.
const PRACTICE = /^(Practice quiz|प्रैक्टिस क्विज़)|^(Start|शुरू करो)$/;

async function playThrough(p, tag, pickWrongFirst) {
  await p.getByRole('button', { name: PRACTICE }).click();
  for (let i = 0; i < 5; i++) {
    const opts = p.locator('.cr-options .k-btn');
    const n = await opts.count();
    check(n >= 2 && n <= 4, `${tag} q${i + 1} has ${n} options`);
    const lay = await layout(p);
    check(lay.bad.length === 0, `${tag} q${i + 1} layout ok ${lay.bad.join('; ')}`);
    if (i === 0) await p.screenshot({ path: `${OUT}shot-${tag}-question.png` });
    await opts.nth(pickWrongFirst && i === 0 ? 0 : n - 1).click();
    await p.locator('.cr-feedback').waitFor();
    const correct = await p.locator('.k-btn.is-correct').count();
    check(correct === 1, `${tag} q${i + 1} highlights exactly one right answer`);
    check(await p.locator('.cr-options .k-btn:disabled').count() === n, `${tag} q${i + 1} options locked after answering`);
    const lay2 = await layout(p);
    check(lay2.bad.length === 0, `${tag} q${i + 1} feedback layout ok ${lay2.bad.join('; ')}`);
    if (i === 0) { await p.waitForTimeout(300); await p.screenshot({ path: `${OUT}shot-${tag}-feedback.png` }); }
    await p.locator('.cr-feedback .k-btn').click();
  }
  await p.locator('.cr-score').waitFor();
  const lay = await layout(p);
  check(lay.bad.length === 0, `${tag} result layout ok ${lay.bad.join('; ')}`);
  await p.screenshot({ path: `${OUT}shot-${tag}-result.png` });
  const pips = await p.locator('.cr-pillars li').count();
  check(pips === 4, `${tag} result shows all 4 pillars (${pips})`);
}

// 1. Map -> School -> classroom, play, hardware back returns to the map.
{
  const { p, errors, ctx } = await page(360, 740);
  await p.screenshot({ path: `${OUT}shot-map.png` });
  await p.getByRole('button', { name: 'School' }).click();
  await p.locator('.cr-stage').waitFor();
  check(true, 'school opens classroom');
  await p.screenshot({ path: `${OUT}shot-en-intro.png` });
  const lay = await layout(p);
  check(lay.stage.w === 360 && lay.stage.x === 0, `360x740 phone: stage at 1x full width (${JSON.stringify(lay.stage)})`);
  const logs = [];
  p.on('console', (m) => logs.push(m.text()));
  await playThrough(p, 'en', true);
  check(logs.some((l) => l.includes('quiz finished')), 'onFinish fired with the result');
  await p.getByRole('button', { name: 'Play again' }).click();
  check(await p.locator('.cr-options .k-btn').count() > 0, 'play again starts a new round');
  await p.goBack();
  await p.getByRole('button', { name: 'School' }).waitFor();
  check(true, 'browser/Android back returns to the map');
  await p.getByRole('button', { name: 'School' }).click();
  await p.getByRole('button', { name: 'Back to map' }).click();
  await p.getByRole('button', { name: 'School' }).waitFor();
  check(true, 'back button returns to the map');
  // The app has no favicon yet, so the browser's own /favicon.ico request 404s; ignore it.
  const real = errors.filter((e) => !e.includes('404'));
  check(real.length === 0, `no console errors ${real.join(' | ')}`);
  await ctx.close();
}

// 2. Hindi, same seed is deterministic, layout holds.
{
  const { p, errors, ctx } = await page(360, 740, `${BASE}?screen=classroom&lang=hi&seed=7`);
  await playThrough(p, 'hi', false);
  check(errors.length === 0, `hi: no console errors ${errors.join(' | ')}`);
  await ctx.close();
}
{
  const texts = [];
  for (let k = 0; k < 2; k++) {
    const { p, ctx } = await page(360, 740, `${BASE}?screen=classroom&seed=7`);
    await p.getByRole('button', { name: PRACTICE }).click();
    texts.push(await p.locator('.cr-board').innerText() + (await p.locator('.cr-options').innerText()));
    await ctx.close();
  }
  check(texts[0] === texts[1], 'same ?seed gives the same first question and option order');
}

// 3. Letterboxing on other screens.
for (const [w, h, expect] of [[1280, 800, 'black bars, 1x'], [1440, 1400, 'black bars, 2x'], [360, 560, 'short phone fits']]) {
  const { p, ctx } = await page(w, h, `${BASE}?screen=classroom&seed=3`);
  const lay = await layout(p);
  const s = lay.stage.w / 360;
  const fits = lay.stage.w <= w + 0.5 && lay.stage.h <= h + 0.5;
  const centred = Math.abs(lay.stage.x - (w - lay.stage.w) / 2) < 1;
  const bg = await p.evaluate(() => getComputedStyle(document.querySelector('.cr-screen')).backgroundColor);
  check(fits && centred && bg === 'rgb(0, 0, 0)', `${w}x${h} ${expect}: scale ${s.toFixed(3)}, centred, black bg`);
  await p.screenshot({ path: `${OUT}shot-${w}x${h}.png` });
  await ctx.close();
}

await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASSED');
process.exit(fails.length ? 1 : 0);
