# @paisa/content

Scenarios, events, personas, quizzes, the Scam or Safe? messages, the map places, the Paisa Times editions and glossary, the translation files and the guardrail word lists. Content is data: designers and reviewers change JSON, not code.

## Layout

| Path | What it holds |
| --- | --- |
| `scenarios/{plan_budget,save_manage,understand_investing,stay_safe}.json` | Weekly decision cards, 6 per pillar (24). Each file is an array. |
| `events/events.json` | 10 surprise event cards (1 to 4 choices, a draw weight and the levels that see them). |
| `personas.json` | Sana and Ravi: income, fixed costs, starting jars, payday split and goal. Goals are sized for the 3-month game: saving the payday split reaches the goal (Sana ₹3,400, Ravi ₹3,450), and one raid on the goal jar (₹300 or more) misses it. |
| `quizzes/baseline.json`, `quizzes/endline.json` | 6 parallel questions each, paired by pillar and concept (`.baseline` and `.endline` ids). |
| `minigames/scam-or-safe.json` | 12 Scam or Safe? messages. |
| `places.json` | The map: 5 places (`home`, `convenience` = the Shop, `school`, `hospital`, `bank`) and the Shop's 3 sub-map locations (`convenience.phone_shop`, `.kirana`, `.clothes_stall`). `position` is the pin's centre in percent of the map (sub-map locations: of the sub-map). Names are `t:place.<id>`. No `unlock` means open from month 1. |
| `concepts.json` | Every idea the game teaches (29), with its pillar, `t:concept.<id>.name` and `.simple` (one line, at most 100 characters). Scenarios, events, quiz questions and guides tag one by id; the linter fails on a tag that is not here. |
| `guides/real-life.json` | Short real-life guides (Learn, in the student app): `t:guide.<id>.title`, `.intro`, `.step1`…, then one check question `.q`, `.o1`…, `.why`. Each lists its `concepts`. They state real facts, so `--strict` needs `meta.factsCheckedBy`. |
| `glossary.json` | Paisa Times words: `t:glossary.<id>.word`, `.simple` (one line, at most 100 characters) and `.example`. |
| `news/<edition>.json` | One Paisa Times edition (e.g. `2026-W41`): 5 articles. Every file here is an edition; adding one needs no code change. Keys are `t:news.<edition>.<id>.headline`, `.body`, `.q`, `.o1`…, `.why`. |
| `i18n/<code>.json` | Flat maps from key (without `t:`) to text. Every file here is a language. |
| `manifest.json` | `CONTENT_VERSION`, the required languages (en, hi) and display names. |
| `glossary.hi.json` | The Hindi glossary. Reuse it whenever Hindi is written. |
| `guardrails.json` | Forbidden-term lists and length caps. Non-developers can edit it. |
| `src/index.ts` | Exports `content` (the parsed bundle, with `places`, `glossary` and `news`), `places`, `glossary`, `news`, `i18n` (every language), `languages`, `CONTENT_VERSION` and the validator. |
| `src/languages.ts` | Builds the language tables and list from the files and the manifest. |
| `src/validate.ts` | The linter library behind `pnpm lint:content`. |

Keys contain dots, so with react-i18next set `keySeparator: false`.

### Paisa Times term markers

An article body marks a glossary word as `[[termId]]`, e.g. `Never share your [[otp]].` The app shows the term's `word` in the reader's language as a tappable word that opens the thought cloud. Write the sentence so the word fits where the marker is, in every language. The article's `terms` lists exactly the ids marked in the English body, and every language marks the same ids.

### Placeholders the UI fills

Some strings use react-i18next's default `{{name}}` interpolation. Every language must use the same placeholders (the linter checks). Pass amounts already formatted with `Intl.NumberFormat('en-IN')`.

| Key | Values |
| --- | --- |
| `invest.compound.01.story` | `projectGrowth(100, 10)`: `low`, `avg`, `high` = the last value of each series. `lowRate`, `highRate` = `GROWTH_RATES.low` and `.high` as whole percentages. |
| `invest.compound.01.b.lesson` | `projectGrowth(100, 5)`: `low`, `avg`, `high` = the last value of each series. |

## Checking content

```
pnpm lint:content            # errors fail; warnings (tone) do not
pnpm lint:content -- --strict   # release check: also fails on any "draft" and any article without factsCheckedBy
```

The linter enforces CLAUDE.md section 7.2 on every language file:

- **Schema and structure**: zod schema, 2 to 4 choices, unique ids; every `requiresFlag` is set by some choice; no delay longer than `maxDelayWeeks` (11), so it lands inside the 12-week game; every card targets at least one persona in `personas.json`.
- **Languages**: every key in each required language (`manifest.json`, en and hi); other languages must be complete unless marked `machine_draft` (then missing keys are warnings); the same `{{placeholders}}` as English.
- **Educate, never recommend**: no real brands, promises or pushy investment advice ("you should…", "buy…", "invest now", "निवेश करें", "ज़रूर ख़रीदें" next to an investment word or a fictional asset). Matching ignores case, full-width letters, invisible characters, the Hindi nukta and punctuation inside words, so `Pay\u200btm (with a zero-width space)`, `full-width Ｐaytm`, `G-Pay` and `S.B.I.` are caught; it uses whole-word boundaries, so `credit` and `public` are not.
- **Investing cards**: fictional assets only, `assumption: true`, and ranges instead of one number: no single percentage (`%`, "percent", "प्रतिशत") and no single ₹ projection ("could become ₹500").
- **Links and numbers**: only `cybercrime.gov.in` (or a subdomain) and 1930. Hosts are parsed, so `cybercrime.gov.in.evil.com` fails; any domain ending counts (`wa.me`, `.shop`); phone numbers are found in any format or digit script.
- **Scam or Safe?**: message bodies may quote a scammer's promises, but links must use a reserved fake domain (`*.example`, `*.invalid`, `*.test`) and numbers must be on `scamPlaceholderNumbers`. The sender, hints and explanation get the full checks.
- **Map**: every card's `location` is a top-level place in `places.json`, and its `sublocation` is one of that place's `children` (with `parent` set back to it).
- **Paisa Times**: every `[[termId]]` in every language is in `glossary.json` and written in lower case; `terms` equals the English markers; every language marks the same terms. Articles, glossary entries and place names get all the text checks above (brands, promises, advice, links, numbers, tone). `--strict` also fails any article whose `meta` has no `factsCheckedBy` (`facts_unchecked`), because a human must check every real figure.
- **Concepts and guides**: every `concept` on a scenario, event or quiz question, and every id in a guide's `concepts`, is in `concepts.json` (`unknown_concept`). Guides get all the text checks, and `--strict` fails any guide without `factsCheckedBy`.
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
| feedback | Jar Splitter `jar.check.*` | 120 |
| speaker | `speaker.*` (who talks in a scene or chat) | 30 |
| headline, articleBody | `news.*.headline`, `news.*.body` (each `[[termId]]` counts as its word) | 80, 600 |
| question, option, explanation | article `news.*.q`, `.o1`…, `.why` | 120, 60, 160 |
| glossaryWord, glossarySimple, glossaryExample | `glossary.*.word`, `.simple`, `.example` | 30, 100, 140 |
| placeName | `place.*` | 24 |
| conceptName, glossarySimple | `concept.*.name`, `concept.*.simple` | 30, 100 |
| guideTitle, guideStep | `guide.*.title`; `guide.*.intro`, `guide.*.step1`… | 50, 160 |
| question, option, explanation | guide `guide.*.q`, `.o1`…, `.why` | 120, 60, 160 |

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

Every item has `meta.status`: `draft` or `reviewed`. All content here is `draft`. A human reviews an item and changes it to `reviewed`. Articles also need `meta.factsCheckedBy` (who checked any real figure). Release builds run `pnpm lint:content -- --strict`, which fails while any draft or unchecked article remains.

## Review needed

This content was written once by a model at authoring time. It needs:

1. **Financial review**: amounts, delayed effects, persona goals and every investing card.
2. **Compliance review**: educate, never recommend; no real brands; no promises; assumed rates confirmed with Vanguard.
3. **Native Hindi review**: tone, naturalness and the glossary. At least the 10 most-used cards before the demo.

No model runs in the student app.
