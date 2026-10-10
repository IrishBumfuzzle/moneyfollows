# @paisa/content

Scenarios, events, personas, quizzes, the Scam or Safe? messages, the translation files and the guardrail word lists. Content is data: designers and reviewers change JSON, not code.

## Layout

| Path | What it holds |
| --- | --- |
| `scenarios/{plan_budget,save_manage,understand_investing,stay_safe}.json` | Weekly decision cards, 6 per pillar (24). Each file is an array. |
| `events/events.json` | 10 surprise event cards (1 to 4 choices, a draw weight and the levels that see them). |
| `personas.json` | Sana and Ravi: income, fixed costs, starting jars, payday split and goal. Goals are sized for the 3-month game: saving the payday split reaches the goal (Sana ₹3,400, Ravi ₹3,450), and one raid on the goal jar (₹300 or more) misses it. |
| `quizzes/baseline.json`, `quizzes/endline.json` | 6 parallel questions each, paired by pillar and concept (`.baseline` and `.endline` ids). |
| `minigames/scam-or-safe.json` | 12 Scam or Safe? messages. |
| `i18n/<code>.json` | Flat maps from key (without `t:`) to text. Every file here is a language. |
| `manifest.json` | `CONTENT_VERSION`, the required languages (en, hi) and display names. |
| `glossary.hi.json` | The Hindi glossary. Reuse it whenever Hindi is written. |
| `guardrails.json` | Forbidden-term lists and length caps. Non-developers can edit it. |
| `src/index.ts` | Exports `content` (the parsed bundle), `i18n` (every language), `languages`, `CONTENT_VERSION` and the validator. |
| `src/languages.ts` | Builds the language tables and list from the files and the manifest. |
| `src/validate.ts` | The linter library behind `pnpm lint:content`. |

Keys contain dots, so with react-i18next set `keySeparator: false`.

### Placeholders the UI fills

Some strings use react-i18next's default `{{name}}` interpolation. Every language must use the same placeholders (the linter checks). Pass amounts already formatted with `Intl.NumberFormat('en-IN')`.

| Key | Values |
| --- | --- |
| `invest.compound.01.story` | `projectGrowth(100, 10)`: `low`, `avg`, `high` = the last value of each series. `lowRate`, `highRate` = `GROWTH_RATES.low` and `.high` as whole percentages. |
| `invest.compound.01.b.lesson` | `projectGrowth(100, 5)`: `low`, `avg`, `high` = the last value of each series. |

## Checking content

```
pnpm lint:content            # errors fail; warnings (tone) do not
pnpm lint:content -- --strict   # release check: also fails on any "draft"
```

The linter enforces CLAUDE.md section 7.2 on every language file:

- **Schema and structure**: zod schema, 2 to 4 choices, unique ids; every `requiresFlag` is set by some choice; no delay longer than `maxDelayWeeks` (11), so it lands inside the 12-week game; every card targets at least one persona in `personas.json`.
- **Languages**: every key in each required language (`manifest.json`, en and hi); other languages must be complete unless marked `machine_draft` (then missing keys are warnings); the same `{{placeholders}}` as English.
- **Educate, never recommend**: no real brands, promises or pushy investment advice ("you should…", "buy…", "invest now", "निवेश करें", "ज़रूर ख़रीदें" next to an investment word or a fictional asset). Matching ignores case, full-width letters, invisible characters, the Hindi nukta and punctuation inside words, so `Pay\u200btm (with a zero-width space)`, `full-width Ｐaytm`, `G-Pay` and `S.B.I.` are caught; it uses whole-word boundaries, so `credit` and `public` are not.
- **Investing cards**: fictional assets only, `assumption: true`, and ranges instead of one number: no single percentage (`%`, "percent", "प्रतिशत") and no single ₹ projection ("could become ₹500").
- **Links and numbers**: only `cybercrime.gov.in` (or a subdomain) and 1930. Hosts are parsed, so `cybercrime.gov.in.evil.com` fails; any domain ending counts (`wa.me`, `.shop`); phone numbers are found in any format or digit script.
- **Scam or Safe?**: message bodies may quote a scammer's promises, but links must use a reserved fake domain (`*.example`, `*.invalid`, `*.test`) and numbers must be on `scamPlaceholderNumbers`. The sender, hints and explanation get the full checks.
- **Content version**: `manifest.json` `version` is a date (`YYYY.MM.DD`, optional `.N`) or semver.

### Length caps

Caps count visible characters (a Hindi letter with its vowel sign is one) and apply in every language. The numbers live in `guardrails.json`.

| Cap | Keys | Max |
| --- | --- | --- |
| story | `*.story` | 220 |
| label | `*.label`, `common.*` | 40 |
| lesson | `*.lesson` | 140 |
| note | `*.note`, `*.later`, `*.later2`… | 140 |
| question | quiz `*.q` | 120 |
| option | quiz `*.o1`… | 60 |
| explanation | quiz and scam `*.why` | 160 |
| segment | scam message parts `*.s1`… | 120 |
| hint | `scam.why.*` | 80 |
| sender | `*.sender` | 30 |
| bio, name, goal | `persona.*` | 160, 20, 40 |
| reflection, banner | `reflection.*`, `assumption.banner` | 140 |
| badgeName, badgeDesc | `badge.*.name`, `badge.*.desc` | 24, 100 |

Strings no card uses (reflections, buttons, the banner) get the same text checks.

## Add a scenario

1. Add an object to the right pillar file in `scenarios/`. Use an id like `budget.recharge.02`. Set `meta` to `{ "status": "draft", "author": "<your name>" }`.
2. Give each choice (ids `a`, `b`, `c`) an `effects` object. Money is whole rupees. Jar changes go under `jars`; borrowing is `debt`. Consequences for later go in `delayed` with `afterWeeks`, `effects` and a `note` key.
3. Add every `t:` key to **both** `i18n/en.json` and `i18n/hi.json`. Keys follow the id: `budget.recharge.02.story`, `.a.label`, `.a.lesson`, `.a.later`.
4. Investing cards must set `"assumption": true` and name only Steady Deposit, Mixed Basket or Rocket Co. Keep their maths honest: Steady Deposit grows about 4% to 8% a year, so a visible return needs a few hundred rupees or a "skip ahead a year" story.
5. Keep `afterWeeks` at 6 or less where you can, so the player sees the payoff.
6. Run `pnpm lint:content` and `pnpm test`.

## Add a language

Add `i18n/<code>.json` with the same keys as `en.json`. No code change is needed: the app (via Vite's `import.meta.glob`), the scripts and the linter all pick the file up. Optionally add a line to `manifest.json` `languages` for its display name, or `"dir": "rtl"`. If it is a machine draft, add `"_meta": { "status": "machine_draft" }`; missing keys are then warnings. Any other language file must be complete. en and hi are always required.

## Status workflow

Every item has `meta.status`: `draft` or `reviewed`. All content here is `draft`. A human reviews an item and changes it to `reviewed`. Release builds run `pnpm lint:content -- --strict`, which fails while any draft remains.

## Review needed

This content was written once by a model at authoring time. It needs:

1. **Financial review**: amounts, delayed effects, persona goals and every investing card.
2. **Compliance review**: educate, never recommend; no real brands; no promises; assumed rates confirmed with Vanguard.
3. **Native Hindi review**: tone, naturalness and the glossary. At least the 10 most-used cards before the demo.

No model runs in the student app.
