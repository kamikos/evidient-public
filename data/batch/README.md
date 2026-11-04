# Offline batch preparation

No model endpoint is used by the M10b scripts. Curators and judges write JSON files directly. `batch-io.ts` permits network requests only to regulator and NCBI hosts. Do not run the old Muse research scripts to build this dataset.

## Reproduce

Run from the repository root, in this order:

```powershell
npx tsx scripts/batch-labels.ts
npx tsx scripts/batch-filter.ts
npx tsx scripts/eu-smpc.ts
npx tsx scripts/batch-metadata.ts
npx tsx scripts/batch-packets.ts
npx tsx scripts/batch-slices.ts
# Curators write claims; independent judges write verdicts.
npx tsx scripts/validate-batch.ts
npx tsx scripts/build-batch-cards.ts
npx tsx scripts/batch-audit.ts
npx vitest run --config scripts/batch-vitest.config.ts
npm run typecheck
```

`batch-examples.ts` recreates the two human-authored example drafts. Their checked-in verdicts are a separate self-check pass labelled `gpt-6.1-sol (self-check, replace)`. Replace them with an independent judge pass before treating them as independently judged evidence.

## Selection

M10b-A2 fetches a representative FDA label for every non-supplement catalogue medicine, using the existing single-ingredient discovery rule: prescription before OTC, newest effective date, then set ID. Successful responses and 404s are cached with retrieval dates and SHA-256 hashes under `data/raw/batch-labels/`. Processed substance files make the run resumable. Uncached requests are spaced at least 400 ms apart; label failures retry and remain visible in the coverage report. RxClass lookup is needed only for the first 300 catalogue medicines.

Tier 1 includes every eligible drinking-alcohol pair, excluding curated edges and existing batch evidence. Tier 2 uses explicit names or specific RxClass classes among the first 300 medicines and fills the total to 250. Both tiers rank boxed warnings and contraindications first, then catalogue order. Catalogue order is an alphabetical popularity proxy, not measured prescribing frequency. Every alcohol candidate remains included even if that exceeds the cap. `artifacts/M10b-label-coverage.json` records missing labels, and `artifacts/M10b-filter.json` records tier counts and the alcohol list.

The drinking-alcohol filter removes named excipients, topical products, swabs, and ingredient-only ethanol references. Interaction sentences require consumption language or an alcohol/ethanol effect or coadministration statement. Broad enzyme and pharmacological classes are excluded; specific class mentions require interaction context. This is a candidate filter, not evidence acceptance. Curators must reject irrelevant class mentions and monotherapy observations.

## EU sources

Spain uses the official [CIMA API documentation](https://cima.aemps.es/cima/resources/docs/CIMA_REST_API.pdf), checked 2026-11-04. Search is `medicamentos?practiv1=<active ingredient>&pagina=N`; `principioActivo` is silently ignored. HTML section bodies come from `docSegmentado/contenido/1?nregistro=<id>&seccion=4.4` and `4.5`. A representative is the marketed product with an exact single-ingredient VTM and segmented technical sheet, sorted by numeric registration ID. Multi-ingredient VTMs are excluded. Selection is product-specific; it does not claim equivalence of all formulations.

France uses the checked-in official BDPM CIS/composition snapshots, selects marketed products with exactly one active ingredient, matches names after explicit salt stripping, then chooses the lowest CIS. `/medicament/<CIS>/extrait` embeds its linked RCP. Extraction begins at the RCP body anchors and ends at the next section heading, skipping navigation. Centrally authorised products without embedded RCP text are recorded as failures; EMA PDFs are not silently substituted.

Coverage attempts include all reviewed substances except beverage alcohol and every drug in all final pairs. The repository currently has **28 reviewed edges**, although the brief said 27. All 28 receive packets and entries in `eu-additions.json`. The file lists only new EU source IDs for later application; reviewed evidence files are untouched. Reviewed packets contain only EU material, without new PubMed searches.

`data/sources/eu/<ES|FR>/<inn>.json` records product, registry ID, country, language, canonical URL, retrieval timestamp, available document update date, terms, attribution, section text and SHA-256 hashes. Null update dates mean the API did not supply a date. FR's update date is the registry snapshot date, not an inferred RCP revision date. Failures and achieved 4.4/4.5 coverage are in `artifacts/M10b-eu-*.json`.

CIMA website content reproduction requires origin attribution and document update date under the [AEMPS notice](https://www.aemps.gob.es/aviso-legal/). This is not a CC0 declaration. The separate [nomenclator notice](https://listadomedicamentos.aemps.gob.es/Aviso_Legal_Nomenclator.pdf) includes private-copy/non-transfer wording; do not describe the whole registry as unrestricted open data. BDPM uses [Licence Ouverte and its reuse conditions](https://base-donnees-publique.medicaments.gouv.fr/telechargement): attribute BDPM and the update date, preserve meaning, keep information current, and imply no ANSM/HAS/UNCAM endorsement. `artifacts/M10b-licences.json` records these notes.

Requests are spaced at least 400 ms on first attempts, retry transient failures, time out, and cache successful bodies with retrieval dates and hashes under `data/batch/http/`. Reruns reuse the cache and existing EU records. To refresh a source, remove its cache and processed record explicitly. Failure lists reflect the latest run.

## Packets and curation files

A packet in `packets/<pair>.json` has `pair`, `a`, `b`, `identities` with name/brands/synonyms/classes for both sides, `sources`, `prescan`, and `queries`. Each source has `{ref:{kind,id},title,url,citation,country?,language?,design,text}`. Regulatory sections contain matching sentences and up to three neighbouring sentences on either side. Retained sentence spans preserve original wording. `prescan` is a navigation aid, not a claim. PubMed searches request up to four records with abstracts, using `"<a>"[tiab] AND "<b>"[tiab] AND (interaction OR coadministration)` and ethanol/alcohol alternatives for drinking. Queries and failures are recorded. PubMed indexing and remote labels can change; cached responses make a run reproducible.

Curator files in `claims/<pair>.json`:

```json
{
  "pair": "a__b",
  "curator": "model id",
  "claims": [{"id":"c1","text":"Plain English factual claim.","quote":"VERBATIM original-language packet span","quoteEnglish":"English rendering, required for non-English sources","sourceId":"ES:12345#4.5","stance":"increases_risk","outcome":"normalized_outcome"}],
  "headline": {"text":"Short factual headline.","claimIds":["c1"]},
  "reported": [{"text":"What the source reports.","claimIds":["c1"]}],
  "mechanism": [],
  "category": "other",
  "gaps": [{"text":"A bounded description of missing evidence.","searched":["actual query"]}]
}
```

Allowed stances are `increases_risk`, `no_effect_observed`, `mechanism`, `uncertain`; categories follow `shared/contract.ts`. Quotes can contain label advice; claim and sentence prose cannot. Empty claims are allowed to record an unsuccessful search. All supplied claims still require verdicts.

Independent judge files in `verdicts/<pair>.json`:

```json
{"pair":"a__b","judge":"independent model id","claims":[{"id":"c1","support":"supports","rationale":"Why the entire claim is supported."}],"sentences":[{"path":"headline","support":"supports"},{"path":"reported.0","support":"supports"}]}
```

Claim verdicts allow `supports|partial|does_not_support|contradicts|overstated`. Sentence verdicts allow `supports|does_not_support`. Use paths `headline`, `reported.N`, `mechanism.N`; alternatively `index` can be a path or a zero-based index across headline, reports, mechanisms. Every claim and sentence requires exactly one verdict. The validator checks schemas, IDs, source references, translation presence, banned advice words, headline at most 25 words and other prose at most 40 words.

## Card acceptance and slices

The builder imports `quoteMatches` from `server/agent/verify.ts` and accepts only matched quotes with `supports`. It never invokes the verifier's judge function. Sentences must be judged supported and cite only accepted claims. An unsupported headline blocks the card rather than inventing a replacement. Conflicts need a judged sentence citing both sides. Zero accepted claims are listed in `empty.json`; other build failures are in `artifacts/M10b-build-blocked.json`.

Shared depth and signal functions count both FDA labels and EU SmPCs as regulatory evidence. Non-English quotations use their English rendering for signal wording; quote verification uses the original text. Pharmacist questions resolve curated or catalogue display names. Existing accepted evidence files remain unchanged.

Cards have `origin: batch`, explicit curator/judge/synth IDs and `generatedAt`; their records have an empty replay trace. Existing Muse records are preserved byte-for-byte. `index.json` is rebuilt over all eight available cards. `slices/slice-0.json` through `slice-4.json` divide the final selection into five balanced assignments. Reviewed EU additions stay in their separate file.

Five round-robin slices put alcohol pairs first in every curator assignment. `slices/eu-reviewed.json` lists all 28 reviewed pairs for EU additions. Historical example packets remain available for validating their existing claims, even when the pair is excluded from the new selection because batch evidence already exists.

Server and UI derivation count FDA and EU SmPC claims as regulatory label evidence. Non-English sources use `quoteEnglish` for signal wording, falling back to the original quote. Quote verification still checks the original-language text.


## EMA expansion

Fetch a bounded set with `npx tsx scripts/ema-smpc.ts --inn=pregabalin,apixaban,duloxetine,aripiprazole,varenicline,perampanel,daridorexant,abacavir,abiraterone,adalimumab,aliskiren,apalutamide,bexarotene,buprenorphine,midazolam`. Requires Poppler `pdftotext` on PATH. Without `--inn`, it attempts the existing EU target set. Raw cache files and their original-byte SHA-256 manifest are ignored under `data/raw/eu-more/`. Existing snapshots are reused. Remove a processed record and its raw cache deliberately to refresh.

Run `npx tsx scripts/enrich-eu-packets.ts` to preserve existing sources and append relevant EMA sections without network calls. `npx tsx scripts/curate-ema.ts` reproduces the eight Codex-authored draft additions. Both steps are idempotent. `data/batch/ema-pending.json` lists claims requiring independent non-Meta judgment. Existing verdicts for amended drafts are stale until they cover the added `cEU1` claim and reported sentence. Run `check-claims.ts` on all pending pairs before judging, then the normal validator and builder after new verdicts exist. No pending claim is shipped as accepted evidence.

The bundler now includes EU section text for offline source verification. The legacy `rebuild-batch-index.ts` audits requested-origin records and rejects existing batch-origin evidence; when no cards change, verify index levels directly instead of rewriting evidence to satisfy that legacy audit.

Verify cached original bytes, section hashes, pending quotes against both full sections and packets, and index levels with `npx tsx scripts/verify-ema.ts`. It also checks the downloaded PDF text for explicit copyright notices requiring further review.
