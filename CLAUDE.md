# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

**Paisa Path** is a financial-literacy life-simulation game for Class 11–12 students in Hyderabad. It is being built for the Vanguard India "Community Stewardship" brief and delivered through partner NGOs, with a pilot of about 1,500 students.

The repo is still at the design stage. It has no code, build, lint or test tooling yet. The sources of truth are:

- `docs/Vanguard-ps.pdf`: the original problem statement. It sets the four learning pillars, the success measures and the guardrail.
- `docs/Paisa Path — Product & Component Design.md`: the full product and component design. It covers screens, the engine, the content model, the data model, the stack and the MVP scope. Read the relevant section before building any feature.

When tooling is added, update this file with the real commands.

## Planned architecture

The system has three parts:

1. **An offline-first student PWA** (React + TypeScript). Students play entirely on the phone. A service worker caches the app and content packs, and IndexedDB holds saves and an event queue. Queued events upload when the phone is online. Each event carries a unique ID so the server can ignore duplicates.
2. **A cloud backend** in an India region: Supabase/Postgres with row-level security, or a stateless Node API on Postgres. It only receives queued progress and serves versioned content packs through a CDN.
3. **Staff web tools**:
   - an NGO facilitator dashboard (Next.js) that shares components with the student app;
   - a headless-CMS content studio (Directus or Strapi);
   - Weblate or Crowdin for translation.

Key design decisions that span files:

- **The game engine is pure TypeScript with a seeded RNG.** The same inputs must give the same outputs, because rewinds and tests depend on that. Keep it free of UI and I/O. Its components are the simulation clock, income model, wallet and jars, scenario selector, event deck, effects resolver, goal tracker, Money Health Score, rewind manager, lesson engine, and save and event logger. The simulation runs for 12 months, in weekly steps.
- **Content is data, not code.** Scenarios, quizzes and lesson cards are tagged JSON (pillar, concept, persona, difficulty, region, language). They reach the app in content packs, separately from app releases. Every number the engine uses comes from content packs, so designers can tune the game without code changes. See the scenario schema example in the design doc.
- **All text uses `t:` translation keys.** No string is hard-coded and no words go inside images. Launch languages are Telugu, Urdu (RTL, so the layout mirrors), Hindi and English. Amounts use Indian lakh grouping (₹1,00,000). Adding a language must need only translation files.
- **Choices can have delayed effects.** The effects resolver schedules consequences for later weeks or months, and this is central to how the game teaches.

## Non-negotiable constraints

- **Educate, never recommend.** Use only fictional assets, such as "Steady Deposit", "Mixed Basket" and "Rocket Co". Never name a real fund, stock, bank, app or scheme as something to choose. `AssumptionBanner` is built into `TimeSlider` and `GrowthChart` and must not be hideable. Projections always show good, average and bad ranges, never a single number.
- **Privacy.** Store no real names, phone numbers, birth dates, addresses or bank data. A student is an `anon_id` plus a nickname inside a class, and joins with a class code. Nicknames pass a word filter. There is no student-to-student chat, no ads and no third-party trackers. Data stays in an India region.
- **No real money anywhere.** That means no payments, no bank links and no transactions. The only outbound links allowed are official safety resources, such as the 1930 helpline and cybercrime.gov.in.
- **Low-end devices.** The app must be fully playable offline, keep its initial download small, and use separate module and audio packs. Data-saver and reduced-motion modes turn animations off. Tap targets are at least 48 px, body text is at least 16 px, contrast meets WCAG 2.1 AA, and colour is never the only signal. Sessions last 5–8 minutes.
- Keep Stars, the cosmetic currency, separate from in-game rupees. Leaderboards are class-level only and off by default.

## MVP scope

The MVP covers:

- all four pillars at Levels 1–2;
- all four personas (Ravi, Sana, Kiran and Lakshmi);
- four languages with voice-over;
- XP, badges, streaks, rewind tokens, the Money Health Score and a certificate;
- class codes, a progress heatmap, classroom mode, lesson plans and exports;
- the Hyderabad content pack;
- an installable PWA with offline sync.

Level 3, cosmetics, class challenges, leaderboards and a Play Store build come after the pilot.

`.env` is gitignored.
