// Browser check for the airplane-mode demo (CLAUDE.md 2, 9): the service worker serves the app
// offline, play goes on with the offline banner, and the event queue flushes on reconnect.
//
//   pnpm --filter student e2e:pwa         # builds with a fake backend, previews, runs this
//
// The build points VITE_SUPABASE_URL at a fake host; every call to it is answered here, so the
// test sees exactly which events reach push_events. Needs a Chromium: set CHROME_PATH, or run
// `pnpm --filter student exec playwright-core install chromium` once.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const BASE = process.env.E2E_URL ?? 'http://localhost:4180/';
const FAKE = process.env.E2E_FAKE_BACKEND ?? 'https://e2e-fake.supabase.co';
const OUT = new URL('./e2e-output/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const fails = [];
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) fails.push(msg); };

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, serviceWorkers: 'allow' });

// The fake Supabase. While "offline" it fails like a dead network.
let offline = false;
const pushed = [];
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
await ctx.route(`${FAKE}/**`, async (route) => {
  if (offline) return route.abort('internetdisconnected');
  const fn = new URL(route.request().url()).pathname.split('/').pop();
  const body = route.request().postDataJSON() ?? {};
  const json = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  if (fn === 'join_class') return json({ anon_id: uuid(1), class_id: uuid(2), default_lang: 'en', endline_open: false, rejoin_code: 'DEMO42' });
  if (fn === 'class_status') return json({ endline_open: false, default_lang: 'en', rejoin_code: 'DEMO42' });
  if (fn === 'push_events') {
    pushed.push(...body.events.map((e) => e.type));
    return json({ accepted: body.events.length });
  }
  return json(null);
});

const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));

// 0. A real student's save on this phone, which the demo must never touch.
const REAL = { version: 1, nickname: 'RealKid', avatar: 'tiger', persona: 'ravi', lang: 'hi', classCode: 'AB12CD', classId: uuid(8), anonId: uuid(9) };
const idbProfile = (db, value) => p.evaluate(([db, value]) => new Promise((res, rej) => {
  const r = indexedDB.open(db);
  r.onupgradeneeded = () => r.result.createObjectStore('keyval');
  r.onsuccess = () => {
    const tx = r.result.transaction('keyval', value ? 'readwrite' : 'readonly');
    const req = value ? tx.objectStore('keyval').put(value, 'paisa.profile') : tx.objectStore('keyval').get('paisa.profile');
    tx.oncomplete = () => res(req.result ?? null);
    tx.onerror = rej;
  };
}), [db, value]);
await p.goto(`${BASE}?screen=none`);
await idbProfile('keyval-store', REAL);

// 1. First visit online: demo mode seeds a save and the service worker installs.
await p.goto(`${BASE}?demo=1&reset=1`);
await p.locator('.ms-play').waitFor();
check(!new URL(p.url()).searchParams.has('reset'), 'reset=1 is dropped after seeding, so a reload keeps the demo');
await p.evaluate(() => navigator.serviceWorker.ready);
await p.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 });
check(true, 'service worker installed and controls the page');
const manifest = await p.evaluate(() => fetch('/manifest.webmanifest').then((r) => r.json()));
check(manifest.name === 'MoneyFollows' && manifest.icons.length >= 2, 'manifest has the name and icons');
await p.waitForFunction(() => document.body.innerText.includes('Demo'), null, { timeout: 5000 }).catch(() => {});
check((await p.locator('.ms-greeting').innerText()).includes('Demo'), 'demo profile greets the demo nickname');
const money = await p.locator('.ms-chip').first().innerText();
check(money.includes('1,240'), `demo wallet seeded (${money.trim()})`);
// Let the first sends (app_open, map) go through.
await p.waitForTimeout(3000);
const before = pushed.length;
check(before > 0, `events reach push_events while online (${before})`);

// 2. Airplane mode: reload comes from the service worker; play continues.
offline = true;
await ctx.setOffline(true);
await p.reload();
await p.locator('.ms-play').waitFor({ timeout: 10000 });
check(true, 'reload offline shows the main screen from the cache');
check((await p.locator('.ms-chip').first().innerText()).includes('1,240'), 'reload offline keeps the demo save');
await p.locator('.sy-bar.is-offline').waitFor({ timeout: 5000 });
check(true, 'offline banner shows');
await p.screenshot({ path: `${OUT}pwa-offline-main.png` });

await p.locator('.ms-play').click();
await p.getByRole('button', { name: /^Shop/ }).click(); // the demo plan pins only the phone shop inside it
await p.locator('.lf-sheet').waitFor();
check(true, 'map -> store works offline');
await p.locator('.lf-offer').first().click(); // Kirana Run
await p.waitForTimeout(800);
await p.screenshot({ path: `${OUT}pwa-offline-store.png` });
const imgs = await p.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src));
check(imgs.length === 0, `every image loaded offline ${imgs.join(' ')}`);
check(await p.locator('.sy-bar.is-offline').count() === 1, 'banner still offline while playing');
check(pushed.length === before, 'nothing is sent while offline');

// 3. Back online: the queue flushes.
offline = false;
await ctx.setOffline(false);
await p.waitForFunction(() => true);
for (let i = 0; i < 20 && !pushed.slice(before).includes('location_selected'); i++) await p.waitForTimeout(250);
const sent = pushed.slice(before);
check(sent.includes('map_opened') && sent.includes('location_selected'), `queued offline events flushed on reconnect (${sent.join(', ')})`);

// 4. Hidden demo panel and settings.
// A new address each time: going to the same one is a reload, which keeps the screen it was on.
let visit = 0;
const home = () => p.goto(`${BASE}?demo=1&visit=${++visit}`);
await home();
await p.locator('.ms-play').waitFor();
for (let i = 0; i < 3; i++) await p.locator('.ms-chip').nth(1).click();
await p.getByRole('dialog', { name: 'Demo panel' }).waitFor();
await p.screenshot({ path: `${OUT}pwa-demo-panel.png` });
await p.getByRole('button', { name: '+₹500' }).click();
check((await p.locator('.ms-chip').first().innerText()).includes('1,740'), 'panel: +₹500 lands in the wallet');
await p.getByRole('button', { name: 'Simulate offline' }).click();
await p.locator('.sy-bar.is-offline').waitFor({ timeout: 3000 });
check(true, 'panel: simulate offline shows the banner');
await p.getByRole('button', { name: /Back online/ }).click();
await p.getByRole('button', { name: 'End the week' }).click();
check((await p.locator('.ms-chip').nth(1).innerText()).includes('Week 3'), 'panel: end the week moves to week 3');
await home();
await p.locator('.ms-play').waitFor();
for (let i = 0; i < 3; i++) await p.locator('.ms-chip').nth(1).click();
await p.getByRole('button', { name: 'kirana' }).click();
await p.waitForTimeout(500);
check(await p.locator('.ms-play').count() === 0, 'panel: jump leaves the main screen');
await home();
await p.getByRole('button', { name: 'Settings' }).click();
await p.getByRole('dialog', { name: 'Settings' }).waitFor();
await p.getByRole('switch', { name: /Data saver/ }).click();
check(await p.evaluate(() => document.documentElement.hasAttribute('data-saver')), 'settings: data saver sets html[data-saver]');
await p.getByRole('radio', { name: /Hindi/ }).click();
await p.getByRole('dialog', { name: 'सेटिंग्स' }).waitFor();
check(true, 'settings: switching to Hindi redraws in Hindi');
await p.screenshot({ path: `${OUT}pwa-settings-hi.png` });
await p.reload();
await p.locator('.ms-play').waitFor();
check(await p.evaluate(() => document.documentElement.hasAttribute('data-saver')), 'settings: data saver survives a reload');
check((await p.locator('.ms-play').innerText()).trim() !== 'Play', 'settings: Hindi survives a reload');

for (let i = 0; i < 3; i++) await p.locator('.ms-chip').nth(1).click();
await p.getByRole('button', { name: 'Injury (hospital bill)' }).click();
await p.waitForTimeout(500);
check(await p.getByRole('dialog', { name: 'Demo panel' }).count() === 0, 'panel closes after firing an event');
await p.screenshot({ path: `${OUT}pwa-demo-injury.png` });
check(await p.locator('.ev-overlay').count() === 1, 'panel: the injury event shows its sheet');

const real = await idbProfile('keyval-store');
check(real?.nickname === 'RealKid' && real.anonId === REAL.anonId, 'the real student save is untouched by the demo');

check(errors.length === 0, `no page errors ${errors.join(' | ')}`);
await browser.close();
if (fails.length) {
  console.log(`\n${fails.length} failure(s)`);
  process.exit(1);
}
console.log('\nall passed');
