# Paisa Path — Product & Component Design

Oct 10, 2026 · @Ojas

## Overview

Paisa Path is a mobile-first life-simulation game. Class 11–12 students in Hyderabad manage a character's money for 12 in-game months, make weekly decisions and see the consequences in a safe sandbox. It covers Vanguard India's four learning pillars, launches with about 1,500 students through partner NGOs, and is built to scale to new cities and languages.

| Brief principle | How the product delivers it |
| --- | --- |
| Simple + relatable | Every concept appears as an everyday decision: phone recharge, bus pass, festival spending, college fees. Jargon always comes with a one-line "what this means". |
| Interactive + fun | Story-driven weeks, mini-games, badges, streaks and class challenges. |
| Safe to explore | Fictional money only. Any decision can be rewound. Mistakes earn lesson cards, not penalties. |
| Learn by doing | Every module runs the same loop: choose, see the consequence, reflect, try again. |
| Educate, don't recommend | No real products, funds or returns. Every projection is labelled as an assumption. |
| Privacy-conscious | No names, phone numbers or bank data. Students join with a nickname and a class code. |

Design targets: sessions of 5–8 minutes, playable on entry-level Android phones over patchy data, usable by a first-time player without a facilitator's help.

## Users & personas

The product serves one primary user, the student, and four supporting roles who deliver, write and review the experience.

| Role | Who they are | What they need from the product |
| --- | --- | --- |
| Student | Ages 16–18, Classes 11–12, government and low-fee schools and junior colleges; often on a shared family phone; reads Telugu, Urdu, Hindi or English | A fun game that feels like their life, works offline, and never makes them feel judged |
| NGO facilitator | Runs sessions in schools and community centres | Class codes, a live classroom mode, lesson plans and a view of who is stuck |
| NGO programme admin | Manages rollout across many schools | Rollout status, completion and learning gains across classes |
| Content author | Vanguard volunteers and NGO educators | A simple way to write, translate and update scenarios without a developer |
| Vanguard programme team | Owns the initiative and compliance | Content review before publishing and aggregate impact reports |

### In-game personas

Students pick a character at the start. Each persona changes starting money, income pattern, goals and which life events appear, which delivers the brief's "persona-led" measure. Amounts are illustrative in-game values.

| Persona | Context | In-game income | Goal | What they mostly learn |
| --- | --- | --- | --- | --- |
| Ravi, 17 | Helps at his father's tiffin stall in the Old City | ₹3,000 a month, varies with sales | Second-hand bike, ₹25,000 | Needs vs. wants, saving towards a goal |
| Sana, 18 | First in her family heading to college; teaches tuition | ₹4,000 a month, steady | College admission fees | Budgeting, emergency fund, planning ahead |
| Kiran, 17 | Weekend helper for a delivery business | ₹2,000–5,000 a month, irregular | A laptop for studies | Managing irregular income, smoothing spending |
| Lakshmi, 16 | No job; pocket money from family | ₹800 a month | A gift for her mother's birthday | Small saving habits, staying safe from scams |

### Financial maturity levels

A short onboarding quiz places each student at one of three levels. The level sets the difficulty of choices, how often surprise events appear and how much guidance is shown.

1. **Starter:** fewer choices per card, more hints, no investing until Module 2 is done.
2. **Explorer:** standard game.
3. **Planner:** bigger goals, irregular income events, harder scam messages.

## System architecture

The system has three parts: an offline-first student app, a small cloud backend in an India region, and web tools for NGO and Vanguard staff.

&#91;embedded content: system architecture · student app, cloud backend, staff tools\]

Students play entirely on the phone; the cloud only receives queued progress and sends down content packs. Staff publish content through the studio and read class results through the NGO dashboard.

## Student app: screens and navigation

The student app has four bottom tabs and 18 screens, and a new student reaches their first decision within 3 minutes.

**Bottom tabs:** My Month (home) · Learn (module map) · Challenges · Me (profile and badges).

**First-run flow:**

1. Choose language
2. Join class with a code or QR scan
3. Pick a nickname and build an avatar
4. Baseline quiz (10 questions, about 4 minutes)
5. Choose a persona
6. Three-card "how to play" tutorial
7. First week begins

| # | Screen | Purpose | Key components |
| --- | --- | --- | --- |
| 1 | Language picker | Pick Telugu, Urdu, Hindi or English | LanguageSwitcher, AudioButton |
| 2 | Join class | Enter or scan the facilitator's class code | CodeInput, QRScanner |
| 3 | Profile setup | Nickname, avatar, 4-picture PIN for shared phones | AvatarBuilder, PicturePIN |
| 4 | Profile switcher | Several students on one phone | ProfileTile, PicturePIN |
| 5 | Baseline quiz | Pre-test across all four pillars | QuizQuestion, ProgressBar |
| 6 | Choose persona | Pick a character to play | PersonaCard carousel |
| 7 | My Month (home) | Wallet, jars, this week, next event, streak | WalletCard, JarCard, WeekStrip, StreakCounter |
| 8 | Decision | A story moment with 2–4 choices | DecisionCard, ChoiceButton, AudioButton |
| 9 | Consequence | What happened, how jars changed, the lesson | ConsequenceSheet, JarDelta, LessonCard, RewindButton |
| 10 | Month-end report | Monthly summary, health score, reflection prompt | ScoreRing, SummaryList, ReflectionPrompt |
| 11 | Learn map | Four pillar "islands" with levels and locks | ModuleMap, LevelNode |
| 12 | Mini-game | Module-specific games (see Learning modules) | Per-game components |
| 13 | Module quiz | 5 questions with instant explanations | QuizQuestion, FeedbackPanel |
| 14 | My Notes | Every lesson card collected so far | LessonCard list, search |
| 15 | Challenges | Weekly class challenge and class progress | ChallengeCard, ClassGoalBar |
| 16 | Me | Badges, XP, certificates | BadgeTile grid, XPBar, CertificateCard |
| 17 | Settings | Language, sound, text size, voice-over, data saver | Toggle, Slider, LanguageSwitcher |
| 18 | Help | Replay tutorial, glossary, safety helplines | GlossaryList, HelpCard |

Offline state, sync status and errors appear as banners on every screen, not as separate screens.

## Game engine

The engine runs a 12-month simulation in weekly steps on the phone, and every number it uses comes from content packs, so designers can tune the game without code changes.

&#91;embedded content: core game loop · weekly and monthly cycles\]

Each month starts with payday and a jar split, then four weekly decisions; a surprise life event can interrupt any week. After week 4 the month-end report scores the month and asks one reflection question. After 12 months the persona's story ends with a year review.

### Engine components

| Component | Responsibility |
| --- | --- |
| Simulation clock | Advances weeks and months; triggers payday, decisions, events and month-end |
| Income model | Steady, seasonal or irregular income per persona |
| Wallet and jars | Holds balances; handles transfers between jars; blocks overspending unless the player borrows |
| Scenario selector | Picks the next decision card by module, persona, level and what the student hasn't seen; serves more of what they got wrong |
| Event deck | Surprise events weighted by persona and maturity level, drawn with a seeded random generator |
| Effects resolver | Applies a choice's effects to jars, goal and score; schedules delayed effects |
| Goal tracker | Tracks progress towards the persona's goal and celebrates milestones |
| Money Health Score | Calculates the 0–100 score and its parts at month-end |
| Rewind manager | Snapshots state before each decision and restores it when a rewind token is used |
| Lesson engine | Picks the lesson card for each outcome and the month-end reflection question |
| Save and event logger | Saves state on the phone and adds each decision to the sync queue |

**Delayed consequences** are what make the game teach: cheap earphones break two weeks later, a loan-app shortcut brings repayments next month, and an emergency fund quietly saves the day when the phone screen cracks.

## Learning modules

Each of the four pillars is a module with three levels, one signature mini-game and a 5-question quiz, and all four share the same structure.

**Module structure:** 60-second intro story → Level 1, 2, 3 (each 3–5 decision cards plus the mini-game) → module quiz → badge and lesson summary.

| Module | Signature mini-game | Sample scenarios | Concepts covered |
| --- | --- | --- | --- |
| 1. Plan & budget | **Jar Splitter:** drag the month's money into Needs, Wants, Goals and Savings jars, then live through the month to see if the plan holds | Phone recharge vs. new earphones; Bonalu, Eid or Diwali spending; a friend's birthday treat; monthly bus pass vs. daily autos | Needs vs. wants, opportunity cost, setting a goal, a simple budget split |
| 2. Save & manage | **Life Happens:** a deck of surprise events tests the emergency fund meter | Cracked phone screen; a family hospital visit; exam fee due early; prices rise mid-month; a friend asks to borrow money | Emergency fund, tracking spending, impulse buys, savings account basics, borrowing safely |
| 3. Understand investing | **Time Machine:** a slider shows how a monthly amount could grow over 1, 5, 10 and 20 years under assumed rates. **Basket Builder:** spread coins across fictional assets and watch good and bad years | Saving ₹500 a month from age 18 vs. 28; putting everything into one "hot tip" vs. spreading it | Risk and return, time, compounding, diversification, inflation |
| 4. Stay financially safe | **Scam or Safe?:** swipe real-looking SMS and WhatsApp messages left or right. **Message Inspector:** tap the suspicious parts of a message | "Update your KYC" link; lottery prize message; job offer that asks for a fee; instant loan apps; betting apps; UPI collect requests and "scan to receive money" QR codes | Never share OTP or PIN, how collect requests work, spotting urgency and too-good-to-be-true offers, reporting to the 1930 cyber crime helpline |

Investing uses only fictional assets, such as "Steady Deposit", "Mixed Basket" and "Rocket Co". Every projection shows an assumption banner and a range of good, average and bad outcomes, never a single promised number.

### Unlock order

Modules 1 and 4 are open from day one, because budgeting and scam safety are the most immediately useful. Module 2 unlocks after Module 1 Level 1, and Module 3 unlocks after Module 2 Level 1, since compounding makes more sense once saving is a habit.

## Gamification & assessment

Rewards favour learning and class teamwork over individual ranking, so no student is shamed for a low score.

### Reward components

| Component | How it works | Why it's designed this way |
| --- | --- | --- |
| XP and levels | Earned for decisions, mini-games and quizzes; more XP for reflecting after a mistake | Rewards learning, not just "winning" |
| Stars | A separate reward currency for cosmetics (avatar outfits, stall decorations) | Kept apart from in-game rupees so money concepts stay clean |
| Badges | Named for skills: Scam Spotter, Rainy Day Ready, Goal Getter, Patient Investor, Budget Boss | Gives a visible record of what was learned |
| Weekly streak | Counts weeks with at least one session; one free "pause" a month | Forgiving for students who share a phone |
| Money Health Score | 0–100 for the character, built from savings rate, emergency fund, goal progress and debt; tap to see each part | Shows that money health has several parts |
| Rewind tokens | Three per month to undo a decision and try another path | Makes it safe to experiment |
| Class challenges | The whole class works towards a shared goal, such as spotting 500 scams in a week | Builds teamwork; facilitators can celebrate it in class |
| Leaderboard | Optional, class-level only, nicknames only, off by default | Facilitators choose whether competition suits their group |
| Certificate | Printable PDF after all four modules; the NGO can add the real name offline | A tangible reward without storing real names |

### Assessment components

| Component | What it measures | Format |
| --- | --- | --- |
| Baseline quiz | Starting knowledge across the four pillars | 10 questions, taken at onboarding |
| Module quizzes | Understanding of each module | 5 questions with instant explanations |
| End-line quiz | Learning gain | 10 questions, a parallel version of the baseline at equal difficulty |
| Confidence check | Self-rated confidence with money | One 1–5 rating at start and end |
| Behaviour signals | Whether learning shows up in play | Emergency fund kept, scams caught, goal reached |
| Retention check | Whether learning lasts | Short 5-question quiz 4 weeks after finishing |

Every question in the bank is tagged by pillar, concept, difficulty and language, so quizzes can be assembled automatically and compared across versions.

## UI component library

About 30 reusable components build every student screen, so new modules are assembled rather than designed from scratch.

### Design tokens

| Token group | Decision |
| --- | --- |
| Colour | Each jar has a fixed colour plus an icon and label: Needs (teal), Wants (amber), Goals (purple), Savings (green). Status colours for good, warning and risk. Never colour alone. |
| Typography | Noto Sans family, which covers Telugu, Devanagari and Urdu scripts (Noto Nastaliq Urdu for Urdu). Body text at least 16 px. |
| Spacing and shape | 8 px grid, rounded 12 px cards, large tap targets of at least 48 px |
| Motion | Short, purposeful animations (coins moving into jars, badge pop); turned off in data-saver or reduced-motion mode |
| Illustration | Flat, local-feeling scenes: chai stall, bus stop, phone shop, college gate; diverse characters |

### Components

| Group | Component | Used for |
| --- | --- | --- |
| Layout | AppShell, BottomNav, TopBar | Frame of every screen; TopBar shows wallet balance |
| Money | WalletCard | Current in-game money and income date |
| Money | JarCard | One jar with fill level; a drag target in Jar Splitter |
| Money | JarDelta | Animated "+₹200 / −₹150" changes after a decision |
| Story | DecisionCard | Illustration, story text, voice-over and 2–4 choices |
| Story | ChoiceButton | One choice with an icon and short label |
| Story | ConsequenceSheet | Bottom sheet showing the outcome of a choice |
| Story | LessonCard | The takeaway in one sentence plus "what this means" |
| Story | EventCard | A surprise life event |
| Story | ReflectionPrompt | One question at month end, answered by tapping |
| Games | SwipeCard | Scam or Safe? cards |
| Games | MessageInspector | Fake SMS or chat screen with tappable suspicious parts |
| Games | TimeSlider and GrowthChart | Time Machine projection, always with AssumptionBanner |
| Games | BasketBuilder | Drag coins into fictional assets |
| Progress | XPBar, ScoreRing, StreakCounter | Progress indicators |
| Progress | BadgeTile, CertificateCard | Rewards |
| Progress | ModuleMap, LevelNode | The Learn map with locks and stars |
| Assessment | QuizQuestion | Multiple choice, true/false and picture choice |
| Assessment | FeedbackPanel | Right or wrong plus a short explanation |
| Identity | PersonaCard, AvatarBuilder, ProfileTile, PicturePIN | Personas and shared-phone profiles |
| Guardrail | AssumptionBanner | "These are assumed numbers, not promises" on every projection |
| Access | AudioButton, LanguageSwitcher, TextSizeControl | Voice-over, language and text size |
| System | OfflineBanner, SyncIndicator, Toast, Dialog, EmptyState | Status and feedback |

The NGO dashboard uses its own small set of components, listed in its section.

## Localization & accessibility

The app launches in Telugu, Urdu, Hindi and English with voice-over for every story card, and adding a language needs translation files, not code.

### Language components

- **String files:** every piece of text lives in translation files keyed by ID, with no words baked into images.
- **Right-to-left layout:** Urdu mirrors the layout automatically.
- **Indian number format:** amounts show lakh grouping (₹1,00,000) in every language.
- **Financial glossary:** each language has an agreed glossary so terms like "emergency fund" are translated consistently. Common English terms (UPI, OTP, EMI) stay in English with a local explanation, because that is how students hear them.
- **Voice-over packs:** recorded audio per language, downloaded once as a pack, ideally over Wi-Fi at the NGO centre.
- **Switch any time:** language can be changed from Settings without losing progress.

### Accessibility and low-end device components

| Need | Design response |
| --- | --- |
| Low reading confidence | Voice-over on every card and question; icons beside every choice |
| Small, low-end phones | Initial download kept small; modules and audio load as separate packs |
| Patchy or costly data | Fully playable offline; data-saver mode turns off animation and auto-download |
| Shared phones | Profile switcher with a 4-picture PIN; auto sign-out after inactivity |
| Visual needs | WCAG 2.1 AA contrast, adjustable text size, colour never the only signal |
| Pressure and anxiety | No timers by default; an optional timed mode for challenges |

## NGO facilitator dashboard

A web dashboard lets NGOs set up classes in minutes, run group sessions and see who needs help, which delivers the brief's "NGO-integrated" measure.

**Roles:** Facilitator (their own classes) · NGO admin (all classes in the NGO) · Vanguard programme team (aggregate, read-only).

| Screen | Who uses it | What it does | Key components |
| --- | --- | --- | --- |
| Sign in | All staff | Email with one-time code | LoginForm |
| NGO overview | NGO admin | Schools, classes, active students, completion, learning gains | KPITile, SchoolTable, TrendChart |
| Class setup | Facilitator | Create a class, set default language, get a class code and QR, print a join sheet | ClassForm, ClassCodeCard, PrintSheet |
| Class progress | Facilitator | Students (by nickname) against modules; flags anyone inactive for 7 days | ProgressHeatmap, StudentTable, InactiveFlag |
| Classroom mode | Facilitator | Project a scenario on a screen; students vote on their phones; results appear live and spark discussion | SessionController, LiveVoteChart, ScenarioProjector |
| Lesson plans | Facilitator | A 45-minute plan, discussion prompts and a printable worksheet per module | LessonPlanViewer, WorksheetDownload |
| Learning gains | NGO admin, Vanguard | Baseline vs. end-line scores by pillar and class | PrePostChart, PillarBreakdown |
| Reports | NGO admin, Vanguard | Aggregate CSV and PDF exports for funders and partners | ReportBuilder, ExportButton |
| Announcements | Facilitator | Short message shown on students' home screen | AnnouncementComposer |

Classroom mode matters for groups where several students share one phone: the facilitator leads, and students discuss before voting together.

## Content system

All scenarios, quizzes and lesson cards are data, not code, so educators can write and update them and the app picks up new content without an app update.

### Content model

A **scenario** holds story text and an illustration. It offers **choices**, and each choice has a **consequence**: effects on the wallet, jars and score, plus a **lesson card**. Every item is tagged by pillar, concept, persona, difficulty, region and language.

```json
{
  "id": "budget.recharge.01",
  "pillar": "plan_budget",
  "concept": "needs_vs_wants",
  "personas": ["ravi", "sana", "kiran"],
  "difficulty": 1,
  "text": "t:budget.recharge.01.story",
  "choices": [
    { "id": "a", "label": "t:recharge_basic", "effects": { "needs": -199 }, "lesson": "t:lesson.needs_first" },
    { "id": "b", "label": "t:recharge_plus_earphones", "effects": { "needs": -199, "wants": -599 }, "lesson": "t:lesson.wants_cost" }
  ]
}
```

The `t:` keys point to translation strings, so one scenario serves every language.

### Content components

| Component | Role |
| --- | --- |
| Content studio (headless CMS) | Forms for writing scenarios, quizzes and lesson cards; preview on a phone frame |
| Translation tool | Translators work string by string against the shared glossary |
| Review workflow | Draft → financial accuracy review → Vanguard compliance review → translation → native-speaker check → pilot with a few students → publish |
| Content packs | Versioned bundles per language and region, served from a CDN and cached on the phone |
| Regional packs | A Hyderabad pack first (local festivals, places, prices); later packs for other cities reuse the same scenarios with local details |

## Data model & privacy

The system stores no student's real name, phone number, birth date, address or bank data; a student is an anonymous ID with a nickname inside a class.

| Entity | Key fields | Notes |
| --- | --- | --- |
| Organisation | id, name, city | A partner NGO |
| Centre | id, org\_id, name, type (school, community centre) | Where sessions happen |
| Class | id, centre\_id, class\_code, default\_language, facilitator\_id | The class code is how students join |
| Staff user | id, org\_id, name, email, role | Adults only; signs in with a one-time code |
| Student profile | anon\_id, class\_id, nickname, avatar, grade band, language, maturity level | No personal identifiers |
| Game save | profile\_id, persona\_id, month, week, wallet, jars, score, random seed | One per persona played |
| Decision event | profile\_id, scenario\_id, choice\_id, timestamp, rewound (yes/no) | Feeds learning analytics |
| Quiz attempt | profile\_id, quiz\_id, type (baseline, module, end-line, retention), answers, score | Feeds learning gains |
| Reward | profile\_id, badge\_id or xp, earned\_at | Badges and XP |
| Content pack | id, version, language, region, published\_at | What each phone has installed |

### Privacy components and rules

- **Data minimisation:** nickname and class code only; nicknames pass a word filter.
- **Consent:** collected by the school or NGO on a parent consent form before the class code is shared.
- **Child safety:** no chat between students and no user-written text visible to others.
- **No tracking for profit:** no ads, no third-party trackers, no sale or sharing of data.
- **Local hosting:** data stored in an India cloud region.
- **Access control:** facilitators see only their classes; Vanguard sees only aggregates.
- **Retention:** the link between a profile and a class is removed at programme end; only aggregate results are kept.

Open question for Vanguard legal: India's Digital Personal Data Protection Act, 2023 requires verifiable parental consent for under-18s and limits behavioural monitoring of children. Confirm how learning analytics fits within the Act and its rules before the pilot.

## Tech stack, offline mode & deployment

A progressive web app (PWA) on a managed Postgres backend keeps the build small for the pilot and handles 100 times the load without a redesign.

| Layer | Recommended choice | Why |
| --- | --- | --- |
| Student app | PWA in React + TypeScript; installable from a link, no Play Store needed | Works on any Android phone with a browser; one codebase |
| Mini-games | Lightweight canvas and CSS animation | Keeps the download small |
| Game engine | Pure TypeScript simulation with a seeded random generator | Same inputs give the same outcome, so rewinds and testing are reliable |
| Offline | Service worker caches the app and content packs; IndexedDB stores saves and a queue of events | Fully playable with no signal |
| Sync | Queued events upload when online; each event has a unique ID so duplicates are ignored | Safe on flaky connections |
| Backend | Supabase (Postgres, auth, row-level security) or Node.js API on Postgres | SQL suits reporting; row-level security enforces who sees what |
| Content studio | Headless CMS such as Directus or Strapi | Non-developers can author content |
| Translation | Weblate or Crowdin | Glossary and translator workflow |
| Dashboard | React (Next.js) with a charting library | Shares components with the student app |
| Analytics | Event tables in the same database, or self-hosted PostHog | No third-party tracking |
| Hosting | India cloud region plus a CDN for content packs and audio | Data residency and fast downloads |
| Later option | Wrap the PWA as a Play Store app | Easier discovery when scaling |

**Deployment:** separate test and live environments, automatic builds and tests on every change, feature flags to switch features on class by class, and content packs published separately from app releases.

**Scale path:** the API holds no state between requests and content is served from the CDN, so moving from 1,500 to 150,000 students mainly means a larger database plan.

## Impact measurement & analytics

Success is judged mainly on learning gain from baseline to end-line quiz, backed by completion and engagement; pilot targets below are proposals to agree with Vanguard and the NGOs.

| Metric | Definition | Proposed pilot target |
| --- | --- | --- |
| Learning gain | Average end-line score minus baseline score | +25 percentage points |
| Pillar mastery | Share of students scoring 4 of 5 or more on each module quiz | 70% per module |
| Scam detection | Accuracy in Scam or Safe? at end vs. start | 90% at end |
| Confidence | Change in 1–5 self-rated money confidence | +1 point |
| Retention | Score on the 4-week follow-up quiz vs. end-line | Within 10 points of end-line |
| Activation | Students who join and finish onboarding | 85% |
| Completion | Students who finish all four modules | 60% |
| Engagement | Median sessions per week during the programme | 2 or more |
| Facilitator satisfaction | Facilitator rating of ease and usefulness | 4 of 5 |

**Core events tracked:** app\_open, onboarding\_complete, persona\_selected, decision\_made, rewind\_used, event\_triggered, minigame\_complete, quiz\_submitted, module\_complete, badge\_earned, language\_changed, sync\_complete.

**Evaluation design:** parallel baseline and end-line quizzes, a 4-week retention check, and short focus groups with students and facilitators in each partner NGO. Once the pilot is stable, content variants can be compared to see which scenarios teach best.

## Guardrails & compliance

The brief's guardrail is built into components and the review workflow, not left to individual writers: educate, never recommend, and treat every simulation as an assumption.

| Guardrail | How it's enforced |
| --- | --- |
| Educate, do not recommend investments | Only fictional assets in games; no real fund, stock, bank, app or scheme named as something to choose; Vanguard compliance reviews every scenario before publishing |
| Simulations are assumptions, not promises | AssumptionBanner is built into TimeSlider and GrowthChart and cannot be hidden; projections always show good, average and bad ranges |
| No real money | No payments, no bank links, no real transactions anywhere |
| Safe outbound links only | The only links out are official safety resources, such as the 1930 cyber crime helpline and cybercrime.gov.in |
| Child safety | No student-to-student chat; nicknames filtered; no ads |
| Respectful content | Scenarios avoid shaming poverty or family situations; diverse characters across genders and communities; betting shown only as a risk to recognise |
| Facilitator briefing | Onboarding for staff covers what the app does and does not teach, and how to answer "what should I invest in?" without giving advice |

## MVP scope & roadmap

The MVP covers all four pillars at two levels each and reaches the \~1,500-student pilot in about 15 weeks; scaling starts only once pilot targets are met.

&#91;embedded content: roadmap · 4 phases, 3 gates\]

Each gate must pass before the next phase: sign-off on personas and scenarios, a usability and compliance pass with about 30 students, then the pilot targets in the impact section.

| Area | In the MVP | After the pilot |
| --- | --- | --- |
| Modules | All four pillars, Levels 1–2 | Level 3 for each; new topics such as a first job, taxes and credit scores |
| Personas | All four personas | Personas for other cities |
| Languages | Telugu, Urdu, Hindi, English, with voice-over | More Indian languages |
| Gamification | XP, badges, streaks, rewind tokens, Money Health Score, certificate | Stars and cosmetics, class challenges, optional leaderboards |
| NGO tools | Class codes, progress heatmap, classroom mode, lesson plans, exports | Announcements, NGO-wide analytics |
| Content | Hyderabad pack | Regional packs for new cities |
| Platform | Installable PWA, offline play, sync | Play Store app |

**Suggested core team:** product lead, designer, two developers, content writer, one translator per language, and an NGO liaison, with Vanguard compliance reviewing content at each gate.

## Success measures traceability

Every success measure in the brief maps to specific components and to evidence we can show at review. The brief's heading says six measures but its list names seven; all seven are covered here.

| Success measure | Components that deliver it | Evidence at review |
| --- | --- | --- |
| Simple | Starter level, LessonCard "what this means", 2–4 choices per card, glossary | First-time students finish onboarding without help in usability tests |
| Relatable | Hyderabad regional pack, local scenarios, persona backstories, local illustrations | Students rate scenarios as "like my life" in focus groups |
| Persona-led | Four personas, three maturity levels, adaptive event frequency | Different personas show different event mixes and difficulty |
| Language-ready | String files, glossary, RTL layout, voice-over packs, translation tool | All four languages live at pilot; a fifth language added with no code change |
| Game-based | Simulation loop, mini-games, quizzes, badges, class challenges | Learning gain from baseline to end-line quiz |
| Intuitive UI | Four-tab navigation, icon-plus-label choices, 3-card tutorial, large tap targets | Median time to first decision under 3 minutes |
| NGO-integrated | Class codes, classroom mode, progress heatmap, lesson plans, reports | NGOs run sessions and pull reports without developer help |
| Guardrail | AssumptionBanner, fictional assets, compliance review step | Every published scenario carries a compliance approval |

The four learning pillars map one-to-one to Modules 1–4.
