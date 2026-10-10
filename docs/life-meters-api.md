# Life meters API: money, health and sanity

The character has three meters: **money**, **health** and **sanity**. Money is **one common wallet**: every purchase comes out of it and every wage goes into it, with no Needs or Wants jar in between. Three places change the meters:

| Place | Action | Money | Sanity | Limit |
|---|---|---|---|---|
| Convenience store (`convenience`) | **Buy necessities** | −₹100 (a little) | **+3** (slightly up) | as often as money allows |
| Convenience store (`convenience`) | **Buy something you want** | −₹400 (a lot) | **+12** (well up) | as often as money allows |
| Workplace | **Go to work** | +₹200 | **−8** | once per week |
| School (`school`) | **Go to school** | none | **−5** | once per week |

All the numbers are placeholders. They live in one config file so BE-1 can tune them without touching screens. Health is part of the model now, but none of these four actions changes it yet (every `health` value is 0). Hospital events will use it later.

| Status | Item |
|---|---|
| ✅ built (frontend) | `lifeApi` with `shopOffers / buy / work / attendSchool`, the config, `toLifeEvent`, en + hi strings, 15 unit tests (`apps/student/src/features/life/`) |
| 🟡 proposed | Engine: the same four functions in `packages/engine` plus `money` and `vitals` fields on `GameState` (§4). BE-1 to build |
| 🟡 proposed | Backend: three new `SyncEvent` types in `push_events` (§5). BE-2 to build |
| ✅ built | Screens: `MetersBar` on the map and `StoreSheet` at the convenience store (§6) |
| ⬜ todo | Work and school buttons; a shared game store to replace the local state in `App.tsx` (§6) |

> **The backend is not built and must not be built from the frontend lane.** §4 and §5 describe what the frontend expects, so BE-1 and BE-2 can build it to match.

`CLAUDE.md` is still the source of truth for the frozen contracts (§5). Everything here is additive.

---

## 1. Player flow

```
Map ──tap Shop──▶ Store sheet
                   ├─ 🍚 Buy necessities   ₹100 · sanity +3   ──tap──▶ money and sanity update, toast
                   └─ 🎧 Buy something you want ₹400 · sanity +12 ──tap──▶ money and sanity update, toast
                     (an option the wallet can't pay for is greyed out with "Not enough money.")

Map ──tap Workplace──▶ "Go to work"  ──tap──▶ +₹200, sanity −8 (button disabled for the rest of the week)
Map ──tap School─────▶ "Go to school" ──tap──▶ sanity −5, then the Classroom quiz opens as today
```

- The store options can be bought again and again while money lasts. Each buy is one tap and one event.
- Work and school each count once per in-game week. A second tap the same week is blocked with a friendly line, never an error.
- Sleeping at Home ends the week (CLAUDE.md §5.8), so work and school are available again the next week.
- There is no Workplace place on the map yet. It is in CLAUDE.md's "Should" list (Ravi's tiffin stall, Sana's tuition class). Until it exists, put the work button at Home.

## 2. Frontend API (built)

Code: `apps/student/src/features/life/` · `life.ts` (API) · `config.ts` (numbers) · `types.ts` · `life.test.ts` · `content/{en,hi}.json`

Screens call **only `lifeApi`**. Today it is a local stand-in that follows the engine's rules. When BE-1's functions land (§4), `lifeApi` is pointed at them and the screens stay the same.

```ts
lifeApi.shopOffers(state): ShopOffer[]                     // the store's two options, with `affordable`
lifeApi.buy(state, kind: 'necessity' | 'want'): LifeOutcome
lifeApi.work(state): LifeOutcome
lifeApi.attendSchool(state): LifeOutcome
startVitals(): Vitals                                      // { health: 80, sanity: 70 } for a new or old save
toLifeEvent(action, stateBefore, outcome, ctx): LifeSyncEvent | null   // the event to queue (§5)
```

```ts
interface Vitals { health: number; sanity: number }         // whole numbers, 0–100

// The part of GameState these functions read and write. They are generic over it,
// so a full GameState goes in and a full GameState comes out.
interface LifeState {
  month: number; week: number;
  money: number;                                            // one common wallet, whole rupees (§4)
  flags: string[];
  earned: string[];                                         // CLAUDE.md 5.1
  vitals: Vitals;                                           // proposed additive field (§4)
}

interface ShopOffer {
  kind: 'necessity' | 'want';
  label: TKey; hint: TKey; icon: string;
  price: number;                                            // from the common wallet
  health: number; sanity: number;                           // change before clamping
  affordable: boolean;                                      // money >= price
}

interface LifeOutcome<S> {
  state: S;
  delta: { money: number; health: number; sanity: number };  // after clamping
  blocked?: 'not_enough_money' | 'already_worked' | 'already_at_school';
}
```

**Rules (each one has a unit test):**

1. **Necessities are cheaper and lift sanity less than wants.** Work and school lower sanity.
2. **Money is one common wallet and never goes negative** (CLAUDE.md §5.2 rule 3). Both store options spend from it and work pays into it. A purchase the wallet can't pay for is blocked; it does not borrow.
3. **Meters are clamped to 0–100.** `delta` reports what actually changed: buying a want at sanity 98 gives `sanity: +2`.
4. **Work pays once per week.** Its key is `work:<month>:<week>` in `state.earned`, the same idempotency list `earn()` uses.
5. **School counts once per week.** Its key is the flag `school:<month>:<week>`.
6. **A blocked action returns the same state object** and a zero delta, and sends no event.
7. **Pure, deterministic, immutable, serializable.** No clock or randomness, inputs are never mutated (deep-frozen in tests), other `GameState` fields pass through, and the result round-trips through `JSON.stringify`.

**Example:**

```ts
const out = lifeApi.buy(game, 'want');
if (out.blocked) return showLine(t(`life.blocked.${out.blocked}`));
setGame(out.state);
showDelta(out.delta);                  // "−₹400 · Sanity +12"
const ev = toLifeEvent({ kind: 'buy', shop: 'want' }, game, out, { event_id: uuid(), anon_id, class_id, client_ts: new Date().toISOString() });
if (ev) queue.enqueue(ev);             // only once §5 ships; until then, skip
```

## 3. Content and config

`config.ts` holds every number: `START_VITALS`, `SHOP.necessity`, `SHOP.want`, `WORK`, `SCHOOL`, the 0–100 limits and `LIFE_CONTENT_VERSION`.

The strings are `life.*` keys in `content/en.json` and `content/hi.json`, with the same keys in both (a test checks this). The Hindi is a machine draft; a Hindi speaker should check it (CLAUDE.md §7.3).

**Move later:** `config.ts` → `packages/content/life.json` and the strings → `packages/content/i18n/{en,hi}.json`, keys unchanged, so the content linter covers them.

## 4. Engine API (proposed for BE-1, not built)

The frontend expects the engine to add these, with the same behaviour as the stand-in (§2 rules):

```ts
// packages/engine (additive to CLAUDE.md 5.2)
shopOffers(state, content): ShopOffer[]
buy(state, content, kind: 'necessity' | 'want'): { state: GameState; delta: LifeDelta; blocked?: LifeBlock }
work(state, content): { state: GameState; delta: LifeDelta; blocked?: LifeBlock }
attendSchool(state, content): { state: GameState; delta: LifeDelta; blocked?: LifeBlock }
```

**`GameState` additions** (additive, optional so existing saves still load):

```ts
money?: number;                                // the common wallet, whole rupees
vitals?: { health: number; sanity: number };   // missing → treat as START_VITALS
```

- **Money is common.** The store, work and school read and write one balance, `money`. How it relates to the existing `jars` is BE-1's call; the frontend only needs one number to show and spend. Two options that both work for the UI:
  - **(a) `money` replaces the jars as the spendable balance** (simplest). Payday adds income to `money`; the jars stay only as the payday split's labels for the Money Health Score.
  - **(b) `money` is derived:** the sum of the jars. Then `buy` must say which jar it draws from, which brings the jar split back into the store. The frontend prefers (a).
- `earn()` (the paper-route wage) should pay into the same `money`, so every income lands in one place.
- `createGame` sets `money` from the persona's starting money and `vitals` from `content.life.startVitals`.
- `rewind` restores `money` and `vitals` like every other field (snapshots already cover the whole state).
- **Open for BE-1:** should sanity or health feed the Money Health Score (CLAUDE.md §5.3), lower over a week with no wants, or trigger events at low values (for example, sanity under 20 makes a "feeling low" card more likely)? None of this is in the frontend stand-in.

## 5. Backend API (proposed for BE-2, not built)

Each successful action becomes one `SyncEvent` (CLAUDE.md §5.5), queued offline and sent through `push_events`, idempotent on `event_id` like every other event.

| `type` | When | `payload` |
|---|---|---|
| `shop_purchase` | A store purchase goes through | `{ kind: 'necessity' \| 'want', price, health, sanity, month, week }` (price comes out of the common wallet) |
| `work_shift` | A work shift is done | `{ wage, health, sanity, month, week }` |
| `school_attended` | The player goes to school | `{ health, sanity, month, week }` |

`health` and `sanity` are the clamped changes, not the totals. `price` and `wage` are whole rupees. Every value is a number or an id-like string, so it passes the existing payload filter (`^[A-Za-z0-9_.:-]{1,64}$`).

```jsonc
{
  "event_id": "uuid made on the device",
  "anon_id": "…", "class_id": "…",
  "type": "shop_purchase",
  "payload": { "kind": "want", "price": 400, "health": 0, "sanity": 12, "month": 1, "week": 2 },
  "client_ts": "2026-10-10T16:30:00.000Z",
  "content_version": "life-2026-10-10"
}
```

**What BE-2 needs to add:**

1. Add the three values to `SyncEvent['type']` in `packages/shared` (additive; announce it in the team channel).
2. Add them to `event_payload_keys` in the `push_events` migration:

   ```sql
   when 'shop_purchase'   then array['kind', 'price', 'health', 'sanity', 'month', 'week']
   when 'work_shift'      then array['wage', 'health', 'sanity', 'month', 'week']
   when 'school_attended' then array['health', 'sanity', 'month', 'week']
   ```

> ⚠️ **Today's backend (`origin/Backend`) silently skips these events.** `event_payload_keys` returns null for an unknown type, so `push_events` drops the event without counting it. Nothing breaks, but nothing is stored either. Hook the client up to the queue only after step 2 ships.

**Not needed:**

- **No new table.** These rows live in `events`, which already has the `(class_id, type)` index.
- **No endpoint to fetch prices.** The config ships in the app bundle, so the store works offline.
- **No server-side game logic.** The engine on the phone is the source of truth, as for decisions.

**Optional for the dashboard:** a `class_wellbeing(class_id)` RPC (facilitator-only, same RLS check as `class_progress`) returning, per student, the counts of necessity vs want purchases and the work/school shifts. It would show who is overspending on wants. Ask the dashboard owner first; it is not on the demo path.

## 6. UI

### 6.1 Built

| Component | File | What it does |
|---|---|---|
| `MetersBar` | `MetersBar.tsx` | Fixed panel at the top of the map: money (₹, Indian grouping), health and sanity, each with a pixel icon, label, number and, for the two meters, a 0–100 bar (`role="meter"`). After an action a "+12" / "−₹400" pop shows next to the number (green up, red down; the sign is always in the text). |
| `StoreSheet` | `StoreSheet.tsx` | Bottom sheet over the dimmed map with the two cards from `lifeApi.shopOffers(state)`: icon, label, hint, price and sanity change. Tapping buys through `lifeApi.buy` and reports `onBuy(kind, outcome)`; a status line says what changed. A card the wallet can't pay for is greyed out with "Not enough money." and stays readable (`aria-disabled`, not `disabled`, so screen readers still reach it). |
| `PixelIcon` | `PixelIcon.tsx` | 8×8 pixel icons as SVG (coin, heart, smile, sack, headphones), so they look the same on every phone instead of depending on the emoji font. |

- **Wiring (`App.tsx`):** tapping the convenience store pushes a `store` history entry, so the close button, a tap on the dim area, Escape and **Android back** all close the sheet (CLAUDE.md §6). `?screen=store` opens it directly.
- The meters bar sits above the sheet's overlay so purchases show live.
- **Life state lives in `App.tsx`** (`startLife()`: ₹2,000, health 80, sanity 70) until the shared game store exists; nothing is saved across reloads yet.
- Motion: the sheet rises in 180 ms and pops fade in 1.2 s; with `prefers-reduced-motion` neither animates and the pop just shows.
- Strings: `life.meters.*`, `life.meter.*`, `life.store.*` in en and hi.

### 6.2 Still to build

- **Work and school buttons:** one main button each. After use, disable it with the `already_*` line until the week ends.
- **Shared game store:** move the life state out of `App.tsx` into the game store (with `money` and `vitals` from the engine, §4), saved to IndexedDB.
- **Sync:** queue `toLifeEvent(...)` in `onBuy` once the backend accepts the events (§5).
- Every word through the `life.*` keys, in en and hi. Tap targets at least 48 px at 360 px wide.
- Frame wants without shaming (CLAUDE.md §7.2 tone): a want is a fair choice that costs more, not a mistake.

## 7. Testing

| Command | What it checks |
|---|---|
| `pnpm --filter student test` | the 15 life tests plus the classroom tests |
| Browser, 360×640, en and hi | map → Store → buy a want (money −₹400, sanity +12, pops show) → keep buying until both cards grey out → Android back closes the sheet; no text overflow, no sideways scroll, no console errors |
| `pnpm --filter student typecheck` | types |

The life tests cover: the config's ordering (rule 1), each action's money and sanity change, blocking when the wallet is short, repeat buys, once-per-week work and school and their reset next week, clamping at 0 and 100, immutability with extra `GameState` fields, determinism and JSON round-trip, `affordable`, the event payloads and their backend filter, no event when blocked, and en/hi key parity.
