// Browser check of the weekly decision loop, as Sana from a fresh save, in en and hi at 360x640:
// map pins → a dialogue decision → consequence → rewind → choose again → rest to day 7 (blocked
// while pins remain, "still to do") → the other pins → the week ends → Month Recap → payday.
//
//   pnpm dev:student                                  # in another terminal
//   node apps/student/tests/decisions.e2e.mjs         # E2E_URL / CHROME_PATH to override
//
// Screenshots go to tests/e2e-output/ (git-ignored).
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = process.env.E2E_URL ?? 'http://localhost:5173/';
const OUT = fileURLToPath(new URL('./e2e-output/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const fails = [];
const check = (ok, msg) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`);
  if (!ok) fails.push(msg);
};

const tap = (p, sel) => p.locator(sel).first().click();

async function fresh(lang) {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => m.type() === 'error' && !/Failed to load resource|fetch/i.test(m.text()) && errors.push(m.text()));
  await p.goto(BASE);
  await p.evaluate(
    (lang) =>
      new Promise((res, rej) => {
        const r = indexedDB.open('keyval-store');
        r.onupgradeneeded = () => r.result.createObjectStore('keyval');
        r.onsuccess = () => {
          const tx = r.result.transaction('keyval', 'readwrite');
          tx.objectStore('keyval').put({ version: 1, nickname: 'Tester', avatar: 'tiger', persona: 'sana', lang, classCode: 'AB12CD', classId: 'c', anonId: 'a' }, 'paisa.profile');
          tx.objectStore('keyval').delete('paisa.game');
          tx.oncomplete = res;
          tx.onerror = rej;
        };
      }),
    lang,
  );
  // From the main screen, so the map is a history entry and back from a place returns to it.
  await p.goto(`${BASE}?seed=42&lang=${lang}`);
  await p.evaluate(() => document.fonts.ready);
  // Calls, texts and sudden events (features/events) are another feature: keep them out of the way.
  await p.evaluate(async () =>
    (await import('/src/features/events/useEvents.ts')).useEvents.setState({ tick: () => {} }),
  );
  await tap(p, '.ms-play');
  await p.waitForSelector('.loc');
  return { p, errors, ctx };
}

// LOCATIONS order in LocationScreen: school, hospital, convenience, home.
const HOME = '.loc >> nth=3';
const shot = async (p, lang, name) => (await p.waitForTimeout(400), p).screenshot({ path: `${OUT}decisions-${lang}-${name}.png` });
const store = (p) => p.evaluate(async () => (await import('/src/game/useGame.ts')).useGame.getState());

/** No text spilling out of buttons or panels, and every button at least 48 px tall. */
async function layout(p) {
  return p.evaluate(() => {
    const bad = [];
    for (const el of document.querySelectorAll('.dc-screen .k-btn, .dc-sheet .k-btn, .dc-bubble, .dc-jar')) {
      if (el.scrollWidth > el.clientWidth + 1) bad.push(`overflow: ${el.className} "${el.textContent.slice(0, 30)}"`);
      if (el.classList.contains('k-btn') && el.getBoundingClientRect().height < 48) bad.push(`short: "${el.textContent.slice(0, 30)}"`);
    }
    if (document.documentElement.scrollWidth > innerWidth + 1) bad.push('page scrolls sideways');
    return bad;
  });
}

/** Rests at Home until the given day (each rest: Home → rest → skip → wake). */
async function restUntil(p, day) {
  for (let i = 0; i < 8; i++) {
    const s = await store(p);
    if (s.life.day >= day) return;
    await tap(p, HOME);
    // Home may hold a pin: then the scene opens first.
    if (await p.locator('.dc-screen').count()) return;
    await tap(p, '.hm-sheet .lf-offer >> nth=1');
    await p.waitForSelector('.rs-screen');
    const skip = p.locator('.rs-skip');
    if (await skip.count()) await skip.first().click();
    await tap(p, '.rs-wake');
    await p.waitForSelector('.loc');
  }
}

for (const lang of ['en', 'hi']) {
  const { p, errors, ctx } = await fresh(lang);
  const pinned = await p.locator('.loc.is-pinned').count();
  check(pinned >= 1, `${lang}: ${pinned} pinned place(s) glow on the map`);
  check((await p.locator('.loc-guide').count()) === 1, `${lang}: a guide arrow points at the first pin`);
  await shot(p, lang, '1-map');

  const plan = (await store(p)).plan;
  check(plan?.personaId === 'sana' && plan.seed === 42, `${lang}: the plan starts for Sana with ?seed=42`);

  // The Shop's sub-map: three spots and the work counter; seed 42 pins the phone shop.
  await tap(p, '.loc >> nth=2');
  await p.waitForSelector('.lf-offer');
  check((await p.locator('.lf-offer').count()) === 4, `${lang}: the Shop shows phone shop, kirana, clothes stall and work`);
  check((await p.locator('.lf-offer.is-pinned').count()) === 1, `${lang}: the pinned spot has a badge`);
  await shot(p, lang, '1b-shop');
  await p.goBack();
  await p.waitForSelector('.loc');

  // The first pin that is on this map (the Bank arrives with the Time Machine).
  await tap(p, '.loc.is-pinned');
  await p.waitForSelector('.dc-choice');
  await shot(p, lang, '2-scene');
  check((await p.locator('.dc-choice').count()) >= 1, `${lang}: the scene offers its choices`);
  check((await layout(p)).length === 0, `${lang}: scene layout ${JSON.stringify(await layout(p))}`);

  await tap(p, '.dc-choice');
  await p.waitForSelector('.dc-sheet');
  await shot(p, lang, '3-consequence');
  check((await p.locator('.dc-lesson').count()) === 1, `${lang}: the consequence shows the lesson`);
  check((await p.locator('.dc-rewind').count()) === 1, `${lang}: rewind is offered`);
  check((await layout(p)).length === 0, `${lang}: consequence layout ${JSON.stringify(await layout(p))}`);

  await tap(p, '.dc-rewind');
  await p.waitForSelector('.dc-choice');
  const back = (await store(p)).plan;
  check(JSON.stringify(back.jars) === JSON.stringify(plan.jars) && back.rewindTokens === plan.rewindTokens - 1, `${lang}: rewind restores the jars and uses a token`);

  await tap(p, '.dc-choice >> nth=-1');
  await p.waitForSelector('.dc-sheet');
  await tap(p, '.dc-sheet .is-primary');
  await p.waitForTimeout(300);
  await shot(p, lang, '4-place-sheet');
  check((await store(p)).plan.seen.length === 1, `${lang}: one decision made`);
  await p.goBack();
  await p.waitForSelector('.loc');

  // Rest to day 7, then try to end the week with a pin still to play.
  await restUntil(p, 7);
  if (await p.locator('.dc-screen').count()) {
    await tap(p, '.dc-choice');
    await tap(p, '.dc-sheet .is-primary');
    await p.waitForTimeout(300);
    await p.goBack();
    await p.waitForSelector('.loc');
    await restUntil(p, 7);
  }
  const left = (await p.evaluate(async () => {
    const { planPins } = await import('/src/features/decisions/plan.ts');
    const { useGame } = await import('/src/game/useGame.ts');
    return planPins(useGame.getState().plan).length;
  }));
  if (left > 0) {
    await tap(p, HOME);
    if (!(await p.locator('.dc-screen').count())) {
      await tap(p, '.hm-sheet .lf-offer >> nth=1');
      await p.waitForSelector('.dc-todo');
      await shot(p, lang, '5-still-to-do');
      check((await store(p)).life.day === 7, `${lang}: the day-7 rest is blocked while ${left} pin(s) remain`);
      await tap(p, '.dc-todo .k-btn');
    }
    // Play every pin that's left, from the "still to do" list or the scene that opened.
    for (let i = 0; i < 4; i++) {
      if (await p.locator('.dc-todo .k-btn').count()) await tap(p, '.dc-todo .k-btn');
      if (!(await p.locator('.dc-choice').count())) break;
      await tap(p, '.dc-choice');
      await tap(p, '.dc-sheet .is-primary');
      await p.waitForTimeout(300);
      await p.goBack();
      await p.waitForSelector('.loc');
      const n = await p.evaluate(async () => (await import('/src/features/decisions/plan.ts')).planPins((await import('/src/game/useGame.ts')).useGame.getState().plan).length);
      if (n === 0) break;
      await tap(p, HOME);
      if (!(await p.locator('.dc-screen').count())) await tap(p, '.hm-sheet .lf-offer >> nth=1');
    }
  }
  // Now the day-7 rest ends the week.
  let s = await store(p);
  if (s.life.week === 1) {
    await tap(p, HOME);
    await tap(p, '.hm-sheet .lf-offer >> nth=1');
    await p.waitForSelector('.rs-screen');
    if (await p.locator('.rs-skip').count()) await tap(p, '.rs-skip');
    await tap(p, '.rs-wake');
    await p.waitForSelector('.loc');
    s = await store(p);
  }
  check(s.life.week === 2 && s.plan.week === 2, `${lang}: the week ends: life week ${s.life.week}, plan week ${s.plan.week}`);
  if (await p.locator('.dc-flash').count()) await shot(p, lang, '6-flashback');
  if (await p.locator('.dc-overlay .is-primary').count()) await tap(p, '.dc-overlay .is-primary');

  // Month end through the demo hook, then the recap and payday.
  await p.evaluate(async () => (await import('/src/features/decisions/demo.ts')).openRecap());
  await p.waitForSelector('.hm-recap');
  await shot(p, lang, '7-month-recap');
  check((await p.locator('.hm-parts li').count()) === 4, `${lang}: the recap shows the score and its four parts`);
  check((await layout(p)).length === 0, `${lang}: recap layout ${JSON.stringify(await layout(p))}`);
  await tap(p, '.hm-recap .is-primary');
  await p.waitForSelector('.dc-jars');
  await shot(p, lang, '8-payday');
  s = await store(p);
  check(s.plan.month === 2 && s.overnight?.payday?.income === 4000, `${lang}: payday starts month 2 (${s.overnight?.payday?.income})`);
  await p.evaluate(async () => (await import('/src/features/decisions/demo.ts')).fireFlashback());
  check(errors.length === 0, `${lang}: no page errors ${JSON.stringify(errors)}`);
  await ctx.close();
}

// A sub-map pin plays inside the Shop, then the store sheet comes back.
{
  const { p, errors, ctx } = await fresh('en');
  await tap(p, '.loc >> nth=2');
  await tap(p, '.lf-offer.is-pinned');
  await p.waitForSelector('.dc-choice');
  await tap(p, '.dc-choice');
  await tap(p, '.dc-sheet .is-primary');
  await p.waitForSelector('.lf-offer');
  const s = await store(p);
  check(s.plan.seen.length === 1 && (await p.locator('.lf-offer.is-pinned').count()) === 0, 'en: the phone shop pin plays in the Shop and the store sheet returns');
  await p.goBack();
  await p.waitForSelector('.loc');
  check(errors.length === 0, `en: no page errors ${JSON.stringify(errors)}`);
  await ctx.close();
}

await browser.close();
console.log(fails.length ? `\n${fails.length} failed` : '\nall passed');
process.exit(fails.length ? 1 : 0);
