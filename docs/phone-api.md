# Phone API: the character's phone

The phone opens from the phone button on the map and main screen. It works like a real phone: a status bar, a home screen with four apps, a home bar at the bottom, and Android back going up one level at a time.

| App | What it does | Code |
|---|---|---|
| **Messages** | Inbox and chat threads: scams to spot and real offers (unchanged, see `docs/life-meters-api.md`) | `features/phone/MessagesApp.tsx` |
| **Phone** | Recent calls; incoming calls ring full screen over the map or main screen. Answer → the caller speaks, you pick a reply → outcome. Decline → a missed call you can call back | `features/phone/CallsApp.tsx`, `IncomingCall.tsx` |
| **Vanguard** | "Vanguard Learn": My money (wallet, owe, health, sanity), a **Growth explorer** (the Time Machine: monthly amount slider × 1/5/10/20 years → low / average / high with the assumption banner), tips of the week, the 1930 helpline | `features/phone/VanguardApp.tsx` |
| **Snake** | Classic Snake. Swipe, arrow keys or the on-screen pad. Best score saved. A finished game with a score gives **sanity +3, once per in-game week**. Never money | `features/phone/SnakeApp.tsx`, `snake.ts` |

| Status | Item |
|---|---|
| ✅ built | Phone shell, all four apps, incoming calls, 2 calls (a "bank officer" OTP scam, Ammi asking for groceries), Snake, Vanguard app; en + hi; tests |
| ✅ built | Calls send `event_triggered`, Snake sends `minigame_complete`: both accepted by `push_events` today |
| ✅ built (client) | Acceptors for the Vanguard feed (tips + growth rates) with offline fallback |
| 🟡 proposed | Backend: `vanguard` field on `class_status` (§3) and the `phone_app_opened` event (§4). BE-2 to build |

> **Guardrails (CLAUDE.md 7.2).** The Vanguard app educates and never recommends: no products, no "you should invest", no guarantees. Every projection is a range from `projectGrowth`, always with the assumption banner. The footer says "Learning only. Fictional money. Not advice to buy anything." Using the Vanguard name in the student app should be confirmed with the Vanguard programme team.

## 1. Navigation

Each level is a history entry `{ screen: 'phone', app?, item? }`:

```
map / main ──phone button──▶ home screen ──tap app──▶ app ──tap thread/call──▶ item
            ◀──────────────── back ───────────────── back ◀──────────── back
```

- The home bar goes straight to the home screen (or closes the phone from home).
- A banner or ringing call opens the phone directly at the item; back still walks out item → app → home → map.
- Calls ring only on the map and main screen, never over a scene, and wait while a sudden event is open. Message banners wait while a call rings.

## 2. Frontend API (built)

`features/phone/api.ts`:

```ts
loadVanguardFeed(student): Promise<VanguardFeed>   // { tips: string[], rates: { low, avg, high } }
normalizeFeed(raw): VanguardFeed                   // makes any server value safe (below)
trackSnake(score): void                            // minigame_complete { game: 'snake', score }
trackPhoneApp(app): void                           // phone_app_opened { app }, off until §4 ships
```

`features/events/useEvents.ts` (calls, additive to the store):

```ts
calls: CallLogItem[]          // { id, status: 'missed' | 'answered', choice?, delta? }, newest first
ringing: string | null        // the call ringing now (not saved; a reload misses it)
declineCall(), pickUp(id), answerCall(id, choiceId)   // answerCall tracks event_triggered
```

**`normalizeFeed` rules (tested):**

| Server sends | App uses |
|---|---|
| nothing, or offline | last saved feed, else every bundled tip and `GROWTH_RATES` (4 / 8 / 12 %) |
| `tips` | only ids the app has strings for, in the given order, no duplicates; none valid → all tips |
| `growth_rates` | only if all three are numbers in 0–0.30 and low ≤ avg ≤ high; else `GROWTH_RATES` |

The request waits at most 1.5 s; a good answer is cached in IndexedDB (`paisa.phone.vanguard`).

## 3. Backend: Vanguard feed on `class_status` (proposed)

An additive `vanguard` field, so the programme team can pick each week's tips and set the compliance-approved rates without an app update:

```jsonc
// class_status → { endline_open, default_lang, rejoin_code, classroom?, vanguard? }
"vanguard": {
  "tips": ["tip.otp_never", "tip.emergency_fund"],       // ids of bundled tips; never free text
  "growth_rates": { "low": 0.04, "avg": 0.08, "high": 0.12 }
}
```

- **Tips are ids, not text.** Tip strings ship in the app (`features/phone/content`, en + hi), are reviewed like other content, and work offline. New tips are a content change (BE-1); the server only chooses which to show.
- **Growth rates** are global (one approved set), so a single `app_config` row read by `class_status` is enough. They replace the placeholders in `@paisa/shared` `GROWTH_RATES` once Vanguard compliance confirms them (CLAUDE.md 5.4 open question).
- BE-2: add the field to `ClassStatus` in `packages/shared` (additive; announce it).

## 4. Backend: events

| `type` | Status | When | `payload` |
|---|---|---|---|
| `event_triggered` | ✅ accepted | A call is answered with a reply | `{ eventId, choiceId, month, week }` (eventId like `call.bank_officer.01`) |
| `minigame_complete` | ✅ accepted | A Snake game ends | `{ game: 'snake', score }` |
| `phone_app_opened` | 🟡 proposed | An app is opened from the home screen | `{ app: 'messages' \| 'calls' \| 'vanguard' \| 'snake' }` |

For `phone_app_opened`, BE-2 adds the type to `SyncEvent['type']` in `packages/shared` and `when 'phone_app_opened' then array['app']` to `event_payload_keys`; then set `PHONE_APP_OPENED_ACCEPTED = true` in `features/phone/api.ts`. Until then nothing is sent (an unknown type would be rejected and dead-lettered).

Optional for the dashboard: scam calls answered vs hung up per student, from `event_triggered` rows whose `eventId` starts with `call.`, the same way `class_wellbeing` reads life events.

## 5. Testing

- `phone.test.ts`: Snake (deterministic food, one cell per step, no 180° turns, eat/grow/score, wall and self crashes, immutability, speed curve), `normalizeFeed` (defaults, tip filtering, rate validation), growth range ordering, calls (scheduled, scam has a safe choice and warning signs, scam never takes the wallet below ₹0), en/hi key parity, and the "educate, never recommend" wording check.
- Browser (360×740, en and hi): Ammi's call rings → decline → missed badge → home screen badges → Messages reply → outcome → home bar → Phone → call back → outcome → Vanguard (20 years changes the range) → Snake start → game over → Android back out to the map. Run with `scrollIntoView` returning a Promise, as newer Chrome does, to cover the crash below.

**The crash this replaced.** `useEffect(() => el.scrollIntoView({ behavior: 'smooth' }), …)` returned the call's result as the effect's cleanup. Newer Chrome returns a Promise from smooth scrolling, so React later called the Promise and threw "destroy is not a function", blanking the app (the "stuck on cyan" bug). Every effect now has a block body, and ESLint (`eslint.config.js`, apps) rejects the shorthand form.
