# Catalog sources and reproducibility

## M7.1 international registry expansion

This section supersedes M7's EU market labels and 400 KB budget below. Polish registry and existing owner overrides now use PL. EU is reserved for an EU-wide source; no such source or Spanish source is included in this build.

All snapshots were retrieved 2026-11-03. The machine-readable policies in `catalog-licenses.json` record licence, attribution, source update date and terms URL. Compressed original downloads, including policy evidence, are in `raw/m71/`. Both original-byte and stored-byte hashes are in its manifest and the combined reproducibility manifest. Hashes and download URLs are also listed at the end of this document.

France: Base de données publique des médicaments (BDPM), CIS product and composition files, updated 03/11/2026. [Download and reuse terms](https://base-donnees-publique.medicaments.gouv.fr/telechargement). Licence Ouverte with the site's BDPM conditions: cite the source and update date, preserve meaning, maintain currency and imply no ANSM, HAS or UNCAM endorsement. This is a filtered name index, not an official reuse or a statement of authorization. Original names remain in the snapshots. Decode strict UTF-8 where valid, otherwise Windows-1252, the compatible Latin-1 encoding used by these downloads. Join tab-separated headerless CIS and composition records by CIS identifier; keep marketed products with one distinct SA active-substance name. Remove the comma-delimited dosage-form suffix from product names. English names are exact confirmed RxNorm identities; no clinical content is transformed.

Italy: Agenzia Italiana del Farmaco, Anagrafica Farmaci and Principi Attivi per confezione, previous-day daily release accessed 2026-11-03. [AIFA lists](https://www.aifa.gov.it/liste-dei-farmaci), [current licence](https://www.aifa.gov.it/open-data). CC BY 4.0, attribution required. Attribution: AIFA, retrieved 2026-11-03; filtered and mapped to RxNorm. AIFA describes these data as provisional and descriptive. Join CODICE_AIC across both semicolon CSVs, keep Autorizzata records with one active substance, exclude combination expressions. No assumption of current marketing is made for Italy.

Canada: Health Canada Drug Product Database, human single-active-ingredient products with Marketed status. [Official dataset metadata](https://open.canada.ca/data/api/action/package_show?id=bf55e42a-63cb-4556-bfd8-44f26e5a36fe) confirms Open Government Licence - Canada, [version 2.0](https://open.canada.ca/en/open-government-licence-canada). Required attribution: Contains information licensed under the Open Government Licence – Canada. Health Canada, DPD, API snapshot retrieved 2026-11-03. Join drugproduct, activeingredient and status JSON by drug_code; require number_of_ais = 1 and one distinct ingredient. The licence imposes no endorsement and excludes third-party rights. No images, labels or logos are redistributed.

Norway: Direktoratet for medisinske produkter, FEST Rekvirent 2.5.1, HentetDato 2026-10-27T12:25:20. [Official download page](https://www.dmp.no/en/about-us/distribution-of-data-on-medicinal-products/electronic-prescription-support-system-fest/downloading-fest-and-safest). The saved official implementation guide states that FEST may be reused under NLOD, [Norwegian Licence for Open Government Data](https://data.norge.no/nlod/en/2.0). Attribution: DMP, FEST, update and retrieval dates above; filtered and mapped, no endorsement. The public human Rekvirent ZIP needs no credentials; restricted Farmalogg and NAV/HELFO extracts are not accessed. Join active LegemiddelMerkevare records through RefVirkestoffMedStyrke and RefVirkestoff. Require one substance identity, use Varenavn and NavnEngelsk, falling back to Navn. Exclude veterinary records. This is a versioned discovery index; refresh from DMP for current regulatory status.

US: FDA openFDA drug/ndc bulk export dated 2026-11-03. [Licence](https://open.fda.gov/license/) is public domain with CC0 dedication, subject to [API terms](https://open.fda.gov/terms/). FDA credit is appreciated rather than required. Attribution supplied: U.S. FDA, openFDA NDC, retrieved 2026-11-03. Keep human OTC/prescription products with exactly one active ingredient and no past marketing end date. Distinct product_ndc counts rank brands as a commonness signal ahead of lexical ties and supplement RxNorm's brand coverage. NDC listing is not an approval or clinical claim.

Supplements: NIH Office of Dietary Supplements DSLD [v9 API documentation and CC0 declaration](https://api.ods.od.nih.gov/dsld/v9/). No attribution obligation under CC0; credit supplied to NIH ODS DSLD, retrieved 2026-11-03. Selection is intentionally bounded by the owner's required common ingredient scope, recorded as manual query selectors in the sole overrides file. For each selector, request ingredient-groups with method=factsheet; accept exact group-name equality after case/diacritic/punctuation folding. Include all exact groups, merge identical normalized names, exclude groups containing additional ingredient names. These are single ingredient-group discovery entries, not assertions that all matching product labels are single-ingredient. Names and synonyms come only from DSLD, never from model output. Retain at most 24 source synonyms containing the group name, shorter than 70 characters, ranked by length then lexical order. This avoids dose abbreviations and limits payload. Whey protein isolate is a DSLD synonym; no invented protein-powder synonym was added. Supplemental entries have kind=supplement, deterministic DSLD search links and no substanceId or reviewed-evidence linkage. No label counts or popularity claims are inferred from ingredient-group response scores.

Mapping uses exact RxNorm IN vocabulary and M7's cached exact RxNav confirmations. Additional French/Italian salt and ending rules only generate candidates; an ambiguous or absent exact identity is logged, never guessed. FEST's explicit English names take precedence. Only ingredients in the existing selected medicine set are expanded; matches outside that set are logged separately. M7's 1,000-ingredient selection remains reproducible.

Brand caps are six per ingredient for each new market and US, plus owner overrides. The original Polish allowance of eight plus overrides is preserved to retain all M7 checks. Registry product counts rank new brands; PL keeps M7's registration-ranked subset. This yields a payload below 700,000 bytes. Markets indicate source registries, not a promise of present availability. Rebuild offline with `npx tsx scripts/build-catalog.ts`; verify identical output and input hashes with `npx tsx scripts/verify-catalog-m71.ts`. `--download` only fetches missing inputs. Refreshes require an intentional new snapshot and matching licence/update metadata.

Built from registry records, without a language model. The only hand-written names are in `catalog-overrides.json`. Brand markets describe the source registry, not present availability in every country.

## Polish register

Source: URPL's Rejestr Produktów Leczniczych, published by Centrum e-Zdrowia. Downloaded 2026-11-03 from https://rejestry.ezdrowie.gov.pl/api/rpl/medicinal-products/public-pl-report/get-csv, linked by https://rejestry.ezdrowie.gov.pl/registry/rpl. It includes product identifiers, registered names, substances, pharmaceutical forms, ATC codes, and human/veterinary status.

License: **CC BY 4.0**, verified in https://api.dane.gov.pl/1.4/datasets/397/ and preserved in `../artifacts/rpl-metadata.json`. Attribution: Centrum e-Zdrowia / URPL, Rejestr Produktów Leczniczych, accessed 2026-11-03. This catalog filters and transforms the original data. The metadata requests a timestamp, supplied here. License text: https://creativecommons.org/licenses/by/4.0/.

The original CSV is over 5 MB and is gitignored. `raw/rpl.csv.gz` contains the identical compressed bytes and is committed for offline builds. Its uncompressed SHA-256 is in `../artifacts/M7-catalog-counts.json`. No parser dependency was added; the build uses a CSV state machine supporting quoted separators, doubled quotes, and embedded newlines.

## RxNorm / RxNav

Source: U.S. National Library of Medicine. https://rxnav.nlm.nih.gov/REST/allconcepts.json?tty=IN supplies English normalized ingredient names and RxCUIs. Exact `rxcui.json?name=...&search=0` queries confirm selected ingredients. `Prescribe/rxcui/{id}/related.json?tty=BN%20SBD` supplies US brands and branded drug records. Keep BN names only when at least one related SBD has a single ingredient, excluding combination brands such as Augmentin. RxNorm's prescribable subset excludes drugs for exclusive veterinary use, documented at https://www.nlm.nih.gov/research/umls/rxnorm/docs/prescribe.html. The optional US supplement uses `Prescribe/allconcepts.json?tty=IN`.

RxNorm normalized names and codes created by NLM are public domain: https://www.nlm.nih.gov/research/umls/rxnorm/docs/termsofservice.html. RxNav's non-proprietary API does not require a license, except the proprietary endpoint, which this build never uses: https://lhncbc.nlm.nih.gov/RxNav/TermsofService.html. The full downloadable RxNorm release has separate UMLS licensing; it is not used here.

This product uses publicly available data courtesy of the U.S. National Library of Medicine (NLM), National Institutes of Health, Department of Health and Human Services; NLM is not responsible for the product and does not endorse or recommend this or any other product.

Responses are cached under `raw/rxnav/`. Filename keys are SHA-256 of the REST endpoint including query parameters; `ingredients.json` is the bulk IN response. `raw/manifest.json` records each required input's URL and SHA-256 of its decoded content. Requests start at least 110 ms apart, below the published 20 requests/second limit, with eight concurrent workers and retry backoff for 429/5xx. Existing cache entries are immutable inputs; a normal build makes no network requests.

## Selection and mapping

1. Keep human products with one named active ingredient. Exclude combinations and products marked veterinary, homeopathic, vaccines, allergen extracts, blood products, contrast media, or radiopharmaceuticals. Exclusions use registry names and ATC prefixes, specified in `scripts/build-catalog.ts`.
2. Generate candidates by stripping Latin salt words and applying Latin ending rules. Accept only an unambiguous exact match against the RxNorm IN vocabulary, then confirm the selected IN with RxNav exact string lookup. Manual INN/USAN synonym pairs live in the overrides file. No fuzzy-only match is accepted because spelling similarity does not prove ingredient identity. Unresolved names, including plant extracts and complex biological names, remain in `../artifacts/M7-unmapped.json` rather than being guessed.
3. Merge salt variants by confirmed RxCUI. Rank ingredients by number of distinct Polish product identifiers, descending; RxCUI lexical order breaks ties. Take the first 1,000. Include every curated drug and manual override ingredient even if it falls below that cutoff. Thus the result can slightly exceed 1,000.
4. If fewer than 1,000 are selected, scan eligible prescribable US IN names alphabetically and add those with at least **N=2** distinct RxNorm BN names until 1,000. This snapshot already has enough Polish ingredients, so no US-only supplement is needed.
5. Remove trailing dose text beginning with a whitespace-separated number from Polish product names before grouping registrations. To limit payload size, retain at most six US and eight EU registry brands per ingredient, plus every manual override. EU brands rank by distinct Polish registrations for that product name, then English lexical order. US brands use lexical order. Full source responses remain cached. Synonyms retain mapped Polish/Latin substance names and manual generic synonyms. Brands for combination products are excluded at the Polish input boundary. The explicitly requested Adderall mixed-salts mapping is a manual exception.

The English display name is the confirmed RxNorm IN name, including USAN spelling where it differs from INN. The contract's `name` field can represent this without a type change. DailyMed URLs are deterministic searches using that name. Counts in `../artifacts/M7-catalog-counts.json` count brand associations per ingredient and market, so a dual-market name contributes to both market counts.

Offline rebuild: `npx tsx scripts/build-catalog.ts`. To populate missing caches: `npx tsx scripts/build-catalog.ts --download`. Then `npm run bundle:data` embeds the static catalog for the API without runtime filesystem reads. `npm run build:web` also runs that bundler.

## M7.2 decoding and brand hygiene

The build validates original decompressed bytes against a source-specific charset before invoking the international adapter: Polish RPL, RxNav, AIFA CSV, Canadian DPD JSON, openFDA JSON and DSLD JSON are UTF-8; FEST XML explicitly declares UTF-8. BDPM CIS and composition snapshots are Windows-1252, compatible with their Latin-1 text. The [BDPM format document](https://base-donnees-publique.medicaments.gouv.fr/download/file/Contenu_et_format_des_fichiers_telechargeables_dans_la_BDM_v5.pdf), dated 13/10/2026, specifies headerless tab-separated text but does not name a charset in its extracted text. Windows-1252 is confirmed against the saved bytes and accented words, rather than attributed to an undocumented declaration. The existing international decoder produces identical text for these validated snapshots. UTF-8 decoding is fatal on malformed bytes. Gzip is lossless; it does not decode text. The serialized output must contain zero U+FFFD, U+00C3 or U+00C5 characters. This deliberately strict output rule follows M7.2's requested mojibake guard.

The committed M7.1 catalogue and Polish snapshot already contain correct UTF-8 `Fervex ból i gorączka`, with no replacement characters or requested mojibake markers. The reported corrupted display could not be reproduced from those bytes. No speculative Windows-1250 conversion or snapshot replacement was applied.

After the existing deterministic registry caps and overrides, reviewed medicines recover every cached RxNorm BN backed by a single-ingredient SBD. This avoids ranking familiar US brands below generic product descriptions. Combination-only names remain excluded except the existing Adderall override. No hand-written brand was added.

Cleanup folds case, decomposed diacritics, Polish ł, apostrophes and punctuation. It removes a brand whose folded name starts with the ingredient display name or any ingredient synonym, including company-generic names. It then removes names consisting entirely of the following descriptor tokens:

`pain relief reliever fever cold allergy sleep aid extra strength children childrens infant infants baby adult adults tablet tablets caplet caplets capsule capsules injection solution oral generic and for of the chewable coated extended release maximum regular liquid suspension drops syrup gel cream topical`

A distinctive remaining token preserves the brand, for example Tylenol Extra Strength. These are text hygiene rules, not clinical classifications. Filtering happens after capped registry selection and does not refill every market from lower-ranked records.

Identical folded brand names merge their markets in sorted order. Mixed-case source spelling wins over all-caps spelling; otherwise source order breaks ties. Names remaining entirely uppercase become Title Case for display, with the exact original added to ingredient search synonyms. Existing ingredient synonyms remain searchable when generic brand rows are removed. The rule applies to overrides too. All-caps acronyms such as APAP therefore display as Apap.

Run `npx tsx --test scripts/build-catalog.test.ts` for decoding, hygiene, market merging, source-backed common-US-brand coverage, an identical offline rebuild and snapshot hash verification. M7.2 counts and source audit are in `../artifacts/M7.2-*.json`. M7 and M7.1 artifacts remain historical records.

<!-- M7.1 snapshot hashes -->

All following inputs retrieved 2026-11-03. SHA-256 hashes are of the original download bytes before local gzip storage. Stored-file hashes, licence, attribution and update date for every input are in `raw/m71/manifest.json` and `../artifacts/M7.1-reproducibility.json`.

| File | URL | SHA-256 |
| --- | --- | --- |
| data/raw/m71/policyfr.gz | https://base-donnees-publique.medicaments.gouv.fr/telechargement | 6e80ab8ece78fba4803d5062eae7a981f1dd1ab3c1bad209e45769ced95f2282 |
| data/raw/m71/policyit.gz | https://www.aifa.gov.it/open-data | b3c023b8598c9f20b3f40ee61ba2bdeb5f334c8e47dc1f0ba0e1041ee0cc7af5 |
| data/raw/m71/policyca.gz | https://open.canada.ca/data/api/action/package_show?id=bf55e42a-63cb-4556-bfd8-44f26e5a36fe | 682cbcf107a9ae656ce549f8351b4c89b107308fc84c26474f838443d44e9741 |
| data/raw/m71/policyno.gz | https://www.dmp.no/contentassets/3cb9b85e742745d4b1db7d899eb987b7/202511_implementeringsveiledning-fest-v3.6.pdf | dc577ee9f16c9647091a73affd63f87510b617646ba0ab596426b7e53fdf066d |
| data/raw/m71/policyus.gz | https://open.fda.gov/license/ | 7fda0041a24f8d7139a1781d4462ae39643a2ee6f3b0f079946c989a8e1982d2 |
| data/raw/m71/policydsld.gz | https://api.ods.od.nih.gov/dsld/v9/ | ef585ac96397d12886420a88fd9f0359d4d111707e9525f9c3385ec2431dbae7 |
| data/raw/m71/fr.gz | https://base-donnees-publique.medicaments.gouv.fr/download/file/CIS_bdpm.txt | 97dcd8fc406e1c0bfb969cad6f66bda489eeede1c9910e2813dd65e1ab71d752 |
| data/raw/m71/frpa.gz | https://base-donnees-publique.medicaments.gouv.fr/download/file/CIS_COMPO_bdpm.txt | 18c2eb506602946b8a5010fd56a5339e6571ba8f76480b62dc751dd26c150716 |
| data/raw/m71/it.gz | https://drive.aifa.gov.it/farmaci/confezioni_fornitura.csv | 74026026fe11244345a09a2262e4b98b685dec4d2a8ca5c870f6eb89d39dc0bc |
| data/raw/m71/itpa.gz | https://drive.aifa.gov.it/farmaci/PA_confezioni.csv | 314d80792b55622767fa0a14761010593db43b05f426f16e2297253d1141e26a |
| data/raw/m71/cast.gz | https://health-products.canada.ca/api/drug/status/?lang=en&type=json | 409a1cd3c32866017460ed4d832c29e5ea51ff70a1a0fa0fb461fe32a01dc581 |
| data/raw/m71/caai.gz | https://health-products.canada.ca/api/drug/activeingredient/?lang=en&type=json | c765b76f47d93a7a94da7529336e81f728a2c4ac971faff07be58bf38a3607c4 |
| data/raw/m71/ca.gz | https://health-products.canada.ca/api/drug/drugproduct/?lang=en&type=json | 27c733bff8170c3d04a5875e79ce227ac9920d318166507c3533bca6c6029bee |
| data/raw/m71/no.gz | https://www.dmp.no/globalassets/documents/om-oss/distribusjon-av-legemiddeldata/fest/festfiler/fest251.zip | c9a5cdc694a52c956a754d5557e211225e983caf6c59c494e08f71a8d472ab4e |
| data/raw/m71/ndc.gz | https://api.fda.gov/download.json | 9e54f63a1b2b59e5b45b66798806c2b0c724687d128c53165c683f9adf8bb87f |
| data/raw/m71/ndcbulk.gz | https://download.open.fda.gov/drug/ndc/drug-ndc-0001-of-0001.json.zip | daed47c3536733b307305ab8ec414192b17a179ca7de00c32d63617eee1c48fd |
| data/raw/m71/dsld0.gz | https://api.ods.od.nih.gov/dsld/v9/ingredient-groups?method=factsheet&term=whey&size=100 | 9c65ac390d32275629e9882baafe9d8633d9e27b4b0fa3f0ac7f5668504b9b66 |
| data/raw/m71/dsld1.gz | https://api.ods.od.nih.gov/dsld/v9/ingredient-groups?method=factsheet&term=creatine&size=100 | 515298476d25e27a336c707478f5dd53b61104f51c4db82160377dd2a4337a46 |
| data/raw/m71/dsld2.gz | https://api.ods.od.nih.gov/dsld/v9/ingredient-groups?method=factsheet&term=caffeine&size=100 | 1366ed7082a37bab6dc42cb3e32b026908ae12b39712aff25b2e7603f62fa09a |
| data/raw/m71/dsld3.gz | https://api.ods.od.nih.gov/dsld/v9/ingredient-groups?method=factsheet&term=melatonin&size=100 | 143d8943445c48f2f2ec0c74a79f4c1981136f93469901eecbfe2ba85595263b |
| data/raw/m71/dsld4.gz | https://api.ods.od.nih.gov/dsld/v9/ingredient-groups?method=factsheet&term=St%20John%E2%80%99s%20wort&size=100 | c421b33da3eb79c80a9c92d8cb8415fe08b5ca066c13dcb85f5cee7b3a4bce0d |
| data/raw/m71/dsld5.gz | https://api.ods.od.nih.gov/dsld/v9/ingredient-groups?method=factsheet&term=fish%20oil&size=100 | 2b725dd6e478523eae14128644500ca3186b4fef0fea29460e429247c5246625 |
| data/raw/m71/dsld6.gz | https://api.ods.od.nih.gov/dsld/v9/ingredient-groups?method=factsheet&term=omega-3&size=100 | 72c0cc2bcf567ef14f7cff92ef90391b7b533664ce919780524f295f6c66665e |
| data/raw/m71/dsld7.gz | https://api.ods.od.nih.gov/dsld/v9/ingredient-groups?method=factsheet&term=vitamin%20D&size=100 | 4cdd4150c78549842a614370b9bd30c999a321176f804b92882274cf247a9d9e |
| data/raw/m71/dsld8.gz | https://api.ods.od.nih.gov/dsld/v9/ingredient-groups?method=factsheet&term=magnesium&size=100 | a9e383b4712d095b035fdacc4b5ae8497b1044304662e972da7c46b207d923e2 |
| data/raw/m71/dsld9.gz | https://api.ods.od.nih.gov/dsld/v9/ingredient-groups?method=factsheet&term=ginkgo&size=100 | 5dbbc8e61cfce31915783d8668aa957f0ebd9c7b5f6c1bf5fb1803776ea90802 |
| data/raw/m71/dsld10.gz | https://api.ods.od.nih.gov/dsld/v9/ingredient-groups?method=factsheet&term=ashwagandha&size=100 | 461224e9839d0225559529ebd32d6ef821f99db6b8a626e9789850a79930e8c9 |
| data/raw/m71/dsld11.gz | https://api.ods.od.nih.gov/dsld/v9/ingredient-groups?method=factsheet&term=turmeric&size=100 | 2fb73053b3c24c5dddefb66c0475f2eda153fe0f7848d62a13d2403bca804461 |
| data/raw/m71/dsld12.gz | https://api.ods.od.nih.gov/dsld/v9/ingredient-groups?method=factsheet&term=curcumin&size=100 | da9a8feb2ad95bfda153e8268d85f10ee3a687d3c8d4fb184f71f88e10393108 |


## M10c FEST interaction attribution

DMP, FEST, 2026-10-27; NLOD. Direktoratet for medisinske produkter, public human Rekvirent 2.5.1, HentetDato `2026-10-27T12:25:20`, retrieved 2026-11-03 and reused from the M7.1 source snapshot. Public Rekvirent 2.5.0 and institution 2.5.1 distributions were also inspected on 2026-11-04. Original download and stored-file SHA-256 hashes are in `raw/fest/manifest.json`.

The [FEST implementation guide v3.6](https://www.dmp.no/contentassets/3cb9b85e742745d4b1db7d899eb987b7/202511_implementeringsveiledning-fest-v3.6.pdf), section 1, permits FEST information reuse under NLOD; sections 8.1.1 and 8.1.2 describe interaction substance groups and fields. The extraction preserves Norwegian consequence and mechanism text, omits management text, and maps explicit concrete substance members to catalogue identities. This is a filtered and mapped reuse; DMP does not endorse Evidient. See `../artifacts/M10c-fest-report.md` and `../artifacts/M10c-fest-design.md`.


## EU SmPC expansion, checked 2026-11-04

EMA is added as country `EU`, language `en`. [EMA legal notice](https://www.ema.europa.eu/en/about-us/about-website/legal-notice) permits reproduction and distribution of excerpts with EMA attribution, including commercial use; material carrying third-party rights is excluded. This is a conditional reuse permission, not a CC licence. Selected English EPAR product-information documents carry no separate third-party copyright notice. Each snapshot and packet cites EMA, its product, URL and access month. No logo or endorsement is used.

Discovery uses EMA's [official JSON downloads](https://www.ema.europa.eu/en/about-us/about-website/download-website-data-json-data-format): medicine records join product-information documents on `ema_product_number`. Only authorised human products with exact single-INN matches are eligible. Non-generic products precede generics, then product name orders candidates. The first complete SmPC in a PDF is selected; other formulations and patient leaflets are excluded. Whitespace is normalised and standalone PDF page numbers removed. Product-specific findings are not generalised to every formulation. `documentUpdatedAt` is the document metadata update, not an inferred regulatory revision.

This bounded pass fetched 14 products and 28 sections. Raw PDFs, JSON indexes and their byte hashes stay in ignored `data/raw/eu-more/`; `data/sources/eu/ema-manifest.json` retains download URLs, original-byte SHA-256 and retrieval times. Section and combined-text hashes remain in each product record. The manifest records one failed product, buprenorphine, whose first selected product did not yield complete section boundaries. It is not substituted silently.

Candidate decisions:

| Source | Decision and evidence |
| --- | --- |
| EMA | Added, conditional attributed reproduction under the legal notice above. |
| Ireland HPRA | Skipped. [Reuse terms](https://www.hpra.ie/transparency/re-use-of-public-sector-information) require an application and approval before reuse, generally under CC BY 4.0. No application was submitted. |
| Italy AIFA | Deferred. [Open data](https://www.aifa.gov.it/open-data) licenses catalog downloads CC BY 4.0. [RCP documentation](https://www.aifa.gov.it/riassunto-caratteristiche-e-foglio-illustrativo) establishes access through the medicines database but does not establish the same licence for individual RCP documents. The legal-notice endpoint also failed certificate validation during this pass; no TLS bypass was attempted. Do not extend the catalog licence to RCPs without confirmation. |
| Poland URPL / CeZ RPL | Deferred. [Dataset metadata](https://api.dane.gov.pl/1.4/datasets/397/) confirms CC BY 4.0 for RPL data with timestamp attribution. That metadata does not explicitly license attached manufacturer ChPL documents. Existing catalog reuse remains valid; document reuse needs a scope confirmation. |
| Netherlands CBG | Deferred. The public Geneesmiddeleninformatiebank is accessible. [CBG copyright terms](https://english.cbg-meb.nl/service/copyright) apply CC0 to most website text with exceptions for separately copyrighted material and require no implied government agreement. Applicability to manufacturer SmPC PDFs on db.cbg-meb.nl was not established. No PDFs are redistributed under an assumed CC0 licence. |

No credentials, CAPTCHA bypass, model endpoints or Meta services were used for the expansion. Eight draft additions remain pending independent non-Meta judgment in `data/batch/ema-pending.json`; accepted evidence has not been changed.
