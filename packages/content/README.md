# @paisa/content

Scenarios, events, personas, quizzes, the Scam or Safe? messages, the translation files and the guardrail word lists. Content is data: designers and reviewers change JSON, not code.

## Layout

| Path | What it holds |
| --- | --- |
| `scenarios/{plan_budget,save_manage,understand_investing,stay_safe}.json` | Weekly decision cards, 6 per pillar (24). Each file is an array. |
| `events/events.json` | 10 surprise event cards (1 to 4 choices, a draw weight and the levels that see them). |
| `personas.json` | Sana and Ravi: income, fixed costs, starting jars, payday split and goal. Goals are sized for the 3-month game. |
| `quizzes/baseline.json`, `quizzes/endline.json` | 6 parallel questions each, paired by pillar and concept (`.baseline` and `.endline` ids). |
| `minigames/scam-or-safe.json` | 12 Scam or Safe? messages. |
| `i18n/en.json`, `i18n/hi.json` | Flat maps from key (without `t:`) to text. |
| `glossary.hi.json` | The Hindi glossary. Reuse it whenever Hindi is written. |
| `guardrails.json` | Forbidden-term lists and length caps. Non-developers can edit it. |
| `src/index.ts` | Exports `content` (the parsed bundle), `i18n` and the validator. |
| `src/validate.ts` | The linter library behind `pnpm lint:content`. |

Keys contain dots, so with react-i18next set `keySeparator: false`.

## Checking content

```
pnpm lint:content            # errors fail; warnings (tone) do not
pnpm lint:content -- --strict   # release check: also fails on any "draft"
```

The linter enforces CLAUDE.md section 7.2: schema, 2 to 4 choices, unique ids, every key in en and hi, no real brands or promises, fictional assets only in investing cards, `assumption: true` on investing cards, no single-number percentages there, only cybercrime.gov.in and 1930 as outside references, and length caps (story 220, label 40, lesson 140, note 140).

## Add a scenario

1. Add an object to the right pillar file in `scenarios/`. Use an id like `budget.recharge.02`. Set `meta` to `{ "status": "draft", "author": "<your name>" }`.
2. Give each choice (ids `a`, `b`, `c`) an `effects` object. Money is whole rupees. Jar changes go under `jars`; borrowing is `debt`. Consequences for later go in `delayed` with `afterWeeks`, `effects` and a `note` key.
3. Add every `t:` key to **both** `i18n/en.json` and `i18n/hi.json`. Keys follow the id: `budget.recharge.02.story`, `.a.label`, `.a.lesson`, `.a.later`.
4. Investing cards must set `"assumption": true` and name only Steady Deposit, Mixed Basket or Rocket Co.
5. Run `pnpm lint:content` and `pnpm test`.

## Add a language

Add `i18n/<code>.json` with the same keys as `en.json`. No code change is needed: the linter picks the file up. If it is a machine draft, add `"_meta": { "status": "machine_draft" }`; missing keys are then warnings. Any other language file must be complete.

## Status workflow

Every item has `meta.status`: `draft` or `reviewed`. All content here is `draft`. A human reviews an item and changes it to `reviewed`. Release builds run `pnpm lint:content -- --strict`, which fails while any draft remains.

## Review needed

This content was written once by a model at authoring time. It needs:

1. **Financial review**: amounts, delayed effects, persona goals and every investing card.
2. **Compliance review**: educate, never recommend; no real brands; no promises; assumed rates confirmed with Vanguard.
3. **Native Hindi review**: tone, naturalness and the glossary. At least the 10 most-used cards before the demo.

No model runs in the student app.
