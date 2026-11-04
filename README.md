<img src="assets/icon.svg" width="64" height="64" alt="">

# Evidient

**What do the sources say?** Evidient shows what FDA labels, European product information, published studies and Norway's national interaction database say about combining medicines, over-the-counter drugs and alcohol. It shows the exact words behind every claim, where sources disagree, and what is missing. **If a combination hasn't been reviewed yet, you can ask the agent to research it while you wait.**

Live: **https://evidient.expo.app**

Built solo for the **Meta Global AI Developer Hackathon** (Indie Developer track, Oct 27 – Nov 4, 2026). Problem statement: *Build for Your World.*

> Evidient is an educational evidence explorer. It is **not medical advice**, it never says a combination is "safe", and every path ends with questions to bring to a pharmacist or doctor.

---

## Why

Someone on an antibiotic gets invited out for drinks. The leaflet is vague, the pharmacy is closed, and a search engine returns contradictory forum posts. A chatbot will happily give a confident answer from memory.

Evidient does something different. It shows what regulatory labels and published studies actually say, how strong that evidence is, and where it conflicts. The user can then ask a professional a better question.

## How it works: a verifiable evidence agent

```
curated interaction list ─┐
                          ▼
 ┌──────────────────────────────────────────────────────────────────┐
 │ 1. Research agent (Muse Spark 1.3, Responses API, parallel tools)│
 │    reads FDA label sections → proposes claims, each with a       │
 │    verbatim quote → searches PubMed for human studies that       │
 │    confirm or contradict → records gaps when none exist          │
 ├──────────────────────────────────────────────────────────────────┤
 │ 2. Quote check (deterministic): the quote must exist word for    │
 │    word in the stored source text, or the claim is rejected      │
 ├──────────────────────────────────────────────────────────────────┤
 │ 3. Independent judge (Muse Wonder 1.0, a different, larger Meta  │
 │    model): does the quote support the claim and its stance?      │
 │    Only "supports" passes                                        │
 ├──────────────────────────────────────────────────────────────────┤
 │ 4. Challenge round: rejected claims go back to the agent for one │
 │    targeted retry from fetched text, then are re-verified        │
 ├──────────────────────────────────────────────────────────────────┤
 │ 5. Card writer (Muse Spark 1.3, structured output) uses accepted │
 │    claims only; every sentence is judged again against the       │
 │    claims it cites; advice wording is filtered out               │
 ├──────────────────────────────────────────────────────────────────┤
 │ 6. Deterministic: evidence depth, conflicts, pharmacist questions │
 └──────────────────────────────────────────────────────────────────┘
                          ▼
   Evidence card + full audit trail (accepted AND rejected claims)
```

- **The model never decides which interactions exist.** An interaction is shown only if quote-matched, judge-confirmed claims exist, or if Norway's national database rates the pair.
- **Request a review (on-demand agent).** Pick any two of ~1,000 medicines. If the pair isn't reviewed, "Request a review" runs the same pipeline live. It finds each drug's current FDA label via openFDA and its drug classes via NIH RxClass, so a label that warns about "NSAIDs" or "CNS depressants" counts. It pre-scans the label for mentions of the other drug or its class, searches PubMed, then quote-checks and judges every claim. The card is marked "Researched by the agent on request" with the date. If nothing is found it says so; if the judge couldn't run it says "the check didn't finish", never "nothing found".
- **One scale, never a verdict.** Each pair leads with the strongest rating any source gives, derived by fixed rules from the accepted label quotes and Norway's grade, not by the model: Serious warning (red), Advised against (orange), Caution (amber) or Studies only (grey). When a label says no significant interaction is expected, or Norway says no action is needed, the pair shows that outside the warning scale. There is no green and no "safe".
- **It says when a warning is indirect.** Labels often warn about a drug class, such as CNS depressants, without naming the other drug. The card says so.
- **Rejected claims stay visible.** "How this card was built" shows every tool call, every claim, the quote check result and the judge's verdict, live or replayed.
- **Adversarial demo.** "Plant two false claims" injects a fabricated quote and an overstated claim into a live run. The checks reject both on screen.
- **Disagreement is information.** For metronidazole + alcohol, the FDA label describes a disulfiram-like reaction, while a double-blind study of 12 healthy men ([PMID 12022894](https://pubmed.ncbi.nlm.nih.gov/12022894/)) found none. Evidient shows both sides and the study's limits instead of picking a winner.

## What ships

- **173 evidence cards:** 29 reviewed by hand and 144 built in batches. The batch cards were researched offline by Codex and Claude curators and judged by Claude Opus, under the same rules as the live agent: a verbatim quote, a word-for-word check, then an independent judge. Muse was not used to build them; it runs live in the app. Curator claims and judge verdicts are in `data/batch/`.
- **11,627 pairs from Norway's national interaction database (FEST)**, with the Norwegian original and an English rendering.
- **1,015 searchable medicines** by brand or active ingredient, from public registries.
- **On-demand reviews:** the live agent reads FDA labels and PubMed. European product information and FEST are in the shipped data, not fetched live.

## Meta models used

| Model | Where |
|---|---|
| **Muse Spark 1.3** (Meta Model API, Responses API) | Research agent: multi-turn tool calling with `previous_response_id`, parallel function calls, strict schemas |
| **Muse Spark 1.3** structured output | Evidence card writer (`text.format` JSON schema) |
| **Muse Spark 1.3** image understanding | "Scan a box": photograph a medicine package and the active ingredient is added to the map |
| **Muse Wonder 1.0** (structured output, low reasoning effort) | Independent judge for claim and sentence support. A different, larger model from the one that wrote the claims |

## Data and licenses

| Source | Use | License |
|---|---|---|
| [openFDA drug labels](https://open.fda.gov/apis/drug/label/) | Label sections, snapshotted in `data/sources/fda_label/` for exact quote matching | Public domain |
| [RxNorm / RxNav](https://lhncbc.nlm.nih.gov/RxNav/) | Substance normalization | Free NLM API |
| [PubMed E-utilities](https://www.ncbi.nlm.nih.gov/books/NBK25501/) | Study search and abstracts; the app shows PMIDs, short quotes and links | NLM terms; abstracts © their publishers |
| [EMA product information](https://www.ema.europa.eu/en/about-us/about-website/legal-notice) | English SmPC sections 4.4 and 4.5 for 14 products | Reproduction with EMA attribution |
| [Spain CIMA (AEMPS)](https://www.aemps.gob.es/aviso-legal/) | Spanish SmPC sections, quoted with an English rendering | Reproduction with origin and update date |
| [NIH RxClass](https://lhncbc.nlm.nih.gov/RxNav/applications/RxClassIntro.html) | Drug classes for on-demand reviews | Free NLM API |
| [Polish register (URPL / Centrum e-Zdrowia)](https://rejestry.ezdrowie.gov.pl/registry/rpl) | Brand names (EU) and the ranking of the ~1,000 most common ingredients | CC BY 4.0 |
| [France BDPM](https://base-donnees-publique.medicaments.gouv.fr/) | French brand names and SmPC sections | Licence Ouverte (no ANSM/HAS/UNCAM endorsement implied) |
| [Italy AIFA](https://www.aifa.gov.it/liste-dei-farmaci) | Italian brand names | CC BY 4.0 |
| [Health Canada DPD](https://open.canada.ca/data/en/dataset/bf55e42a-63cb-4556-bfd8-44f26e5a36fe) | Canadian brand names | Open Government Licence – Canada |
| [Norway FEST (DMP)](https://www.dmp.no/) | Norwegian brand names; 11,627 interaction ratings with consequence and mechanism text (Norwegian original plus English rendering; management text excluded) | NLOD |
| [openFDA NDC](https://open.fda.gov/apis/drug/ndc/) | US brand names | Public domain / CC0 |
| [NIH ODS DSLD](https://dsld.od.nih.gov/) | Supplements (e.g. whey protein) | CC0 |

**The ~1,000-medicine name catalogue** (`data/catalog.json`) is built by a deterministic script (`scripts/build-catalog.ts`) from these public registries, with no language model involved. Source files are hashed in manifests. Raw download caches are not in this repository; the scripts fetch them from the sources. Attribution and terms for each source are listed in `data/catalog-sources.md` and in the app under "Sources and credits".

DrugBank and DDInter were deliberately not used because of their licenses.

## Built during the hackathon

This repository was created on Nov 3, 2026, during the build window. **Everything in it was built during the hackathon:**

- Expo app (web + iOS/Android): a home list grouped by warning level, evidence cards that lead with the answer, a worst-first overview for 3+ substances, interaction map, audit trail, live and on-request agent runs, medicine-box scanning, light and dark mode. The UI lives in `ui/`; the design system is in `DESIGN.md`.
- Agent pipeline, quote verifier, judge integration, card writer and API routes: `server/`, `app/api/`.
- Substance and interaction datasets, evidence cards, curator claims, judge verdicts and source snapshots: `data/`.
- Precompute, catalogue-build and evaluation scripts: `scripts/`.

Third-party code is limited to open-source npm dependencies (Expo, React Native, d3-force, openai SDK, zod, lucide icons, Archivo fonts).

## Run it

```bash
npm install
cp .env.example .env.local      # add MODEL_API_KEY
npx tsx scripts/build-fest-shipped.ts   # generate public/fest
npm run web                     # http://localhost:8081
```

```bash
npm test                        # unit tests (fake model clients)
node --env-file-if-exists=.env.local --import tsx scripts/precompute.ts   # build evidence cards
```

## Limitations

- Coverage is limited to medicines and alcohol. Recreational drugs are not covered. "Nothing documented" means nothing was found *in these sources*, not that there is no risk.
- A class-level warning is not direct evidence about a pair, and the card says when a passage doesn't name the drug.
- On-request results are kept on the device that asked, not shared between users yet.
- Abstract-level reading only. Full-text studies are not parsed.
- The judge is a model. A matched quote proves where a claim came from, and the judge's verdict is a second opinion, not proof of truth.
- Not validated with clinicians or patients yet.

---

This shows what labels and studies say, not what's right for you. Ask a pharmacist or doctor before you change how you take a medicine.
